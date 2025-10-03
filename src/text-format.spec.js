process.env['INPUT_COVERAGE_THRESHOLD'] = 80;

const { formatErrorText, formatWarningText, formatSuccessText, formatPercentage } = require('./text-format');
const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('text-format', () => {
    const testText = 'test';
    it('should prepend error text with :no_entry:', () => {
        assert.strictEqual(formatErrorText(testText), `:no_entry: ${testText}`);
    });
    it('should prepend warning text with :warning:', () => {
        assert.strictEqual(formatWarningText(testText), `:warning: ${testText}`);
    });
    it('should prepend success text with :white_check_mark:', () => {
        assert.strictEqual(formatSuccessText(testText), `:white_check_mark: ${testText}`);
    });

    describe('formatPercentage', () => {
        it('should return error text below coverage threshold', () => {
            assert.strictEqual(formatPercentage(0), ':no_entry: 0.00%');
            assert.strictEqual(formatPercentage(25.3), ':no_entry: 25.30%');
            assert.strictEqual(formatPercentage(79.499), ':no_entry: 79.50%');
        });
        it('should return warning text within 10% of threshold', () => {
            assert.strictEqual(formatPercentage(80), ':warning: 80.00%');
            assert.strictEqual(formatPercentage(85.24), ':warning: 85.24%');
            assert.strictEqual(formatPercentage(87.999), ':warning: 88.00%');
        });
        it('should return success text when greater than 10% of threshold', () => {
            assert.strictEqual(formatPercentage(88.001), ':white_check_mark: 88.00%');
            assert.strictEqual(formatPercentage(89), ':white_check_mark: 89.00%');
            assert.strictEqual(formatPercentage(100), ':white_check_mark: 100.00%');
        });
    });
});