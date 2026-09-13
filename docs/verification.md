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

## Build notes

Vite reports a large lazy Monaco chunk, expected for the bundled editor and language support. Tauri warns that the requested `com.tbce.app` identifier ends in `.app`; it is retained as specified, with macOS packaging deferred. Initial sandbox path-access errors were resolved by running build tools with the required filesystem access.
