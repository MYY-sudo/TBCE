# Verification — Windows, 2026-09-13

## Automated checks

- TypeScript and Vite production build: passed.
- ESLint: passed.
- Frontend suite: 14 passed. Covers rendering, native-only access messaging, duplicate tabs, dirty baselines, Save All, failed saves, cancellation, conflicts, external changes, rename/trash reconciliation, and operation serialization.
- Rust suite: 9 passed. Covers Unicode/BOM/CRLF round trips, traversal and root protection, junction rejection, collisions, revisions, read-only saves, size/encoding limits, mixed line endings, and stale workspace identifiers.
- Clippy with warnings denied: passed.
- Prettier and Rust formatting checks: passed.
- npm audit after updating Vitest: zero reported vulnerabilities.
- NSIS release packaging: passed; installer completed with exit code 0.

## Installed-app checks performed

The unsigned installer was installed into the ignored `.verification/installed` directory and launched without a Vite server.

- Inspected the dark shell, explorer, tabs, editor, and modal layout at 1280 × 820 client size.
- Opened a disposable folder containing spaces and Turkish characters using the native picker.
- Expanded a source directory and opened Markdown and TypeScript files in Monaco.
- Edited a BOM + CRLF Markdown file and saved with Ctrl+S. Independent byte inspection confirmed the edit, `EF-BB-BF` BOM, and all three original CRLF separators.
- Switched between two tabs; verified content and cursor/view retention.
- Entered a TypeScript type mismatch and observed the diagnostic underline in the packaged app, exercising the bundled language worker.
- Closed a dirty tab with Ctrl+W, cancelled, and verified the buffer remained. Repeated with Save and verified the tab closed after saving.
- Created a new file through the explorer; it appeared in the tree and opened in a new tab.
- Renamed that file through the explorer; its disk path, explorer row, and open tab all changed together.
- Opened the native Recycle Bin confirmation, cancelled it, and verified that the file and tab remained.
- Closed a clean workspace through the native window lifecycle.
- Reinstalled the final package with exit code 0. The installed executable matches the release byte-for-byte except for Tauri's three-byte bundle-type marker (`NSS` in the NSIS installation versus `UNK` in the standalone executable).
- Reopened the saved Markdown document in the final installed package. Its saved edit remained, Monaco loaded, and cursor status showed line 1, column 1.
- Created a folder in the final package and verified that the new folder became the explorer selection.

## Follow-up verification

The installed-app run exposed stale cursor status on first opening a tab and the previous selection remaining after creation. Both are corrected in the final package. All 23 tests, lint, type checking, formatting checks, Clippy, and the release build passed after the corrections.

The remaining manual checklist is not yet fully executed: confirmed Recycle Bin deletion/restoration, native file picker, save-conflict UI, dirty app-exit prompts, minimum-size layout, and installer version upgrades/uninstall. Service/store tests cover their implemented logic where listed above. macOS/Linux and signed distribution are unverified.

UI automation was temporarily interrupted by an automatic approval-review usage-limit error, then resumed successfully. No filesystem deletion was attempted by the rejected action.

Final NSIS installer SHA-256: `B309E852D3D289ED3C629289F4C781E8EB12C1A4CBDE2C5A55BBF28557C3440B`.

## Milestone 2 — integrated terminal

### Automated checks

- Prettier, ESLint, TypeScript, and the Vite production build: passed. The terminal ships as a separate 333 KB lazy chunk, so xterm.js loads only when the panel is first opened.
- Frontend suite: 24 passed, up from 14. The new tests cover subscribing before a shell starts, routing output to the attached view and stopping at detach, ignoring an exit reported by a replaced session, restart, keystroke and resize forwarding, closing, stopping the shell when another workspace opens, refusing to open without a workspace, and reporting a failed start.
- Rust suite: 15 passed, up from 9. The terminal tests drive real shells through ConPTY rather than mocks: output streaming, exit codes 0 and 3, a working directory proven by a probe file, input round trips, resize, termination of a running shell, termination of an already-exited process, session replacement on restart, and multi-byte output split across reads.
- Clippy with warnings denied, Rust formatting, and NSIS release packaging: passed. The installer was produced at `src-tauri/target/release/bundle/nsis/TBCE_0.1.0_x64-setup.exe`.

### Findings from this milestone

ConPTY does not start the child process until the terminal answers its cursor-position query. A session whose first output is missed therefore hangs with an empty panel instead of failing. The frontend subscribes to terminal events before requesting a shell, and a test asserts that xterm.js produces the answer. The Rust tests stand in for the emulator themselves.

portable-pty 0.9.0 reports a successful Windows `TerminateProcess` as an error. Stopping a terminal therefore confirms that the process actually ended rather than trusting the returned status.

### Not yet verified

The installed-app checks for the terminal are not executed: interactive typing, colored output, cancelling a command with Ctrl+C, rewrapping on resize, hiding and reopening the panel, and confirming through Task Manager that no shell survives a close, a workspace change, or application exit. Those are items 15 to 22 of the acceptance checklist. The terminal is unverified on macOS and Linux.

## Build notes

Vite reports a large lazy Monaco chunk, expected for the bundled editor and language support. Tauri warns that the requested `com.tbce.app` identifier ends in `.app`; it is retained as specified, with macOS packaging deferred. Initial sandbox path-access errors were resolved by running build tools with the required filesystem access.
