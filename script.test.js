const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Read the script files
const utilsPath = path.join(__dirname, 'utils.js');
const utilsCode = fs.readFileSync(utilsPath, 'utf8');
const scriptPath = path.join(__dirname, 'script.js');
const scriptCode = fs.readFileSync(scriptPath, 'utf8');

// Mock DOM Element
class MockElement {
    constructor(tagName = 'div') {
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.style = {};
        this.dataset = {};
        this.classList = {
             _classes: new Set(),
             add: (c) => this.classList._classes.add(c),
             remove: (c) => this.classList._classes.delete(c),
             toggle: (c, force) => {
                 if (force === undefined) {
                     force = !this.classList._classes.has(c);
                 }
                 if (force) this.classList._classes.add(c);
                 else this.classList._classes.delete(c);
             },
             contains: (c) => this.classList._classes.has(c)
        };
        this.value = '';
        this.innerHTML = '';
        this._listeners = {};
        this.hidden = false;
        this.tabIndex = -1;
    }

    addEventListener(event, callback) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(callback);
    }

    appendChild(child) {
        this.children.push(child);
    }

    setAttribute(name, value) {
        this[name] = value;
    }

    closest(selector) {
        return this; // Simplified
    }

    click() {
        if (this._listeners['click']) {
            this._listeners['click'].forEach(cb => cb({ target: this }));
        }
    }

    // Helper to trigger events manually in tests
    trigger(event, data) {
        if (this._listeners[event]) {
            this._listeners[event].forEach(cb => cb(data));
        }
    }
}

// Mock Ace Editor
class MockEditor {
    constructor(id) {
        this.id = id;
        this._value = '';
        this.initialConfig = {};
        this.options = {};
        this.wrapMode = false;
        this.commandsList = [];
        this.session = {
            setUseWrapMode: (val) => { this.wrapMode = val; }
        };
        this.commands = {
            addCommand: (cmd) => { this.commandsList.push(cmd); }
        };
        this._listeners = {};
    }

    setOptions(opts) { Object.assign(this.options, opts); }
    setValue(val) { this._value = val; }
    getValue() { return this._value; }
    setTheme() {}
    setFontSize() {}
    resize() {}
    focus() {}
    on(event, callback) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(callback);
    }
}

// Registry to store persistent mock elements by selector
const elementRegistry = new Map();

// Helper to clear registry between tests
function clearRegistry() {
    elementRegistry.clear();
}

function getMockElement(selector) {
    if (!elementRegistry.has(selector)) {
        const el = new MockElement();
        if (selector.startsWith('#')) {
            el.id = selector.slice(1);
        }
        elementRegistry.set(selector, el);
    }
    return elementRegistry.get(selector);
}

// Setup Sandbox Environment
const sandbox = {
    document: {
        querySelector: (selector) => {
            return getMockElement(selector);
        },
        querySelectorAll: (selector) => {
            // Special handling for these selectors to return array of mocks
            if (selector.includes('.editor-wrap') || selector.includes('.tab')) {
                const panes = ['html', 'css', 'js'];
                return panes.map(p => {
                    const el = new MockElement(); // Don't persist these for now as they are usually iterated
                    el.dataset.pane = p;
                    return el;
                });
            }
            return [];
        },
        createElement: (tag) => new MockElement(tag),
        getElementById: (id) => getMockElement('#' + id),
    },
    window: {
        addEventListener: () => {},
        open: () => ({
            document: {
                open: () => {},
                write: () => {},
                close: () => {}
            }
        }),
        location: { reload: () => {} }
    },
    ace: {
        edit: (id, options) => {
             const editor = new MockEditor(id);
             editor.initialConfig = options;
             // Store editor in sandbox if needed, but script.js assigns them to vars
             return editor;
        }
    },
    localStorage: {
        _store: {},
        getItem: (key) => sandbox.localStorage._store[key] || null,
        setItem: (key, val) => sandbox.localStorage._store[key] = String(val),
        removeItem: (key) => delete sandbox.localStorage._store[key],
        clear: () => sandbox.localStorage._store = {}
    },
    Blob: class { constructor(content) { this.content = content; } },
    URL: { createObjectURL: () => 'blob:mock-url' },
    console: {
        log: () => {}, // suppress logs during tests
        error: console.error,
        warn: console.warn
    },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    requestAnimationFrame: (cb) => cb(),
    Date: Date
};

// initialize context
const context = vm.createContext(sandbox);

// Run the scripts
try {
    vm.runInContext(utilsCode, context);
    vm.runInContext(scriptCode, context);
} catch (e) {
    console.error("Error executing script.js:", e);
    process.exit(1);
}

// ================= TESTS =================

describe('script.js - buildwebSrcdoc', () => {

    // Access variables from the sandbox using runInContext because 'const' vars are not on sandbox object
    const getEdHtml = () => vm.runInContext('ed_html', context);
    const getEdCss = () => vm.runInContext('ed_css', context);
    const getEdJs = () => vm.runInContext('ed_js', context);
    const runBuildWebSrcDoc = (withTests) => vm.runInContext(`buildwebSrcdoc(${withTests})`, context);

    // Helper to get element from registry (wrapper for querySelector)
    const $ = (sel) => getMockElement(sel);

    beforeEach(() => {
        // Reset editor contents
        getEdHtml().setValue('');
        getEdCss().setValue('');
        getEdJs().setValue('');

        // Reset test area content
        $('#testArea').value = '';
    });

    test('should generate basic HTML structure with CSS and JS', () => {
        const html = '<h1>Hello</h1>';
        const css = 'body { color: red; }';
        const js = 'console.log("hi");';

        getEdHtml().setValue(html);
        getEdCss().setValue(css);
        getEdJs().setValue(js);

        const result = runBuildWebSrcDoc(false);

        assert.ok(result.includes(html), 'Output should contain HTML');
        assert.ok(result.includes(css), 'Output should contain CSS');
        assert.ok(result.includes(js), 'Output should contain JS');
        assert.ok(result.includes('<!DOCTYPE html>'), 'Output should be a full HTML document');
    });

    test('should NOT include tests when withTests is false', () => {
        const testCode = 'assert(true);';
        $('#testArea').value = testCode;

        const result = runBuildWebSrcDoc(false);

        assert.ok(!result.includes(testCode), 'Output should NOT contain test code');
        assert.ok(!result.includes('/* tests */'), 'Output should NOT contain test marker');
    });

    test('should include tests when withTests is true', () => {
        const testCode = 'console.log("testing");';
        $('#testArea').value = testCode;

        const result = runBuildWebSrcDoc(true);

        assert.ok(result.includes(testCode), 'Output should contain test code');
        assert.ok(result.includes('/* tests */'), 'Output should contain test marker');
    });

    test('should handle empty content gracefully', () => {
        const result = runBuildWebSrcDoc(false);
        assert.ok(result.includes('<body>'), 'Output should have body tag');
        assert.ok(result.includes('<script>'), 'Output should have script tag');
    });

    test('should wrap JS in try-catch block', () => {
         const js = 'throw new Error("oops");';
         getEdJs().setValue(js);

         const result = runBuildWebSrcDoc(false);

         assert.ok(result.includes('try{'), 'JS should be inside try block');
         assert.ok(result.includes('catch(e)'), 'JS should include catch block');
    });
});

describe('script.js - makeEditor', () => {

    test('should configure editor with correct defaults', () => {
        // Create a new editor using makeEditor
        const editor = vm.runInContext('makeEditor("test_editor", "ace/mode/javascript")', context);

        // Check initial config passed to ace.edit
        assert.strictEqual(editor.id, 'test_editor');
        assert.strictEqual(editor.initialConfig.theme, 'ace/theme/dracula');
        assert.strictEqual(editor.initialConfig.mode, 'ace/mode/javascript');
        assert.strictEqual(editor.initialConfig.tabSize, 2);
        assert.strictEqual(editor.initialConfig.useSoftTabs, true);
        assert.strictEqual(editor.initialConfig.showPrintMargin, false);
        assert.strictEqual(editor.initialConfig.wrap, true);
        assert.strictEqual(editor.initialConfig.fontSize, '17px');
    });

    test('should enable autocompletion options', () => {
        const editor = vm.runInContext('makeEditor("test_editor_opts", "ace/mode/css")', context);

        // Check options set via setOptions
        assert.strictEqual(editor.options.enableBasicAutocompletion, true);
        assert.strictEqual(editor.options.enableLiveAutocompletion, true);
        assert.strictEqual(editor.options.enableSnippets, true);
    });

    test('should enable wrap mode on session', () => {
        const editor = vm.runInContext('makeEditor("test_editor_wrap", "ace/mode/html")', context);

        // Check session wrap mode
        assert.strictEqual(editor.wrapMode, true);
    });

    test('should register run and save commands', () => {
        const editor = vm.runInContext('makeEditor("test_editor_cmds", "ace/mode/text")', context);

        // Check registered commands
        const cmdNames = editor.commandsList.map(c => c.name);
        assert.ok(cmdNames.includes('run'), 'Should register run command');
        assert.ok(cmdNames.includes('save'), 'Should register save command');

        // Check key bindings for run command
        const runCmd = editor.commandsList.find(c => c.name === 'run');
        assert.strictEqual(runCmd.bindKey.win, 'Ctrl-Enter');
        assert.strictEqual(runCmd.bindKey.mac, 'Command-Enter');

        // Check key bindings for save command
        const saveCmd = editor.commandsList.find(c => c.name === 'save');
        assert.strictEqual(saveCmd.bindKey.win, 'Ctrl-S');
        assert.strictEqual(saveCmd.bindKey.mac, 'Command-S');
    });
});
