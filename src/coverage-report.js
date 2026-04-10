import { getInput } from '@actions/core';
import fs from 'fs';
import { formatErrorText, formatWarningText, formatPercentage } from './text-format.js';

function getFormattedCoveragePercentage(metrics) {
    let percentage;
    if (metrics.linesFound === 0) {
        percentage = 0.0;
    } else {
        percentage = (metrics.linesHit / metrics.linesFound) * 100;
    }
    return `${metrics.linesHit.toLocaleString()} of ${metrics.linesFound.toLocaleString()} lines covered ( ${formatPercentage(percentage)})`;
}

class ExcludedFileCoverage {
    constructor(filename) {
        this.filename = filename;
    }

    addUncoveredLine(_lineNumber) {
        // No-op since this file is excluded from coverage, so we don't track uncovered lines.
    }

    setLinesHit(_linesHit) {
        // No-op since this file is excluded from coverage, so we don't track hit lines.
    }

    setLinesFound(_linesFound) {
        // No-op since this file is excluded from coverage, so we don't track found lines.
    }

    getMetrics() {
        return {
            linesFound: 0,
            linesHit: 0
        };
    }

    generateReport() {
        return `<details>
<summary>

### ${this.filename} - File excluded from coverage report 

</summary> 
File is excluded from coverage report based on your \`include_pattern\` and \`exclude_pattern\` settings.
</details> 
`;
    }
}

class FileCoverage {
    constructor(filename, linesFound = 0) {
        this.filename = filename;
        this.linesFound = linesFound;
        this.uncoveredLines = [];
        this.linesHit = 0;
    }

    addUncoveredLine(lineNumber) {
        this.uncoveredLines.push(Number(lineNumber));
    }

    setLinesHit(linesHit) {
        this.linesHit = Number(linesHit);
    }

    setLinesFound(linesFound) {
        this.linesFound = Number(linesFound);
    }

    getMetrics() {
        return {
            linesFound: this.linesFound,
            linesHit: this.linesHit
        };
    }

    _getUncoveredLinesPretty() {
        if (this.linesHit === 0) {
            return formatErrorText('This file is missing coverage.');
        }
        this.uncoveredLines.sort((a, b) => a - b);
        const combinedLines = [];
        let start = null;
        let end = null;

        for (const line of this.uncoveredLines) {
            if (start === null) {
                start = line;
                end = line;
            } else if (line === end + 1) {
                end = line;
            } else {
                if (start === end) {
                    combinedLines.push(`${start}`);
                } else {
                    combinedLines.push(`${start}-${end}`);
                }
                start = line;
                end = line;
            }
        }
        if (start === end) {
            combinedLines.push(`${start}`);
        } else {
            combinedLines.push(`${start}-${end}`);
        }

        return this.uncoveredLines.length ? `Uncovered lines: ${formatWarningText(combinedLines.join(', '))}` : ':shipit:';
    }

    generateReport() {
        return `<details>
<summary>

### ${this.filename} - ${getFormattedCoveragePercentage(this.getMetrics())} 

</summary> 
${this._getUncoveredLinesPretty()} 
</details> 
`;
    }
}

class DirectoryCoverage {
    constructor(dir) {
        this.dir = dir;
        this.cache = new Map();
        this.metrics = undefined;
    }

    findFiles(includePattern, excludePattern) {
        fs.readdirSync(this.dir).forEach(file => {
            const fullPath = `${this.dir}/${file}`;
            const fileStats = fs.statSync(fullPath);
            if (includePattern.test(fullPath) && fileStats.isFile()) {
                const truncatedPath = fullPath.replace('./', '');
                let coverageRecord;
                if (excludePattern.test(fullPath)) {
                    console.info(`Adding excluded file coverage record: ${this.dir}/${file}`);
                    coverageRecord = new ExcludedFileCoverage(truncatedPath);
                } else {
                    console.info(`Adding single file coverage record: ${this.dir}/${file}`);
                    const linesInFile = fs.readFileSync(fullPath, 'utf8').split('\n').length;
                    coverageRecord = new FileCoverage(truncatedPath, linesInFile);
                }
                this.cache.set(file, coverageRecord);
            } else if (fileStats.isDirectory()) {
                const subCache = new DirectoryCoverage(fullPath);
                subCache.findFiles(includePattern, excludePattern);
                if (subCache.cache.size > 0) {
                    console.info(`Adding directory coverage record: ${this.dir}/${file}`);
                    this.cache.set(file, subCache);
                }
            }
        });
    }

    _getOrInsertComputed(key, computeFn) {
        if (!this.cache.has(key)) {
            this.cache.set(key, computeFn(key));
        }
        return this.cache.get(key);
    }

    get(filepath) {
        const delimiterIndex = filepath.indexOf('/');
        if (delimiterIndex === -1) {
            return this._getOrInsertComputed(filepath, () => new ExcludedFileCoverage(filepath));
        }
        const directory = filepath.substring(0, delimiterIndex);
        const subPath = filepath.substring(delimiterIndex + 1);
        return this._getOrInsertComputed(directory, () => new DirectoryCoverage(directory)).get(subPath);
    }

    getMetrics() {
        if (!this.metrics) {
            const allRecords = Array.from(this.cache.values());
            this.metrics = allRecords.map(coverage => coverage.getMetrics()).reduce((acc, metric) => {
                acc.linesFound += metric.linesFound;
                acc.linesHit += metric.linesHit;
                return acc;
            }, { linesFound: 0, linesHit: 0 });
        }
        return this.metrics;
    }

    _determineLineCount() {
        const metrics = this.getMetrics();
        if (metrics.linesFound === 0) {
            return 'Directory excluded from coverage report';
        }
        return `${getFormattedCoveragePercentage(metrics)}`;
    }

    generateReport() {
        return `<details>
<summary>

### ${this.dir.replace('./', '')} - ${this._determineLineCount()} 

</summary> 
${Array.from(this.cache.values()).map(coverage => coverage.generateReport()).join('\n')}
</details> 
`;
    }
}

function generateCoverageRoot() {
    const includePattern = RegExp(getInput('include_pattern', { required: true }));
    const excludePattern = RegExp(getInput('exclude_pattern', { required: true }));
    const root = new DirectoryCoverage('.');
    root.findFiles(includePattern, excludePattern);
    return root;
}

export class CoverageReport {
    constructor() {
        this.root = generateCoverageRoot();
    }

    parse(lcovInfo) {
        let currentFile;
        for (const line of lcovInfo.split('\n')) {
            const lineData = line.substring(3);
            if (line.startsWith('SF:')) {
                currentFile = this.root.get(lineData);
            } else if (line.startsWith('DA:')) {
                const parts = lineData.split(',');
                const lineNumber = parts[0];
                const hits = parts[1];
                if (hits === '0') {
                    currentFile.addUncoveredLine(lineNumber);
                }
            } else if (line.startsWith('LH:')) {
                currentFile.setLinesHit(lineData);
            } else if (line.startsWith('LF:')) {
                currentFile.setLinesFound(lineData);
            }
        }
    }

    generateReport() {
        return `## Code Coverage Report - ${getFormattedCoveragePercentage(this.root.getMetrics())} 

${Array.from(this.root.cache.values()).map(coverage => coverage.generateReport()).join('\n')}`;
    }
}
