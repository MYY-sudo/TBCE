# TBCE

**Everything your project needs, in one place.**

TBCE means Tools, Branches, Code, Everything. This Windows-first desktop application implements Milestones 0 to 4: a Tauri/Rust foundation, a React/TypeScript workspace powered by Monaco, an integrated terminal, the project system, and personal saved stacks. Desktop acceptance for the terminal, project system, and saved stacks remains pending; see the verification record.

## Available now

- Open a local folder with a native picker; browse a lazy directory tree, including hidden files.
- Create files and folders, rename items, refresh the tree, and move items to the Recycle Bin with confirmation.
- Edit UTF-8 files in multiple tabs with syntax highlighting, undo history, cursor/view preservation, and dirty indicators.
- Save explicitly, save all tabs, and resolve unsaved changes before closing tabs, switching workspaces, or exiting.
- Detect external edits on focus or refresh, with explicit reload/overwrite handling when saving conflicts.
- Run a shell in the workspace directory from a resizable terminal panel, with full input, output, resizing, restart, and stop.
- Resize or hide the explorer and use a compact dark editor interface.
- Create a project, convert an open folder into one, and edit its name, stack, architecture, default branch, and commands.
- Detect `.tbce/project.json` when a folder opens, and reopen earlier projects from the Recent list.
- Save selected project files and command defaults as reusable local stacks; edit details, replace snapshots, or delete stacks with confirmation.
- Create an independent project from a saved stack or start with a blank project.

Architecture catalogs, Git/GitHub integration, running project commands, and the rest of V1 remain for later milestones.

## Projects

A TBCE project is a folder containing `.tbce/project.json`. The file records a schema version, name, stack, architecture, default branch, and commands. New projects store their saved stack's stable ID; settings suggest saved stacks while retaining legacy values. Architecture remains free text until milestone 5. Commands are stored for later milestones; TBCE does not run them yet. A project also reports whether a `.git` entry exists at its root, without invoking Git.

Opening a folder that has no manifest still works exactly as before. Use the project button in the explorer to convert it, or to edit an existing project's settings. Recent projects are remembered locally; an entry that no longer opens is reported and removed.

## Saved stacks

Open **Stacks** in the activity bar and choose **Save current project as stack**. Plain folders work too. Enter a name, description, languages, frameworks, and command defaults, then review the file tree. Unsaved edits can be saved first, or the snapshot can use files already on disk without discarding your buffers.

Git history and `.tbce` metadata are always omitted. Dependency folders, build output, caches, and `.env` files start unchecked; `.env.example` remains selected. Expand folders and adjust checkboxes to choose the files to reuse. Refresh resets the selection and rereads files after external changes. Binary assets and empty directories can be saved, independently of the editor's text-file limits.

The library starts empty, without built-in templates or downloads. **New project** / **Create project** offers a blank project or a saved stack, lets you review defaults, and opens a native parent-folder picker. Creation refuses an existing destination. Source files and internal package names remain unchanged; TBCE creates fresh project metadata. Install dependencies yourself through the terminal.

Stacks live under the application's data directory (`%APPDATA%/com.tbce.app/stacks` on Windows), independently of their source folders and the Recent list. Replacement publishes a new snapshot only after it succeeds; previous snapshot generations remain as recovery data until the stack is deleted. Deletion uses the Recycle Bin and leaves generated projects intact. Export/import, automatic source synchronization, and snapshot-history controls are deferred.

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

One workspace per window, explicit saves, and no editor session restoration or crash recovery. The editor supports UTF-8 files, optionally with BOM, up to 10 MiB, using LF or CRLF. Binary files, other encodings, and mixed/legacy line endings cannot be edited but can be copied in stack snapshots. Symlinks and junctions are rejected. Monaco language features are bundled locally; no CDN or account is required.

One terminal at a time, running the operating system's default shell. Multiple terminal tabs, terminal names, command history, and choosing a shell arrive in later milestones. On Windows the session is started in UTF-8 so that tool output and non-ASCII file names survive; `cmd.exe` and PowerShell are recognized, and any other shell keeps the code page it starts with. Closing a terminal ends its session and its scrollback. Closing the window stops every shell.

Rust confines editing and snapshot source reads to the selected workspace, saved stacks to application data, and new-project creation to a native-picked parent. Destructive editor operations cannot target the workspace root. The terminal starts in the workspace root and the webview cannot choose a program or directory, but commands the user types run with the application's privileges: the shell is not a sandbox. See the architecture notes for the local-process race limitation before building untrusted automation on these services.

## Documentation

- [Full product vision and V1/V2 roadmap](docs/roadmap.md)
- [Architecture and native interfaces](docs/architecture.md)
- [Windows acceptance checklist](docs/acceptance.md)
- [Verification results](docs/verification.md)
- [Remaining work](docs/remaining-work.md)

No project license has been selected. Git author configuration and repository ownership remain with the human owner.
