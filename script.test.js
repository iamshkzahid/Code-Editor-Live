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
        if (child.tagName === 'DOCUMENT-FRAGMENT') {
             this.children.push(...child.children);
             child.children = [];
        } else {
             this.children.push(child);
        }
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
// This is used for the default context
const elementRegistry = new Map();

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

// Helper function to create a sandbox environment
function createSandbox(options = {}) {
    const { missingSelectors = [] } = options;
    const localRegistry = new Map();

    const getElement = (selector) => {
        if (missingSelectors.includes(selector)) return null;

        // Use global registry if no options provided to keep existing tests working
        // Or create a fresh one if we want isolation. For now, we'll use a mix:
        // If specific options are provided, use local registry. Otherwise global.
        // Actually, to support the refactor, let's just make a new one every time unless we want persistence?
        // The existing tests rely on `getMockElement` (global). Let's keep that for the default context.
        if (Object.keys(options).length === 0) {
             return getMockElement(selector);
        }

        if (!localRegistry.has(selector)) {
            const el = new MockElement();
            if (selector.startsWith('#')) {
                el.id = selector.slice(1);
            }
            localRegistry.set(selector, el);
        }
        return localRegistry.get(selector);
    };

    return {
        document: {
            querySelector: (selector) => {
                return getElement(selector);
            },
            querySelectorAll: (selector) => {
                // Special handling for these selectors to return array of mocks
                if (selector.includes('.editor-wrap') || selector.includes('.tab')) {
                    const panes = ['html', 'css', 'js'];
                    return panes.map(p => {
                        const el = new MockElement();
                        el.dataset.pane = p;
                        return el;
                    });
                }
                return [];
            },
            createElement: (tag) => new MockElement(tag),
            getElementById: (id) => getElement('#' + id),
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
        createElement: (tag) => new MockElement(tag),
        createDocumentFragment: () => new MockElement('document-fragment'),
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
        },
        localStorage: {
            _store: {},
            getItem: (key) => this._store ? this._store[key] : null, // Context issue with 'this', fix below
            setItem: (key, val) => { if(!this._store) this._store={}; this._store[key] = String(val); },
            removeItem: (key) => { if(this._store) delete this._store[key]; },
            clear: () => { this._store = {}; }
        },
        Blob: class { constructor(content) { this.content = content; } },
        URL: { createObjectURL: () => 'blob:mock-url' },
        console: {
            log: () => {},
            error: console.error,
            warn: console.warn
        },
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        requestAnimationFrame: (cb) => cb(),
        Date: Date
    };
}

// Fix localStorage binding in createSandbox
function createSandboxCorrected(options = {}) {
    const sandbox = createSandbox(options);
    const store = {};
    sandbox.localStorage = {
        getItem: (key) => store[key] || null,
        setItem: (key, val) => store[key] = String(val),
        removeItem: (key) => delete store[key],
        clear: () => { for (const key in store) delete store[key]; }
    };
    return sandbox;
}

// Initialize default context (global, for backward compatibility with existing tests)
const defaultSandbox = createSandboxCorrected();
const defaultContext = vm.createContext(defaultSandbox);

try {
    vm.runInContext(utilsCode, defaultContext);
    vm.runInContext(scriptCode, defaultContext);
} catch (e) {
    console.error("Error executing script.js:", e);
    process.exit(1);
}

// ================= TESTS =================

describe('script.js - buildwebSrcdoc', () => {

    // Access variables from the sandbox using runInContext
    const getEdHtml = () => vm.runInContext('ed_html', defaultContext);
    const getEdCss = () => vm.runInContext('ed_css', defaultContext);
    const getEdJs = () => vm.runInContext('ed_js', defaultContext);
    const runBuildWebSrcDoc = (withTests) => vm.runInContext(`buildwebSrcdoc(${withTests})`, defaultContext);

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

    // NEW TESTS
    test('should ignore whitespace-only test content', () => {
        $('#testArea').value = '   \n   ';
        const result = runBuildWebSrcDoc(true);
        assert.ok(!result.includes('/* tests */'), 'Output should NOT include test marker for empty/whitespace content');
    });

    test('should trim test content', () => {
        const code = 'console.log(1);';
        $('#testArea').value = `  ${code}  `;
        const result = runBuildWebSrcDoc(true);
        assert.ok(result.includes(code), 'Output should contain trimmed code');
        // We can't easily check for exact string match of the whole block without parsing, but ensuring code is present is good.
    });
});

describe('script.js - buildwebSrcdoc (Edge Cases)', () => {
    test('should handle missing #testArea element', () => {
        // Create a sandbox where #testArea is missing
        const sandbox = createSandboxCorrected({ missingSelectors: ['#testArea'] });
        const context = vm.createContext(sandbox);

        // Run script
        vm.runInContext(utilsCode, context);
        vm.runInContext(scriptCode, context);

        // Run function
        const result = vm.runInContext('buildwebSrcdoc(true)', context);

        // Assertions
        assert.ok(result.includes('<!DOCTYPE html>'), 'Should generate valid HTML even if testArea is missing');
        assert.ok(!result.includes('/* tests */'), 'Should not try to include tests if testArea is missing');
    });
});

describe('script.js - saveProject', () => {
    const $ = (sel) => getMockElement(sel);
    const runSaveProject = () => vm.runInContext('saveProject()', context);

    // Save original setItem to restore after test
    const originalSetItem = sandbox.localStorage.setItem;

    afterEach(() => {
        sandbox.localStorage.setItem = originalSetItem;
        // Clear output after each test
        const output = $('#output');
        output.children = [];
        output.innerHTML = '';
        output.scrollTop = 0;
    });

    test('should log error when localStorage.setItem throws', () => {
        // Mock localStorage.setItem to throw an error
        sandbox.localStorage.setItem = (key, val) => {
            throw new Error("QuotaExceededError");
        };

        runSaveProject();

        const output = $('#output');
        const lastLog = output.children[output.children.length - 1];

        assert.ok(lastLog, 'Output should have a log entry');
        assert.ok(lastLog.innerHTML.includes('Unable to save'), 'Log should contain error message prefix');
        assert.ok(lastLog.innerHTML.includes('QuotaExceededError'), 'Log should contain specific error message');
    });
});

describe('script.js - initProject', () => {
    // Access variables and functions
    const getEdHtml = () => vm.runInContext('ed_html', context);
    const getEdCss = () => vm.runInContext('ed_css', context);
    const getEdJs = () => vm.runInContext('ed_js', context);
    const runInitProject = () => vm.runInContext('initProject()', context);
    const getStorageKey = () => vm.runInContext('STORAGE_PROJECT_KEY', context);

    // Helper to get element from registry
    const $ = (sel) => getMockElement(sel);

    // Helper to clear output log
    const clearLog = () => {
        const out = $('#output');
        out.children = [];
        out.innerHTML = '';
    };

    // Helper to get last log message
    const getLastLogMessage = () => {
        const out = $('#output');
        if (out.children.length > 0) {
             const lastChild = out.children[out.children.length - 1];
             return lastChild.innerHTML;
        }
        return '';
    };

    beforeEach(() => {
        // Clear storage
        sandbox.localStorage.clear();
        // Clear logs
        clearLog();
        // Reset editors to empty to ensure initProject fills them
        getEdHtml().setValue('');
        getEdCss().setValue('');
        getEdJs().setValue('');
    });

    test('should load default content when storage is corrupted (invalid JSON)', () => {
        const key = getStorageKey();
        sandbox.localStorage.setItem(key, 'invalid-json-{');

        runInitProject();

        const htmlVal = getEdHtml().getValue();
        const cssVal = getEdCss().getValue();
        const jsVal = getEdJs().getValue();

        assert.match(htmlVal, /Welcome to Code Editor/, 'HTML should contain default content');
        assert.match(cssVal, /body\{font-family:system-ui/, 'CSS should contain default content');
        assert.match(jsVal, /console\.log\('Hello from JavaScript!'\)/, 'JS should contain default content');

        const logMsg = getLastLogMessage();
        assert.match(logMsg, /Loaded default project \(fresh start\)/, 'Should log default load message');
    });

    test('should load default content when storage is empty', () => {
        const key = getStorageKey();
        // Storage is already cleared in beforeEach, so getItem returns null

        runInitProject();

        const htmlVal = getEdHtml().getValue();
        assert.match(htmlVal, /Welcome to Code Editor/, 'HTML should contain default content');

        const logMsg = getLastLogMessage();
        assert.match(logMsg, /Loaded default project \(fresh start\)/, 'Should log default load message');
    });

    test('should load saved project when storage has valid data', () => {
        const key = getStorageKey();
        const savedProject = {
            html: '<h1>Saved HTML</h1>',
            css: 'body { color: blue; }',
            js: 'console.log("Saved JS");'
        };
        sandbox.localStorage.setItem(key, JSON.stringify(savedProject));

        runInitProject();

        assert.strictEqual(getEdHtml().getValue(), savedProject.html, 'HTML should match saved content');
        assert.strictEqual(getEdCss().getValue(), savedProject.css, 'CSS should match saved content');
        assert.strictEqual(getEdJs().getValue(), savedProject.js, 'JS should match saved content');

        const logMsg = getLastLogMessage();
        assert.match(logMsg, /Web project loaded/, 'Should log project loaded message');
    });
});
