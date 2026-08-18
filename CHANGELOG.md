# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [3.0.1] - 2026-08-18

### Changed

- Updated the root directory search algorithm to look for a perfect match of directory name and know child elements. It falls back to the closest match if no perfect match could be found. A perfect match short-circuits the search and returns immediately.

---

## [3.0.0] - 2026-07-24

### Added

- **`src/coverage-nodes.js`** — new module exporting three data-model classes that were previously private to `coverage-report.js`:
  - `DirectoryCoverage` — aggregates metrics from child nodes; metrics are lazily memoized after `applyRecursiveMatchRules` finishes.
  - `FileCoverage` — tracks line-level coverage for a single source file; consecutive uncovered line numbers are now collapsed into ranges (e.g. `5, 6, 7, 9` → `5-7, 9`).
  - `ExcludedCoverage` — null-object for files/directories excluded by `include_pattern` / `exclude_pattern`; always returns zero metrics so excluded entries do not inflate parent counts.
- **`formatCoveragePercentage`** helper exported from `src/text-format.js` — centralises the `"N of M lines covered ( X%)"` formatting that was previously duplicated as a private function in `coverage-report.js`.
- **Container-path stripping** (`findRoot` + `resolveRootFsPath`) — the action now correctly handles LCOV reports produced in CI environments (e.g. GitHub-hosted runners) where every `SF:` path is prefixed with an absolute container path such as `/workspace/my-project/`. The parser mirrors the full path into the cache tree, then `findRoot` descends single-child chains to locate the true project root, and `resolveRootFsPath` searches the local filesystem to confirm the match by validating known cache children.
- **Zero-coverage file detection** — `applyRecursiveMatchRules` now walks the filesystem and inserts `FileCoverage` records (with `linesHit = 0`) for any file matching `include_pattern` that was absent from the LCOV report entirely, ensuring files with no tests are surfaced rather than silently omitted.
- **Indented report output** — `generateReport(indentLevel)` now accepts a depth parameter and prefixes each heading with `&emsp;` HTML entities, producing a visually nested Markdown tree without relying on GitHub's collapsible `<details>` nesting alone.
- **Four new test cases** in `src/coverage-report.spec.js` covering: bare-filename LCOV paths, same-named directory disambiguation, single-file-in-single-directory resolution, and graceful fallback when the LCOV root directory cannot be found on the filesystem.

### Changed

- **`CoverageReport` refactored** — the class is now the top-level cache root (replacing the implicit `DirectoryCoverage('.')` root). `parse()` populates `this.cache` directly via the new `resolveCachePath` helper, and `generateReport()` runs the full pipeline (`findRoot` → `resolveRootFsPath` → `applyRecursiveMatchRules`) before rendering.
- **`exclude_pattern` is now optional** — previously `getInput('exclude_pattern', { required: true })` would fail if the input was omitted. The input now defaults to a never-matching regex (`(?!)`) so callers that only need `include_pattern` no longer have to supply a placeholder exclude pattern.
- **Report paths are now bare filenames** — each node in the rendered report shows only its own name (e.g. `file1`) rather than the full path from the working directory (e.g. `tmp_test_files/file1`), matching the tree structure of the `<details>` nesting.
- **Excluded-entry copy updated** — excluded files and directories now display `"Excluded from coverage report"` and `"Excluded based on your include_pattern and exclude_pattern settings."` (previously `"File excluded from coverage report"` / `"File is excluded from coverage report based on…"`).
- **`undici` dependency** updated from `6.27.0` to `6.28.0`.
- **`generateReport()` call deduplicated** in `src/index.js` — the report is now generated once into a `body` variable and reused for both the PR comment and commit comment paths.

### Removed

- `ExcludedFileCoverage` class (previously private to `coverage-report.js`) — replaced by the exported `ExcludedCoverage` in `src/coverage-nodes.js`.
- `DirectoryCoverage.findFiles()` method — superseded by the standalone `applyRecursiveMatchRules` function, which also handles the case where files exist on disk but are absent from the LCOV report.
- `DirectoryCoverage.get()` / `_getOrInsertComputed()` methods — replaced by the standalone `resolveCachePath` / `getOrCreate` helpers.
- `getFormattedCoveragePercentage` private function in `coverage-report.js` — moved and renamed to `formatCoveragePercentage` in `src/text-format.js`.

---
