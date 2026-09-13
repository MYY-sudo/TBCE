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

## Milestone 3 — project system

### Automated checks

- Prettier, ESLint, TypeScript, and the Vite production build: passed.
- Frontend suite: 36 passed, up from 24. The new tests cover creating a project, cancelling the location picker, detecting a manifest when a workspace opens, recording a plain folder without treating it as a project, reporting an unreadable manifest without failing, forgetting a recent project that no longer opens, reopening one and redetecting its manifest, converting and then updating settings, local-storage persistence with deduplication and the ten-entry cap, and clearing the project when the workspace closes. The app tests cover the recent list and the new-project prompt.
- Rust suite: 22 passed, up from 15. The project tests cover an absent manifest, an init/detect round trip, invalid JSON, an unsupported schema version, refusing to initialize twice, refusing to update before initializing, full field replacement, blank names, and `.git` detection.
- Clippy with warnings denied and Rust formatting: passed.

### Findings from this milestone

Tauri generates command permissions from the list in `build.rs`, not from the invoke handler. A command added to `lib.rs` and the capability file alone fails the build with an unknown-permission error until `build.rs` names it too.

Canonical Windows roots carry a `\\?\` verbatim prefix. The project path strips it so it never reaches the interface or the stored recent list, which uses the path spelling the user picked.

jsdom implements neither `showModal` nor `close` on `<dialog>`, so the test setup supplies both. Without them, any test that renders a real dialog throws.

### Not yet verified

Items 23 to 27 of the acceptance checklist are not executed in an installed app: creating a project through the native picker, converting a folder and editing its settings on disk, the Recent list surviving a restart, a moved project being reported and removed, and repairing a corrupt manifest. macOS and Linux remain unverified.

## Milestones 2 and 3 — corrective review, September 13, 2026

- Frontend suite: 45 passed. Added regression coverage for workspace changes during terminal start/restart, session-specific startup output and exit handling, output retained until the view remounts, retrying failed cleanup, obsolete project detection/save results, and typing commands containing spaces.
- Rust suite: 28 passed on Windows. Manifest reads and writes now share the editor's containment/link validation, including missing metadata directories. Junction tests cover both `.tbce` and `project.json` and verify that an outside sentinel file remains unchanged. A serialization test confirms that boxing the detection manifest preserves the public JSON shape.
- ESLint, TypeScript, Prettier, Rust formatting, and Clippy with warnings denied: passed. The previous `large_enum_variant` Clippy failure is resolved.
- Final production build and NSIS packaging: passed. Updated executable: `src-tauri/target/release/tbce.exe`; installer: `src-tauri/target/release/bundle/nsis/TBCE_0.1.0_x64-setup.exe`. The package has not been installed or exercised through the desktop interface in this review.
- The CMD canonical-path startup/restart and Turkish output tests still pass through real ConPTY shells. Frontend lifecycle tests use mocked native calls and do not substitute for installed-app verification.
- Desktop acceptance checks 15–27 remain unexecuted in this review. Computer Use failed with `Computer Use native pipe is unavailable: failed to connect native pipe: The system cannot find the file specified. (os error 2)` on the initial attempt, retry, and retry after resetting the JavaScript session.
- Milestone 4 remains pending until the desktop acceptance checks can be completed. No stack catalog or project scaffolding was added during this corrective review.

## Milestone 4 — personal saved stacks, September 13, 2026

### Automated verification

- Frontend suite: 58 passed. Added service/store and React-dialog tests for catalog loading, command defaults and overrides, selected files, deliberate inclusion of excluded files/directories, inspection failure and refresh, metadata editing, empty-library guidance, snapshot dirty-buffer choices, creation cancellation/failure, operation serialization, stale workspace rejection, replacement cancellation, and confirmed deletion. The old folder-only creation tests were replaced by tests for the staged creation flow.
- Rust suite: 38 passed, including 10 new template tests. These cover an empty library, source deletion and service restart, binary/BOM/CRLF/Unicode file preservation, empty directories, fresh project metadata, exclusion defaults and overrides, stable IDs on replacement, failure preserving the old snapshot, metadata edits/deletion leaving generated projects intact, invalid paths and collisions, corrupt/future catalogs, corrupt snapshot contents, and Windows junction containment.
- TypeScript, ESLint, Prettier, Rust formatting, and Clippy with warnings denied: passed.
- Final production frontend build and NSIS release packaging: passed. Executable: `src-tauri/target/release/tbce.exe`; installer: `src-tauri/target/release/bundle/nsis/TBCE_0.1.0_x64-setup.exe`. This new package has not been installed or exercised through the desktop interface.
- Milestone 4 installer SHA-256: `C0B0550E49C3AAD100692C04B445E685C6074FF40B083DCDD8E1017DE4A50369`.

### Desktop and visual verification limits

- The prerequisite desktop checks 15–27 were attempted before implementation, but Computer Use returned `Computer Use native pipe is unavailable: failed to connect native pipe: The system cannot find the file specified. (os error 2)`. Retrying after implementation returned the same error.
- The browser connection also returned `No browser is available`, so no screenshot/layout verification was performed. React tests exercise behavior under jsdom, not rendering in WebView2.
- The user requested implementation and then continuation; implementation and automated verification proceeded. Installed-app acceptance checks 15–35 remain pending, including native confirmation/picker behavior, terminal integration, packaged persistence across restart, and minimum-window-size layout. Automated tests do not substitute for those checks.
- The first elevated release-build request was rejected by automatic approval review because its service hit a usage limit. A retry after the user's continuation was accepted.

### Implementation limits

Snapshot generations are local and independent; replacements retain old generations as recovery data until stack deletion. There is no history browser, import/export, automatic synchronization, progress percentage, or mid-copy cancellation. Normal copy failures preserve the old snapshot; abrupt termination can leave unused staging directories. Snapshot copying preserves bytes and directory structure, not platform-specific ACLs or executable modes. Other operating systems and adversarial local filesystem races are unverified.

## Build notes

Vite reports a large lazy Monaco chunk, expected for the bundled editor and language support. Tauri warns that the requested `com.tbce.app` identifier ends in `.app`; it is retained as specified, with macOS packaging deferred. Initial sandbox path-access errors were resolved by running build tools with the required filesystem access.
