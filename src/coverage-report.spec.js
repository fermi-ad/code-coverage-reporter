import { CoverageReport } from './coverage-report.js';
import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';

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
`;

const expectedReport = `## Code Coverage Report - 17 of 30 lines covered ( :no_entry: 56.67%) 

<details>
<summary>

### tmp_test_files - 17 of 30 lines covered ( :no_entry: 56.67%) 

</summary> 
<details>
<summary>

### tmp_test_files/file1 - 4 of 8 lines covered ( :no_entry: 50.00%) 

</summary> 
Uncovered lines: :warning: 4, 6-8 
</details> 

<details>
<summary>

### tmp_test_files/file2 - 0 of 1 lines covered ( :no_entry: 0.00%) 

</summary> 
:no_entry: This file is missing coverage. 
</details> 

<details>
<summary>

### tmp_test_files/file3 - 5 of 13 lines covered ( :no_entry: 38.46%) 

</summary> 
Uncovered lines: :warning: 1, 4-7, 10, 12, 123 
</details> 

<details>
<summary>

### tmp_test_files/inner_dir - 8 of 8 lines covered ( :gem: 100.00%) 

</summary> 
<details>
<summary>

### tmp_test_files/inner_dir/file1 - 8 of 8 lines covered ( :gem: 100.00%) 

</summary> 
:shipit: 
</details> 

</details> 

</details> 
`;

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
});
