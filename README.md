# TBCE

**Everything your project needs, in one place.**

TBCE means Tools, Branches, Code, Everything. This Windows-first desktop application implements Milestones 0 to 2: a Tauri/Rust foundation, a React/TypeScript workspace powered by Monaco, and an integrated terminal.

## Available now

- Open a local folder with a native picker; browse a lazy directory tree, including hidden files.
- Create files and folders, rename items, refresh the tree, and move items to the Recycle Bin with confirmation.
- Edit UTF-8 files in multiple tabs with syntax highlighting, undo history, cursor/view preservation, and dirty indicators.
- Save explicitly, save all tabs, and resolve unsaved changes before closing tabs, switching workspaces, or exiting.
- Detect external edits on focus or refresh, with explicit reload/overwrite handling when saving conflicts.
- Run a shell in the workspace directory from a resizable terminal panel, with full input, output, resizing, restart, and stop.
- Resize or hide the explorer and use a compact dark editor interface.

Project templates, Git/GitHub integration, and the rest of V1 are not implemented in this milestone.

## Development

Install Node.js 24 LTS, current stable Rust with the MSVC toolchain, Visual Studio C++ build tools including a Windows SDK, and WebView2. Run from the repository root:

```sh
npm ci
npm run tauri dev
```

`npm run dev` starts a browser-only UI preview. Native filesystem operations require `npm run tauri dev` or the packaged desktop app.

## Checks and packaging

```sh
npm run format:check
npm run lint
npm test
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm run tauri build
```

Use `npm run format` and `cargo fmt --manifest-path src-tauri/Cargo.toml` to format sources. Windows CI runs the same checks and builds an installer without publishing it.

The unsigned Windows installer is generated at `src-tauri/target/release/bundle/nsis/TBCE_0.1.0_x64-setup.exe`. A standalone executable is generated at `src-tauri/target/release/tbce.exe`. The installer uses a per-user installation; no signing or public release pipeline is configured.

## Keyboard shortcuts

| Action                                   | Windows shortcut |
| ---------------------------------------- | ---------------- |
| Save active file                         | Ctrl+S           |
| Save all files                           | Ctrl+Shift+S     |
| Close active tab                         | Ctrl+W           |
| Open a file inside the current workspace | Ctrl+O           |
| Show or hide the terminal                | Ctrl+`           |

Click the workspace name in the explorer to select the root before creating a root-level item. Otherwise new items are created inside the selected directory or beside the selected file.

## Current limits

One workspace per window, explicit saves, and no session restoration or crash recovery. Supported files are UTF-8, optionally with BOM, up to 10 MiB, using LF or CRLF. Binary files, other encodings, mixed/legacy line endings, symlinks, and junctions are rejected with an explanation. Monaco language features are bundled locally; no CDN or account is required.

One terminal at a time, running the operating system's default shell. Multiple terminal tabs, terminal names, command history, and choosing a shell arrive in later milestones. Closing a terminal ends its session and its scrollback. Closing the window stops every shell.

Filesystem access is confined to the selected workspace by Rust validation. Destructive operations cannot target its root. The terminal starts in the workspace root and the webview cannot choose a program or directory, but commands the user types run with the application's privileges: the shell is not a sandbox. See the architecture notes for the local-process race limitation before building untrusted automation on these services.

## Documentation

- [Full product vision and V1/V2 roadmap](docs/roadmap.md)
- [Architecture and native interfaces](docs/architecture.md)
- [Windows acceptance checklist](docs/acceptance.md)
- [Verification results](docs/verification.md)
- [Remaining work](docs/remaining-work.md)

No project license has been selected. Git author configuration and repository ownership remain with the human owner.
