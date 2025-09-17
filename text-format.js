const core = require('@actions/core');

const threshold = core.getInput('coverage_threshold', { required: true });

function formatErrorText(input) {
    return `:no_entry: ${input}`;
}

function formatWarningText(input) {
    return `:warning: ${input}`;
}

function formatSuccessText(input) {
    return `:white_check_mark: ${input}`;
}

function formatPercentage(percentage) {
    const text = percentage.toFixed(2) + '%';
    if (percentage < threshold) {
        return formatErrorText(text);
    }
    if (percentage < threshold * 1.1) {
        return formatWarningText(text);
    }
    return formatSuccessText(text);
}

module.exports = {
    formatErrorText,
    formatWarningText,
    formatSuccessText,
    formatPercentage
}; 
