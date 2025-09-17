const core = require('@actions/core');
const fs = require('fs');
const { formatErrorText, formatWarningText, formatSuccessText, formatPercentage } = require('./text-format');

function getFormattedCoveragePercentage(metrics) {
    let percentage;
    if (metrics.linesFound === 0) {
        percentage = 0.0;
    } else {
        percentage = (metrics.linesHit / metrics.linesFound) * 100;
    }
    return formatPercentage(percentage);
}

class FileCoverage {
    constructor(filename, linesFound) {
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

        return this.uncoveredLines.length ? formatWarningText(combinedLines.join(', ')) : formatSuccessText('None');
    }

    generateReport() {
        return `<details>
<summary>

### ${this.filename} - ${getFormattedCoveragePercentage(this.getMetrics())} 

</summary> 
Uncovered lines: ${this._getUncoveredLinesPretty()} 
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
            if (includePattern.test(fullPath) && !excludePattern.test(fullPath)) {
                const truncatedPath = fullPath.replace('./', '');
                const linesInFile = fs.readFileSync(fullPath, 'utf8').split('\n').length;
                const coverageRecord = new FileCoverage(truncatedPath, linesInFile);
                this.cache.set(file, coverageRecord);
            } else if (fs.statSync(fullPath).isDirectory()) {
                const subCache = new DirectoryCoverage(fullPath);
                subCache.findFiles(includePattern, excludePattern);
                if (subCache.cache.size > 0) {
                    this.cache.set(file, subCache);
                }
            }
        });
    }

    get(filepath) {
        const delimiterIndex = filepath.indexOf('/');
        if (delimiterIndex === -1) {
            return this.cache.get(filepath);
        }
        const directory = filepath.substring(0, delimiterIndex);
        const subPath = filepath.substring(delimiterIndex + 1);
        return this.cache.get(directory).get(subPath);
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

    generateReport() {
        return `<details>
<summary>

### ${this.dir.replace('./', '')} - ${getFormattedCoveragePercentage(this.getMetrics())} 

</summary> 
${Array.from(this.cache.values()).map(coverage => coverage.generateReport()).join('\n')}
</details> 
`;
    }
}

function generateCoverageRoot() {
    const includePattern = RegExp(core.getInput('include_pattern', { required: true }));
    const excludePattern = RegExp(core.getInput('exclude_pattern', { required: true }));
    const root = new DirectoryCoverage('.');
    root.findFiles(includePattern, excludePattern);
    return root;
}

class CoverageReport {
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

module.exports = CoverageReport; 
