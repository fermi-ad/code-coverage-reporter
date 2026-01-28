import core from '@actions/core';

const threshold = core.getInput('coverage_threshold', { required: true });

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
