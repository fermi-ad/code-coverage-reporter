import { getInput } from '@actions/core';

const threshold = getInput('coverage_threshold', { required: true });

export function formatErrorText(input) {
    return `:no_entry: ${input}`;
}

export function formatWarningText(input) {
    return `:warning: ${input}`;
}

export function formatSuccessText(input) {
    return `:white_check_mark: ${input}`;
}

function formatFullCoverageText(input) {
    return `:gem: ${input}`;
}

export function formatPercentage(percentage) {
    const text = percentage.toFixed(2) + '%';
    if (percentage < threshold) {
        return formatErrorText(text);
    }
    if (percentage < threshold * 1.1) {
        return formatWarningText(text);
    }
    if (text === '100.00%') {
        return formatFullCoverageText(text);
    }
    return formatSuccessText(text);
}

/**
 * Formats a `{ linesHit, linesFound }` metrics object into a human-readable
 * coverage summary string, e.g. "42 of 100 lines covered ( 42.00%)".
 *
 * @param {{ linesHit: number, linesFound: number }} metrics
 * @returns {string}
 */
export function formatCoveragePercentage(metrics) {
    let percentage;
    if (metrics.linesFound === 0) {
        percentage = 0.0;
    } else {
        percentage = (metrics.linesHit / metrics.linesFound) * 100;
    }
    return `${metrics.linesHit.toLocaleString()} of ${metrics.linesFound.toLocaleString()} lines covered ( ${formatPercentage(percentage)})`;
}
