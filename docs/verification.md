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

## Milestone 5 — personal architectures, September 13, 2026

### Automated verification

- Frontend suite: 66 passed, including eight new architecture tests. Coverage includes empty catalogs, structure editing and literal text, stable IDs, failed-save input retention, dirty cancellation, catalog warnings, cancelled/confirmed deletion, legacy metadata, stack defaults, conflict blocking, selected-architecture creation, picker cancellation, obsolete preview results, and operation serialization.
- Rust suite: 45 passed, including seven new architecture tests. Coverage includes restart persistence, atomic edit behavior, corrupt/future/mismatched definitions, invalid paths and Windows case conflicts, shared-folder merging, conflict-free generation, empty directories, Unicode/line endings, fresh metadata, deletion preserving generated projects, existing destinations, and junction containment.
- TypeScript, ESLint, Prettier, Rust formatting, and Clippy with warnings denied: passed.
- Vite production build and Windows NSIS release packaging: passed using `npm run tauri build -- --target x86_64-pc-windows-msvc`. Executable: `src-tauri/target/x86_64-pc-windows-msvc/release/tbce.exe`; installer: `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/TBCE_0.1.0_x64-setup.exe`.
- The standard release build could not replace `src-tauri/target/release/tbce.exe` because that executable was running. The explicit target build used a separate output directory and succeeded without terminating the running application. The earlier executable in the standard release directory was not updated.
- Milestone 5 installer SHA-256: `12D588FC91EB8807FAE48E3E122728A7552281886E84428CD89D73395CE9C5AC`.

### Desktop and visual verification limits

- Computer Use initialization succeeded, but app discovery and a retry both returned `Computer Use native pipe is unavailable: failed to connect native pipe: The system cannot find the file specified. (os error 2)`.
- Browser discovery returned no browsers. No WebView2 or browser screenshot/layout verification was possible.
- Installed-app checks 36–42 remain pending, alongside earlier checks 15–35. Automated tests do not verify native picker/confirmation interaction, packaged restart persistence, or minimum-window-size layout.
- Frontend tests and packaging required expanded filesystem access because esbuild could not read parent directories under the sandbox. No dependency or system configuration change was needed.

### Implementation limits

The personal catalog starts empty. Structures are defined in the editor and generated only for new projects. Existing settings retain unavailable legacy metadata without generating files. There are no built-in presets, source-project capture, import/export, binary starter files, variable substitution, or advanced boundary enforcement. The existing local-filesystem race limitation applies.

## Desktop acceptance retry — September 13, 2026

The user explicitly requested desktop tests after Milestone 5 implementation. App discovery failed before a window could be selected. Resetting the JavaScript session, importing `@oai/sky` again, and retrying `sky.list_apps()` produced the same error: `Computer Use native pipe is unavailable: failed to connect native pipe: The system cannot find the file specified. (os error 2)`.

Read-only process inspection found the earlier `src-tauri/target/release/tbce.exe` running; no process for the Milestone 5 executable in the explicit Windows target directory was found. The Milestone 5 installer hash still matches the recorded SHA-256. These are environment checks, not desktop acceptance tests. No UI scenario was executed, no running application was stopped, and checks 15–42 remain pending until the native automation connection is available.

## Milestone 6 prerequisite audit — September 15, 2026

The user approved a backend-only Milestone 6 plan with a **verify-first gate**.
The [delivery checklist](milestone-6.md) records completed prerequisites separately
from blocked desktop acceptance and Git implementation, which has not started.

### P01 — tested source and environment

- Starting HEAD: `3acb15ef7577aa23973876459583489fc33ec670`.
- The working tree already contained the Milestone 5 architecture implementation,
  including modified tracked files and untracked architecture modules/tests. These
  changes were preserved. HEAD alone does not identify the tested code.
- [Source manifest](evidence/m6-prerequisites/source-manifest.txt): sorted SHA-256
  entries for tracked and nonignored untracked files, excluding `docs/` and
  `README.md`. Manifest SHA-256:
  `CE13FE67F226A1571A4E3A534A389388D7B351B44A9B869E828CADDDE0DBF339`.
- Node `24.15.0`, npm `11.12.1`, Rust/Cargo `1.96.0`, Git
  `2.54.0.windows.1`; Windows, PowerShell. `npm.cmd` was used because PowerShell's
  execution policy blocks `npm.ps1`; no execution-policy change was made.
- This run changed documentation/evidence only, not application source or dependencies.

### P02–P09 — automated evidence

Expected result for each command: exit 0, with all tests passing where applicable.
Logs retain original warnings and failed attempts. PowerShell sometimes formats
native stderr warnings as `NativeCommandError`; the observed process exit code,
not that formatting alone, determines success.

| ID  | Command                                                                          | Observed result                                 | Evidence                                                           |
| --- | -------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| P02 | `npm.cmd run format:check`                                                       | Exit 0; all matched files formatted             | [Log](evidence/m6-prerequisites/frontend-format-check.log)         |
| P03 | `npm.cmd run lint`                                                               | Exit 0                                          | [Log](evidence/m6-prerequisites/frontend-lint.log)                 |
| P04 | `npm.cmd test`                                                                   | Retry exit 0; 9 files, 66 tests passed          | [Passing log](evidence/m6-prerequisites/frontend-test-retry.log)   |
| P05 | `npm.cmd run build`                                                              | Retry exit 0; TypeScript and Vite passed        | [Passing log](evidence/m6-prerequisites/frontend-build-retry.log)  |
| P06 | `cargo fmt --manifest-path src-tauri/Cargo.toml --check`                         | Exit 0                                          | [Log](evidence/m6-prerequisites/rust-format.log)                   |
| P07 | `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | Exit 0                                          | [Log](evidence/m6-prerequisites/rust-clippy.log)                   |
| P08 | `cargo test --manifest-path src-tauri/Cargo.toml --locked`                       | Exit 0; 45 tests passed                         | [Log](evidence/m6-prerequisites/rust-test.log)                     |
| P09 | `npm.cmd run tauri build -- --target x86_64-pc-windows-msvc`                     | Isolated retry exit 0; NSIS installer generated | [Passing log](evidence/m6-prerequisites/windows-package-retry.log) |

Installer: `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/TBCE_0.1.0_x64-setup.exe`.
SHA-256: `DA67EC807AD60B90A7768A4B23A6AA426B2AE1D05A482CAD8F54EBAC4A57F018`.
Raw log and manifest hashes are recorded in the
[evidence index](evidence/m6-prerequisites/evidence-sha256.txt).

### Mismatches, causes, and corrections

1. Initial frontend [tests](evidence/m6-prerequisites/frontend-test.log) and
   [build](evidence/m6-prerequisites/frontend-build.log) exited 1 because esbuild
   could not read parent directories under the sandbox. Expanded-filesystem-access
   retries passed without changing application code or system configuration.
2. The [first packaging attempt](evidence/m6-prerequisites/windows-package.log)
   exited 1 while preparing `dist/assets`. Packaging had been started before the
   standalone frontend build finished, so both Vite builds accessed the same
   output directory. Rerunning packaging alone after the other build exited
   succeeded (exit 0); this was an orchestration failure, not proof of a product defect.
3. Desktop discovery failed before selecting any app/window, both initially and
   after resetting/reinitializing the session. The error is a missing Computer
   Use native pipe (`os error 2`). [Discovery evidence](evidence/m6-prerequisites/desktop-discovery.txt).
   No supported recovery succeeded in this session. No UI action or acceptance
   scenario ran, and no application-source change can be justified by this error.

### P10–P12 — gate remains blocked

Installed-app checks 15–42 remain unexecuted, alongside earlier unverified editor
scenarios listed in the delivery checklist. Passing 111 automated tests does not
verify native picker/confirmation interaction, packaged restart persistence,
terminal UI behavior, or minimum-size layout. No new installer has been installed
or exercised in this run. Historical September 13 desktop observations must not
be presented as current-build acceptance.

Resume by restoring desktop automation or collecting documented manual acceptance
against the identified build. Fix failures and rerun the affected scenarios before
checking P10/P11/P12. All Git implementation and final milestone-verification
checkboxes remain open under the user's approved prerequisite gate.

## Milestone 6 — Git backend, September 16, 2026

The Git backend is implemented and covered by automated tests against real Git.
**This is not desktop acceptance.** No installed-app scenario has run in this
session; the prerequisite gate items P10, P11 and P12 remain open, and the
[manual run-sheet](acceptance-runsheet-m6.md) exists so a person can close them.

### Scope decision

The [delivery checklist](milestone-6.md) gates implementation behind installed-app
checks 15–42. Desktop automation is still unavailable — the missing Computer Use
native pipe recorded on September 15 was not resolved — and those checks need a
person driving native pickers and confirmations. The user directed that
implementation proceed alongside a manual acceptance path rather than waiting. That
waiver is recorded here, in the checklist, and in the acceptance checklist, and none
of the desktop checkboxes were ticked.

### Automated verification

Every command below exited 0. Raw output:
[automated checks](evidence/m6-git/automated-checks.log).

| Check                                       | Before | After | Result |
| ------------------------------------------- | ------ | ----- | ------ |
| `npm run format:check`                      | —      | —     | Pass   |
| `npm run lint`                              | —      | —     | Pass   |
| `npx tsc -b`                                | —      | —     | Pass   |
| `npm test`                                  | 66     | 73    | Pass   |
| `cargo fmt --check`                         | —      | —     | Pass   |
| `cargo clippy --all-targets -- -D warnings` | —      | —     | Pass   |
| `cargo test --locked`                       | 45     | 81    | Pass   |

Thirty-six new Rust tests and seven new frontend tests. Environment: Git
2.54.0.windows.1, Node 24.15.0, npm 11.12.1, Cargo 1.96.0, Windows.
[Source manifest](evidence/m6-git/source-manifest.txt) fingerprints the tested
tracked and untracked sources, excluding `docs/` and `README.md`.

### Independent inspection

The Rust suite drives real Git in disposable directories whose names contain spaces
and Turkish characters, using a local bare remote and two clones for fetch, pull,
push and divergence. Results are confirmed by inspecting Git itself rather than by
trusting return values: `show-ref` and `rev-parse` for refs, `ls-files --stage` and
`ls-files -u` for the index, `show HEAD:<path>` for commit contents, and direct
file reads for working bytes. Refusals assert that refs, the index and file bytes
are unchanged — for example, a rejected push leaves the bare repository at its
previous tip, and unstaging leaves the working file byte-identical.

Two tests verify hardening by consequence rather than by assertion about arguments:
a configured `diff.external` command writes a sentinel file if it ever runs, and the
diff test asserts both a real patch and the absence of that sentinel. A second test
asserts that `--global`, `--system` and `GIT_CONFIG_NOSYSTEM` appear nowhere in the
service's code.

A registration test compares the Git commands declared in `commands/mod.rs` against
the invoke handler, the build-time manifest and the window capability, so a missed
registration fails the suite instead of only failing in the packaged application.

### Production bundle exclusion

The development-only harness is excluded from a production build. Evidence:
[bundle exclusion](evidence/m6-git/production-bundle-exclusion.txt). Neither the
component name nor its marker string appears anywhere in `dist/`, and no harness
chunk is emitted. The typed adapter `src/services/git.ts` does ship and does name
the commands, which is expected.

### Packaging

`npm run tauri build -- --target x86_64-pc-windows-msvc` exited 0
([log](evidence/m6-git/windows-package.log)). Installer:
`src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/TBCE_0.1.0_x64-setup.exe`,
SHA-256 `D87F715D8D62A2C153458FFDCFAABEC789B5E3494F1BD06287309BF641101EF4`. The
installer was **not** installed or exercised in this session.

### Corrections made during this work

1. `docs/evidence/desktop-audit/bom-crlf-roundtrip.json` is a UTF-16 artifact that
   Prettier cannot parse, so `npm run format:check` failed against the current tree
   even though the September 15 audit recorded it passing. Captured evidence is raw
   data and reformatting it would destroy the record, so `docs/evidence` was added
   to `.prettierignore` rather than the file being rewritten.
2. Two test failures during development were genuine environment sensitivities, not
   product defects, and were fixed in the fixtures: a clone checked out with the
   machine's global `core.autocrlf` before the fixture overrode it, which made every
   file look modified; and a clone test asserted LF bytes where the same setting
   produces CRLF. Production deliberately respects `core.autocrlf`, so the tests were
   corrected rather than the behaviour.
3. `git clone --progress=false` is rejected by Git, which takes no value for that
   option. Caught by the clone test and corrected to `--no-progress`.

### Not verified

- Installed-app behaviour of anything in this milestone. No Git operation has been
  performed through the packaged application.
- Acceptance checks 15–42 and the new Git checks 43–56.
- Operating systems other than Windows.
- Real network remotes, authenticated HTTPS and SSH. Remote behaviour is proven
  against a local bare repository only, so credential-helper and SSH-agent paths are
  untested. A passphrase-protected key with no agent will run to the network deadline
  and be reported as a timeout.
- Installer upgrade and uninstall, signing, and release ownership.

## Build notes

Vite reports a large lazy Monaco chunk, expected for the bundled editor and language support. Tauri warns that the requested `com.tbce.app` identifier ends in `.app`; it is retained as specified, with macOS packaging deferred. Initial sandbox path-access errors were resolved by running build tools with the required filesystem access.
