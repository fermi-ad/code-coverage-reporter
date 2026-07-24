import { formatErrorText, formatWarningText, formatCoveragePercentage } from './text-format.js';

/**
 * Data model classes for the coverage tree. Each node in the tree is one of:
 *   - `DirectoryCoverage` — a directory that aggregates metrics from its children
 *   - `FileCoverage`      — a single source file with line-level coverage data
 *   - `ExcludedCoverage`  — a file or directory excluded by `include_pattern` / `exclude_pattern`
 *
 * All three classes share the same interface:
 *   - `getMetrics()`          → `{ linesFound: number, linesHit: number }`
 *   - `generateReport(indent)` → Markdown `<details>` block string
 *
 * `FileCoverage` additionally exposes setters (`addUncoveredLine`, `setLinesHit`,
 * `setLinesFound`) that are called by the LCOV parser as it reads each record.
 * `ExcludedCoverage` implements these as no-ops.
 */

// ─── Node classes ─────────────────────────────────────────────────────────────

/**
 * Represents a directory in the coverage tree. Its `cache` map holds child
 * entries keyed by bare filename (no path prefix), where each value is one of:
 *   - `FileCoverage`      — a source file with coverage data
 *   - `DirectoryCoverage` — a subdirectory (recursive)
 *   - `ExcludedCoverage`  — a file or directory excluded by pattern
 *
 * Metrics are aggregated bottom-up from all non-excluded descendants.
 */
export class DirectoryCoverage {
    constructor(filename) {
        this.filename = filename;
        this.cache = new Map(); // key: bare entry name, value: FileCoverage | DirectoryCoverage | ExcludedCoverage
        this.metrics = undefined; // lazily computed; see getMetrics()
    }

    getMetrics() {
        // NOTE: this.metrics is memoized on first call. This method must only be called
        // after applyRecursiveMatchRules() has finished mutating this.cache — calling it
        // earlier will permanently cache a stale (incomplete) result.
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

    /**
     * Returns the summary string used in the directory's `<summary>` heading.
     * When all children are excluded (linesFound === 0), a descriptive label is
     * returned instead of a percentage to avoid a misleading "0 of 0 lines" display.
     *
     * @returns {string}
     */
    headingSummary() {
        const metrics = this.getMetrics();
        if (metrics.linesFound === 0) {
            return 'Directory excluded from coverage report';
        }
        return `${formatCoveragePercentage(metrics)}`;
    }

    generateReport(indentLevel) {
        return `<details>
<summary>

${'&emsp;'.repeat(indentLevel)}### ${this.filename} - ${this.headingSummary()}

</summary> 
${Array.from(this.cache.values()).map(coverage => coverage.generateReport(indentLevel + 1)).join('\n')}
</details> 
`;
    }
}

/**
 * Tracks coverage data for a single source file. Populated either by `parse()`
 * (from LCOV `DA:`, `LH:`, `LF:` records) or by `applyRecursiveMatchRules()`
 * (for files that were present on disk but absent from the LCOV report, meaning
 * they have 0% coverage).
 */
export class FileCoverage {
    constructor(filename, linesFound = 0) {
        this.filename = filename;
        this.linesFound = linesFound;
        this.uncoveredLines = []; // line numbers with hit count === 0
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

    /**
     * Returns a formatted string describing uncovered lines for display in the
     * Markdown report. Consecutive uncovered line numbers are collapsed into
     * ranges (e.g. lines 5, 6, 7, 9 → "5-7, 9") to keep the output compact.
     *
     * Three possible return values:
     *  - Error text  — `linesHit === 0`: the file has no coverage at all.
     *  - `:shipit:`  — all lines are covered.
     *  - Range list  — one or more uncovered line ranges.
     *
     * @returns {string}
     */
    getUncoveredLinesPretty() {
        if (this.linesHit === 0) {
            return formatErrorText('This file is missing coverage.');
        }
        if (this.uncoveredLines.length === 0) {
            return ':shipit:';
        }
        this.uncoveredLines.sort((a, b) => a - b);
        const combinedLines = [];
        let start = null;
        let end = null;

        // Build a list of ranges by scanning the sorted uncovered line numbers.
        for (const line of this.uncoveredLines) {
            if (start === null) {
                // Begin a new range.
                start = line;
                end = line;
            } else if (line === end + 1) {
                // Extend the current range.
                end = line;
            } else {
                // Gap detected — flush the current range and start a new one.
                if (start === end) {
                    combinedLines.push(`${start}`);
                } else {
                    combinedLines.push(`${start}-${end}`);
                }
                start = line;
                end = line;
            }
        }
        // Flush the final range.
        if (start === end) {
            combinedLines.push(`${start}`);
        } else {
            combinedLines.push(`${start}-${end}`);
        }

        return `Uncovered lines: ${formatWarningText(combinedLines.join(', '))}`;
    }

    generateReport(indentLevel) {
        return `<details>
<summary>

${'&emsp;'.repeat(indentLevel)}### ${this.filename} - ${formatCoveragePercentage(this.getMetrics())}

</summary> 
${'&emsp;'.repeat(indentLevel + 1)} ${this.getUncoveredLinesPretty()}
</details> 
`;
    }
}

/**
 * Null-object representation of a file or directory that has been excluded from
 * the coverage report via `include_pattern` / `exclude_pattern`. `getMetrics()`
 * always returns zeros, so excluded entries do not contribute to any parent's
 * line counts.
 */
export class ExcludedCoverage {
    constructor(filename) {
        this.filename = filename;
    }

    getMetrics() {
        return {
            linesFound: 0,
            linesHit: 0
        };
    }

    generateReport(indentLevel) {
        return `<details>
<summary>

${'&emsp;'.repeat(indentLevel)}### ${this.filename} - Excluded from coverage report

</summary>
${'&emsp;'.repeat(indentLevel + 1)} Excluded based on your \`include_pattern\` and \`exclude_pattern\` settings.
</details>
`;
    }
}
