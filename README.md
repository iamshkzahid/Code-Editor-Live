# Code Editor Live

A professional-grade, zero-backend browser code editor designed for learning, prototyping, and sharing. Experience a frictionless coding environment with advanced IDE features—completely inside your browser.

## 🚀 Features

### Core Experience
*   **Instant Boot:** CSS-only skeleton loader for immediate perceived performance.
*   **Multi-Pane Editor:** HTML, CSS, and JavaScript support with Ace Editor.
*   **Live Preview:** Auto-running sandbox with configurable debounce (HTML/CSS runs instantly; JS is debounced and toggleable).
*   **Console Bridge:** Real-time capture of `console.log`, `warn`, `error`, `info`, and uncaught promise rejections directly in the UI.

### Productivity & Sticky Features
*   **Zero-Backend Shareable URLs:** Compress your entire project (HTML, CSS, JS) into a secure URL using LZString. Share instantly without accounts or a database.
*   **Interactive Challenge Mode:** Built-in curriculum with structured challenges. Includes a sandboxed test-runner that validates your code and gives instant ✅/❌ feedback.
*   **Starter Templates:** 10 curated starter projects ranging from "Hello World" to "To-Do List" and API fetching.
*   **Command Palette:** Quickly navigate features and commands with fuzzy search (`Ctrl+Shift+P`).
*   **Zen Mode:** Distraction-free coding (`Ctrl+Shift+Z`).
*   **Layout Toggle:** Switch between horizontal and vertical layouts.

### Security & Architecture
*   **Hardened Sandbox:** `allow-scripts allow-modals` (removed `allow-same-origin` to prevent local storage or cookie theft).
*   **Clean State Management:** Centralized `AppState` to prevent conflicting configuration storage.
*   **Semantic DOM:** Accessible ARIA attributes, skip-to-content links, and semantic `<noscript>` fallback.
*   **Offline Ready:** Save your projects as local JSON files and load them back later. Auto-saves locally.

## 🛠 Tech Stack
*   **HTML5 / CSS3 / JavaScript (ES6+)**
*   **Ace Editor:** (v1.43.2) Syntax highlighting and autocomplete.
*   **LZ-String:** URL-safe compression for zero-backend sharing.

## 🌐 Live Demo
[Code Editor Live - Playground](https://iamshkzahid.github.io/Code-Editor-Live/)

## ⌨️ Shortcuts
| Shortcut | Action |
| :--- | :--- |
| `Ctrl` + `Enter` | Run Code |
| `Ctrl` + `S` | Save / Download Project |
| `Ctrl` + `Shift` + `P` | Command Palette |
| `Ctrl` + `Shift` + `Z` | Toggle Zen Mode |
| `Ctrl` + `+` / `-` | Font Size Up / Down |
| `?` | Show Shortcuts Panel |

*(On macOS, use `Cmd` instead of `Ctrl`)*

---

Made with ❤️ for developers and learners.
