import { getInput } from '@actions/core';
import fs from 'fs';
import path from 'path';
import { formatCoveragePercentage } from './text-format.js';
import { DirectoryCoverage, FileCoverage, ExcludedCoverage } from './coverage-nodes.js';

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Parses an LCOV report and generates a Markdown coverage summary.
 *
 * Pipeline:
 *   1. `parse()`                  — build a cache tree from LCOV `SF:` records
 *   2. `findRoot`                 — unwrap container-path prefix layers
 *   3. `resolveRootFsPath`        — locate the matching directory on the filesystem
 *   4. `applyRecursiveMatchRules` — reconcile cache against filesystem; add 0%-coverage
 *                                   files and apply include/exclude patterns
 */
export class CoverageReport {
    constructor() {
        this.includePattern = RegExp(getInput('include_pattern', { required: true }));
        const excludeInput = getInput('exclude_pattern');
        // RegExp('(?!)') never matches — safe default when no exclude_pattern is given.
        this.excludePattern = excludeInput ? RegExp(excludeInput) : RegExp('(?!)');
        this.cache = new Map();
    }

    /**
     * Parses an LCOV string and populates the cache. Must be called before `generateReport()`.
     * Handles `SF:`, `DA:`, `LH:`, and `LF:` record types.
     *
     * @param {string} lcovInfo
     */
    parse(lcovInfo) {
        let currentFile;
        for (const line of lcovInfo.split('\n')) {
            const lineData = line.substring(3); // strip 3-char prefix, e.g. "SF:"
            if (line.startsWith('SF:')) {
                currentFile = resolveCachePath(this, lineData);
            } else if (line.startsWith('DA:')) {
                const parts = lineData.split(',');
                if (parts[1] === '0') {
                    currentFile.addUncoveredLine(parts[0]);
                }
            } else if (line.startsWith('LH:')) {
                currentFile.setLinesHit(lineData);
            } else if (line.startsWith('LF:')) {
                currentFile.setLinesFound(lineData);
            }
        }
    }

    /**
     * Generates a Markdown coverage report. Must be called after `parse()`.
     *
     * @returns {string}
     */
    generateReport() {
        const root = findRoot(this);
        if (root === null) {
            return `## Code Coverage Report - ${formatCoveragePercentage({ linesHit: 0, linesFound: 0 })} \n\n`;
        }

        // Falls back to '.' when no matching directory is found on the filesystem.
        const fsPath = resolveRootFsPath(root) ?? '.';
        applyRecursiveMatchRules(root, this.includePattern, this.excludePattern, fsPath);

        const metrics = Array.from(root.cache.values())
            .map(c => c.getMetrics())
            .reduce((acc, m) => ({ linesFound: acc.linesFound + m.linesFound, linesHit: acc.linesHit + m.linesHit }), { linesFound: 0, linesHit: 0 });

        return `## Code Coverage Report - ${formatCoveragePercentage(metrics)}

${Array.from(root.cache.values()).map(coverage => coverage.generateReport(0)).join('\n')}`;
    }
}

// ─── Private helpers ─────────────────────────────────────────────────────────

/**
 * Descends single-child `DirectoryCoverage` chains to find the first node with
 * more than one child — the true project root after stripping container path prefixes
 * (e.g. `/workspace/my-project/` → `my-project` → `src` → first multi-child node).
 *
 * Returns the `CoverageReport` itself when the chain ends at a single leaf file,
 * so `resolveRootFsPath` can fall back to searching from the working directory.
 * Returns `null` if the cache is empty.
 *
 * @param {CoverageReport|DirectoryCoverage} cacheObj
 * @returns {CoverageReport|DirectoryCoverage|null}
 */
function findRoot(cacheObj) {
    const cacheSize = cacheObj.cache?.size ?? 0;
    if (cacheSize > 1) return cacheObj;
    if (cacheSize === 0) return null;
    const onlyChild = cacheObj.cache.values().next().value;
    if (!(onlyChild instanceof DirectoryCoverage)) return cacheObj;
    return findRoot(onlyChild);
}

/**
 * Finds the filesystem path corresponding to the cache root.
 *
 * When `root` has no `filename` (i.e. `findRoot` returned the `CoverageReport`),
 * peeks at the first cache child: if it's a `DirectoryCoverage`, delegates to a
 * recursive call with that child; otherwise returns `'.'`.
 *
 * Otherwise, extracts the last path segment of `root.filename` and searches the
 * working directory tree for a directory with that name, validating the match by
 * checking that at least one known cache child exists inside it.
 *
 * @param {DirectoryCoverage|CoverageReport} root
 * @returns {string|null} Resolved path, or `null` if no match found.
 */
function resolveRootFsPath(root) {
    if (!root.filename) {
        const firstChild = root.cache?.values().next().value;
        if (firstChild instanceof DirectoryCoverage) {
            return resolveRootFsPath(firstChild);
        }
        return '.';
    }

    const rootDirName = root.filename.split('/').filter(Boolean).at(-1);
    const knownChildren = root.cache ? Array.from(root.cache.keys()) : [];
    const bestMatch = searchForDir('.', rootDirName, knownChildren);
	return bestMatch.path;
}

/**
 * Recursively searches `searchPath` for a directory named `targetName`.
 * Returns the best { path, matches } object found in the subtree.
 */
function searchForDir(searchPath, targetName, knownChildren, currentBest = { path: null, matches: -1 }) {
    let entries;
    try {
        entries = fs.readdirSync(searchPath);
    } catch {
        return currentBest;
    }

    for (const entry of entries) {
        const fullPath = `${searchPath}/${entry}`;
		
        let stats;
        try {
            stats = fs.statSync(fullPath);
        } catch {
            continue;
        }
        if (!stats.isDirectory()) continue;

        if (entry === targetName) {
            if (knownChildren.length > 0) {
                let fsEntries;
                try {
                    fsEntries = new Set(fs.readdirSync(fullPath));
                } catch {
                    fsEntries = new Set();
                }
                const matchCount = knownChildren.filter(child => fsEntries.has(child)).length;
				if (matchCount === knownChildren.length) {
					console.info(`Resolved coverage root '${targetName}' to filesystem path: ${fullPath} (${matchCount}/${knownChildren.length} children matched)`);
                    return { path: fullPath, matches: matchCount };
				}
				
				if (matchCount > currentBest.matches) {
					currentBest = { path: fullPath, matches: matchCount};
				}
            } else {
                console.info(`Resolved coverage root '${targetName}' to filesystem path: ${fullPath} (no children to validate)`);
                return { path: fullPath, matches: 0 };
            }
        }
		// Pass the globally tracking currentBest down into the subtree recursion
        currentBest = searchForDir(fullPath, targetName, knownChildren, currentBest);

        if (currentBest.matches === knownChildren.length) {
			return currentBest;
		}
    }

    return currentBest;
}

/**
 * Walks the filesystem at `fsPath` and reconciles it against `cacheObj.cache`:
 *
 * - Entries matching `excludePattern` are replaced with an `ExcludedCoverage` record.
 * - Files matching `includePattern` that are absent from the cache are inserted as
 *   `FileCoverage` with `linesHit = 0` (they had no coverage in the LCOV report).
 * - Empty directories are pruned from the cache after recursion.
 *
 * @param {DirectoryCoverage|CoverageReport} cacheObj
 * @param {RegExp} includePattern
 * @param {RegExp} excludePattern
 * @param {string} [fsPath='.']
 */
function applyRecursiveMatchRules(cacheObj, includePattern, excludePattern, fsPath = '.') {
    const entries = fs.readdirSync(fsPath);

    for (const entry of entries) {
        const fullPath = `${fsPath}/${entry}`;
        // Strip leading './' so patterns match the same paths seen in LCOV SF: records.
        const truncatedPath = fullPath.replace('./', '');
        const fileStats = fs.statSync(fullPath);

        if (excludePattern.test(truncatedPath)) {
            if (cacheObj.cache.has(entry)) {
                console.info(`Replacing cache entry with excluded record at highest matching level: ${truncatedPath}`);
            } else {
                console.info(`Adding excluded record for entry not in LCOV report: ${truncatedPath}`);
            }
            cacheObj.cache.set(entry, new ExcludedCoverage(entry));
            continue;
        }

        if (fileStats.isFile()) {
            if (!includePattern.test(truncatedPath)) continue;
            if (!cacheObj.cache.has(entry)) {
                const linesInFile = fs.readFileSync(fullPath, 'utf8').split('\n').length;
                console.info(`Adding uncovered file missing from LCOV report: ${fullPath}`);
                cacheObj.cache.set(entry, new FileCoverage(entry, linesInFile));
            }
        } else if (fileStats.isDirectory()) {
            if (!cacheObj.cache.has(entry)) {
                cacheObj.cache.set(entry, new DirectoryCoverage(entry));
            }

            const childCacheObj = cacheObj.cache.get(entry);
            if (childCacheObj instanceof DirectoryCoverage) {
                applyRecursiveMatchRules(childCacheObj, includePattern, excludePattern, fullPath);
                if (childCacheObj.cache.size === 0) {
                    console.info(`Removing empty directory from cache: ${fullPath}`);
                    cacheObj.cache.delete(entry);
                }
            }
        }
    }
}

/**
 * Returns `cacheObj.cache.get(key)`, creating the entry with `createFn(key)` if absent.
 *
 * @param {CoverageReport|DirectoryCoverage} cacheObj
 * @param {string} key
 * @param {(key: string) => FileCoverage|DirectoryCoverage} createFn
 * @returns {FileCoverage|DirectoryCoverage}
 */
function getOrCreate(cacheObj, key, createFn) {
    if (!cacheObj.cache.has(key)) {
        cacheObj.cache.set(key, createFn(key));
    }
    return cacheObj.cache.get(key);
}

/**
 * Navigates (and lazily creates) the cache tree for `filepath`, returning the
 * `FileCoverage` leaf. Called by `parse()` for each `SF:` record.
 *
 * Container path prefixes (e.g. `/workspace/my-project/`) are mirrored faithfully
 * into the tree; `findRoot()` strips them later. Leading slashes produce empty
 * segments that are skipped.
 *
 * @param {CoverageReport|DirectoryCoverage} cacheObj
 * @param {string} filepath
 * @returns {FileCoverage}
 */
function resolveCachePath(cacheObj, filepath) {
    // Normalize path separators so Windows LCOV files parse into the same tree.
    filepath = filepath.split(path.sep).join('/');
    const delimiterIndex = filepath.indexOf('/');
    if (delimiterIndex === -1) {
        return getOrCreate(cacheObj, filepath, () => new FileCoverage(filepath));
    }
    const directory = filepath.substring(0, delimiterIndex);
    const subPath = filepath.substring(delimiterIndex + 1);
    if (directory === '') {
        // Skip empty segment from a leading or double slash.
        return resolveCachePath(cacheObj, subPath);
    }
    const dirCoverage = getOrCreate(cacheObj, directory, () => new DirectoryCoverage(directory));
    return resolveCachePath(dirCoverage, subPath);
}
