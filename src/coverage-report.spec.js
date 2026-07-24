import { CoverageReport } from './coverage-report.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

function generateTmpTestDir() {
    fs.mkdirSync('tmp_test_files');
    fs.writeFileSync('tmp_test_files/file1', '');
    fs.writeFileSync('tmp_test_files/file2', '');
    fs.writeFileSync('tmp_test_files/file3', '');
    fs.writeFileSync('tmp_test_files/file4.excluded', '');
    fs.mkdirSync('tmp_test_files/inner_dir');
    fs.writeFileSync('tmp_test_files/inner_dir/file1', '');
}

const mockLcovInfo = `TN:mock test suite
SF:tmp_test_files/file1
DA:1,1
DA:2,4
DA:3,2
DA:4,0
DA:5,1
DA:6,0
DA:7,0
DA:8,0
LH:4
LF:8
end_of_record
SF:tmp_test_files/file3
DA:1,0
DA:2,4
DA:3,25
DA:4,0
DA:5,0
DA:6,0
DA:7,0
DA:8,2
DA:9,3
DA:10,0
DA:11,223
DA:12,0
DA:123,0
LH:5
LF:13
end_of_record
SF:tmp_test_files/inner_dir/file1
DA:1,1
DA:2,4
DA:3,2
DA:4,2
DA:5,1
DA:6,1
DA:7,5
DA:8,7
LH:8
LF:8
end_of_record
SF:tmp_test_files/unmapped_dir/unmapped_file
DA:1,1
LH:0
LF:1
end_of_record
`;

const expectedReport = `## Code Coverage Report - 17 of 31 lines covered ( :no_entry: 54.84%)

<details>
<summary>

### file1 - 4 of 8 lines covered ( :no_entry: 50.00%)

</summary>
&emsp; Uncovered lines: :warning: 4, 6-8
</details>

<details>
<summary>

### file3 - 5 of 13 lines covered ( :no_entry: 38.46%)

</summary>
&emsp; Uncovered lines: :warning: 1, 4-7, 10, 12, 123
</details>

<details>
<summary>

### inner_dir - 8 of 8 lines covered ( :gem: 100.00%)

</summary>
<details>
<summary>

### &emsp;file1 - 8 of 8 lines covered ( :gem: 100.00%)

</summary>
&emsp;&emsp; :shipit:
</details>

</details>

<details>
<summary>

### unmapped_dir - 0 of 1 lines covered ( :no_entry: 0.00%)

</summary>
<details>
<summary>

### &emsp;unmapped_file - 0 of 1 lines covered ( :no_entry: 0.00%)

</summary>
&emsp;&emsp; :no_entry: This file is missing coverage.
</details>

</details>

<details>
<summary>

### file2 - 0 of 1 lines covered ( :no_entry: 0.00%)

</summary>
&emsp; :no_entry: This file is missing coverage.
</details>

<details>
<summary>

### file4.excluded - Excluded from coverage report

</summary>
&emsp; Excluded based on your \`include_pattern\` and \`exclude_pattern\` settings.
</details>
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Runs a CoverageReport with a custom include pattern, overriding the env var
 * that @actions/core reads. Restores the previous value afterwards.
 */
function runReport(lcovInfo, includePattern) {
    const prev = process.env.INPUT_INCLUDE_PATTERN;
    process.env.INPUT_INCLUDE_PATTERN = includePattern;
    try {
        const report = new CoverageReport();
        report.parse(lcovInfo);
        return report.generateReport();
    } finally {
        process.env.INPUT_INCLUDE_PATTERN = prev ?? '';
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CoverageReport', () => {
    it('should return an empty report when no files', () => {
        const reporter = new CoverageReport();
        assert.strictEqual(reporter.generateReport(), '## Code Coverage Report - 0 of 0 lines covered ( :no_entry: 0.00%) \n\n');
    });

    it('should report coverage based on contents of lcov text', () => {
        generateTmpTestDir();
        try {
            const reporter = new CoverageReport();
            reporter.parse(mockLcovInfo);
            assert.strictEqual(reporter.generateReport(), expectedReport);
        } finally {
            fs.rmSync('tmp_test_files', { recursive: true });
        }
    });

    // resolveRootFsPath: when the LCOV root is a bare filename (no directory
    // prefix), findRoot returns the CoverageReport itself (no `filename`
    // property) and resolveRootFsPath short-circuits to '.'.
    it('should resolve root to "." when LCOV paths have no directory prefix', () => {
        fs.writeFileSync('tmp_bare_file.js', 'x\n');
        try {
            const result = runReport(
                'SF:tmp_bare_file.js\nLH:1\nLF:1\nend_of_record\n',
                'tmp_bare_file\\.js'
            );
            assert.ok(result.includes('tmp_bare_file.js'));
        } finally {
            fs.rmSync('tmp_bare_file.js');
        }
    });

    // resolveRootFsPath: a directory with the right name exists but shares no
    // children with the cache (sanity check fails), so the search continues
    // deeper until it finds a directory with the same name whose children match.
    it('should skip a same-named directory whose children do not match and find the correct one deeper', () => {
        // ./src/ exists (from the project) but does not contain 'real_file.js'.
        // ./tmp_rrf_deeper/src/ does — that is the one that should be resolved.
        fs.mkdirSync('tmp_rrf_deeper/src', { recursive: true });
        fs.writeFileSync('tmp_rrf_deeper/src/real_file.js', 'x\n');
        try {
            const result = runReport(
                'SF:src/real_file.js\nLH:1\nLF:1\nend_of_record\n',
                'src/.*\\.js$'
            );
            assert.ok(result.includes('real_file.js'));
        } finally {
            fs.rmSync('tmp_rrf_deeper', { recursive: true });
        }
    });

    // resolveRootFsPath: when the LCOV report has only one SF: record inside a
    // single directory, findRoot returns the CoverageReport itself (no `filename`).
    // resolveRootFsPath then peeks at the first cache child (a DirectoryCoverage)
    // and searches for that directory on the filesystem.
    it('should resolve correctly when the LCOV report has a single file in a single directory', () => {
        fs.mkdirSync('tmp_single_dir', { recursive: true });
        fs.writeFileSync('tmp_single_dir/only.js', 'x\n');
        try {
            const result = runReport(
                'SF:tmp_single_dir/only.js\nLH:1\nLF:1\nend_of_record\n',
                'tmp_single_dir/.*\\.js$'
            );
            assert.ok(result.includes('## Code Coverage Report'));
            assert.ok(result.includes('only.js'));
        } finally {
            fs.rmSync('tmp_single_dir', { recursive: true });
        }
    });

    // resolveRootFsPath: when no directory matching the LCOV root name exists
    // anywhere on the filesystem, generateReport() falls back to '.' and produces
    // a valid (possibly empty) report rather than throwing.
    it('should fall back to "." and produce a report when the LCOV root directory cannot be found', () => {
        const lcov = [
            'SF:nonexistent_xyz_dir/file_a.js\nLH:1\nLF:1\nend_of_record',
            'SF:nonexistent_xyz_dir/file_b.js\nLH:1\nLF:1\nend_of_record',
        ].join('\n');

        const result = runReport(lcov, 'nonexistent_xyz_dir/.*\\.js$');
        assert.ok(result.includes('## Code Coverage Report'));
    });
});
