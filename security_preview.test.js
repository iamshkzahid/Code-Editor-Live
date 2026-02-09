const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const vm = require('vm');

describe('Security Fix: Open Preview', () => {
    test('opens preview using Blob URL instead of about:blank + document.write', (t) => {
        let openUrl = null;
        let documentWriteCalled = false;
        let blobCreated = false;

        const context = {
            window: {
                addEventListener: () => {},
                open: (url) => {
                    openUrl = url;
                    return {
                        document: {
                            open: () => {},
                            write: () => { documentWriteCalled = true; },
                            close: () => {}
                        }
                    };
                },
                localStorage: {
                    getItem: () => null,
                    setItem: () => {}
                },
                location: { href: '' }
            },
            document: {
                querySelector: (selector) => {
                    if (selector === '#openPreview') {
                        return {
                            addEventListener: (event, callback) => {
                                if (event === 'click') {
                                    context.triggerOpenPreview = callback;
                                }
                            }
                        };
                    }
                    return {
                        addEventListener: () => {},
                        appendChild: () => {},
                        classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
                        dataset: {},
                        setAttribute: () => {},
                        value: '',
                        innerHTML: '',
                        hidden: false,
                        focus: () => {},
                        closest: () => null,
                        srcdoc: '',
                        click: () => {}
                    };
                },
                querySelectorAll: () => [],
                createElement: () => ({
                     innerHTML: '',
                     appendChild: () => {},
                     click: () => {},
                     setAttribute: () => {},
                     classList: { add: () => {} }
                }),
            },
            ace: {
                edit: () => ({
                    setOptions: () => {},
                    session: { setUseWrapMode: () => {} },
                    commands: { addCommand: () => {} },
                    setTheme: () => {},
                    setFontSize: () => {},
                    getValue: () => '<!-- test content -->',
                    setValue: () => {},
                    on: () => {},
                    resize: () => {},
                    focus: () => {}
                })
            },
            localStorage: {
                getItem: () => null,
                setItem: () => {}
            },
            console: {
                 log: () => {},
                 error: () => {},
            },
            Blob: class Blob {
                constructor(content, options) {
                    blobCreated = true;
                    this.content = content;
                    this.type = options.type;
                }
            },
            URL: {
                createObjectURL: (blob) => {
                    return 'blob:http://localhost/unique-id';
                }
            },
            setTimeout: setTimeout,
            clearTimeout: clearTimeout,
            requestAnimationFrame: (cb) => cb(),
            Date: Date
        };

        context.window.window = context.window;
        context.window.document = context.document;
        context.window.console = context.console;
        context.window.localStorage = context.localStorage;

        const utilsCode = fs.readFileSync('utils.js', 'utf8');
        const scriptCode = fs.readFileSync('script.js', 'utf8');

        vm.runInNewContext(utilsCode, context);
        vm.runInNewContext(scriptCode, context);

        if (context.triggerOpenPreview) {
            context.triggerOpenPreview();
        } else {
            assert.fail('Could not find #openPreview click listener');
        }

        assert.ok(openUrl, 'window.open was not called');
        assert.ok(openUrl.startsWith('blob:'), `Expected Blob URL, got: ${openUrl}`);
        assert.strictEqual(documentWriteCalled, false, 'document.write should NOT be called');
        assert.strictEqual(blobCreated, true, 'Blob should be created');
    });
});
