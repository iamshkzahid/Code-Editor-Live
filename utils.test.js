const { test, describe } = require('node:test');
const assert = require('node:assert');
const { escapeHtml } = require('./utils');

describe('escapeHtml', () => {
    test('escapes & to &amp;', () => {
        assert.strictEqual(escapeHtml('foo & bar'), 'foo &amp; bar');
    });

    test('escapes < to &lt;', () => {
        assert.strictEqual(escapeHtml('<script>'), '&lt;script&gt;');
    });

    test('escapes > to &gt;', () => {
        assert.strictEqual(escapeHtml('foo > bar'), 'foo &gt; bar');
    });

    test('escapes " to &quot;', () => {
        assert.strictEqual(escapeHtml('he said "hello"'), 'he said &quot;hello&quot;');
    });

    test('escapes multiple special characters', () => {
        assert.strictEqual(escapeHtml('& < > "'), '&amp; &lt; &gt; &quot;');
    });

    test('handles empty string', () => {
        assert.strictEqual(escapeHtml(''), '');
    });

    test('handles string without special characters', () => {
        assert.strictEqual(escapeHtml('hello world'), 'hello world');
    });

    test('handles non-string input by converting to string', () => {
        assert.strictEqual(escapeHtml(123), '123');
        assert.strictEqual(escapeHtml(null), 'null');
    });
});
