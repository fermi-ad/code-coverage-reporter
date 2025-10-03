const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');
const CoverageReport = require('./coverage-report');

async function run() {
    try {
        const lcovInfo = fs.readFileSync(core.getInput('coverage_file', { required: true }), 'utf8');
        const coverageReport = new CoverageReport();
        coverageReport.parse(lcovInfo);

        const context = github.context;
        const pr_number = context.payload.pull_request?.number;
        const octokit = github.getOctokit(core.getInput('github_token', { required: true }));
        if (pr_number) {
            await octokit.rest.issues.createComment({
                ...context.repo,
                issue_number: pr_number,
                body: coverageReport.generateReport()
            });
        } else {
            await octokit.rest.repos.createCommitComment({
                ...context.repo,
                commit_sha: context.sha,
                body: coverageReport.generateReport()
            });
        }
    } catch (error) {
        core.setFailed(`Action failed with error ${error}`);
    }
}

run();
