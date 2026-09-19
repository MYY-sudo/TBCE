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

4. The first package was built before `src-tauri/src/git/mod.rs` was normalized to LF, which
   the repository's `.gitattributes` requires and which `git` warned about. Normalizing it
   changed the source fingerprint, so the manifest no longer described the bytes that installer
   was compiled from. Both the manifest and the installer were regenerated rather than the
   mismatch being explained away: a build identity that does not match its manifest is not a
   build identity.

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

## Milestone 7 — source control panel, September 16, 2026

The source-control panel is implemented and covered by automated tests.
**This is not desktop acceptance.** No installed-app scenario has run in this
session; Milestone 6 gate items P10, P11 and P12 remain open, and the new checks
57-66 are added to the [manual run-sheet](acceptance-runsheet-m6.md) unexecuted.

### Scope decisions

Both were confirmed by the user before implementation and are recorded in the
[delivery checklist](milestone-7.md).

1. The preview shows the backend's unified patch read-only in Monaco with `diff`
   highlighting rather than a Monaco diff editor, because `git_diff` answers with a
   patch and not with two file versions. A side-by-side view would have required a
   nineteenth backend command inside a milestone whose scope is the interface.
2. The panel covers all eighteen Git commands — remote operations, paged history and
   the initialize/clone entry points included — rather than only the roadmap's minimal
   example, so the acceptance checks no longer depend on the development harness.

### Desktop acceptance waiver

Desktop automation is still unavailable; the missing Computer Use native pipe recorded
on September 15 was not resolved, and no attempt was made to work around it in this
session. The user directed that Milestone 7 proceed under the same waiver applied to
Milestones 4, 5 and 6. No desktop checkbox was ticked anywhere on the strength of this
work.

### Automated verification

Every command below exited 0. Raw output:
[automated checks](evidence/m7-git-ui/automated-checks.log).

| Check                                       | Before | After | Result |
| ------------------------------------------- | ------ | ----- | ------ |
| `npm run format:check`                      | —      | —     | Pass   |
| `npm run lint`                              | —      | —     | Pass   |
| `npx tsc -b`                                | —      | —     | Pass   |
| `npm test`                                  | 73     | 111   | Pass   |
| `cargo fmt --check`                         | —      | —     | Pass   |
| `cargo clippy --all-targets -- -D warnings` | —      | —     | Pass   |
| `cargo test --locked`                       | 81     | 81    | Pass   |

Thirty-eight new frontend tests and no new Rust tests. The Rust count is deliberately
unchanged: this milestone added no Rust source, so its Rust suite is a regression
guard rather than new proof. Environment: Git 2.54.0.windows.1, Node 24.15.0,
npm 11.12.1, Cargo 1.96.0, Windows.
[Source manifest](evidence/m7-git-ui/source-manifest.txt) fingerprints the tested
tracked and untracked sources, excluding `docs/` and `README.md`. Manifest SHA-256:
`091410EA4446847FDF7F375974E80935B624BEAFECA547FAA2979604D54E0210`.

### What the new tests actually assert

Sixteen store tests, nineteen panel tests and three shell tests, against a mocked adapter. The ones worth
naming, because they encode decisions rather than restating the code:

- Detection alone runs no `git_status`, `git_branches` or `git_history`, so opening a
  folder still never waits on the repository.
- A status answer that arrives after the user opened a different folder is discarded,
  and the store keeps its null status rather than showing the previous folder's state.
- A second operation started while one runs is refused and never reaches the adapter.
- Staging writes the status the backend returned and does **not** reread branches or
  history, which is asserted by clearing those mocks and requiring zero calls.
- A commit refused for a missing identity keeps the typed message. Losing a written
  commit message because Git refused the commit would be its own failure.
- A cancelled branch deletion — the backend answering false after a cancelled native
  confirmation — leaves the branch list untouched and rereads nothing.
- Pushing a branch with no upstream passes `setUpstream: true`; a tracked branch
  passes false.
- A preview whose file no longer differs after staging is dropped silently rather than
  surfaced as an error.
- Each of the four detection states renders its own panel, and both the parent-repository
  and no-folder states are asserted to run no Git at all.
- Opening a diff hides the editor rather than unmounting it, asserted by requiring the
  editor to stay in the document while not visible.

### Production bundle

The development-only harness is still excluded, rechecked against the new bundle:
[bundle exclusion](evidence/m7-git-ui/production-bundle-exclusion.txt). The panel ships
in the main entry chunk and the diff preview as its own 1.8 KB lazy chunk.

### Packaging

`npm run tauri build -- --target x86_64-pc-windows-msvc` exited 0. Installer:
`src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/TBCE_0.1.0_x64-setup.exe`,
SHA-256 `50E57BE3C2BE06DE7D99185C1A7E4588CDFBE26B81618B7C7E489A2C9A539C93`. It was
built from a clean `dist` after the final correction, and was **not** installed or
exercised in this session.

### Corrections made during this work

1. The first version of the shell wiring rendered the diff preview **instead of** the
   editor. That unmounts the editor, and its cleanup disposes every Monaco model, so
   opening a diff would have silently cost every open tab its undo history. The editor
   is now hidden rather than removed, and a test asserts that it stays in the document
   while not visible. This was found by reading the editor's cleanup, not by a failing
   test, and the claim that open tabs are untouched would otherwise have been wrong.
2. A first draft asserted that history paging called the adapter with an explicit
   `null` path. The adapter defaults that argument, so the mock recorded three
   arguments rather than four. The assertion was corrected; the code was not, because
   the adapter's default is the intended contract.
3. A panel test asserted a single element with the branch name. The branch names both
   the header and the branch list, so the assertion was corrected to expect both
   rather than the panel being changed to show it once.

### Not verified

- Installed-app behaviour of anything in this milestone. No Git operation has been
  performed through the packaged application, and no panel has been rendered in
  WebView2. jsdom tests do not substitute for that.
- Acceptance checks 15-42 and the new Git UI checks 57-66.
- Layout at 1280 × 820 and at the minimum 800 × 540 window size. No screenshot or
  rendering check was possible.
- Native picker and native confirmation behaviour for clone and branch deletion.
- Real network remotes, authenticated HTTPS and SSH, which the backend record already
  lists as unexercised.
- Operating systems other than Windows.

## Installed-app acceptance attempt — September 17, 2026

**Blocked before any installed-app scenario.** The requested implementation was
attempted in Default execution mode, after the planning turn. No check below
passed or failed on product behavior; none could be exercised. P10, P11 and P12
remain unchecked. Git UI checks 57–66 remain pending.

### Build and environment

- Source revision: `10b4ba84cf595e76d0f9d668abb201eb190d7ae8`; the working tree was
  clean before this attempt. Application sources were not changed.
- [Source manifest](evidence/desktop-acceptance-2026-09-17/source-manifest.txt),
  excluding documentation and README: SHA-256
  `77CB916D50C21064975480405E4E2743D4A66B9B2B1FF3648372CB4CA79F09B5`.
- Windows NT 10.0.26220.0; TBCE 0.1.0; Git 2.54.0.windows.1;
  Node 24.15.0; npm 11.12.1; Cargo 1.96.0.
  [Environment capture](evidence/desktop-acceptance-2026-09-17/environment.txt).
- `npm run tauri build -- --target x86_64-pc-windows-msvc` passed after rerunning
  with the filesystem access required by Vite. The initial sandboxed attempt
  failed while reading a parent directory.
  [Build log](evidence/desktop-acceptance-2026-09-17/windows-package.log);
  [initial failure](evidence/desktop-acceptance-2026-09-17/windows-package-sandbox-failure.log).
- Installer: `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/TBCE_0.1.0_x64-setup.exe`;
  SHA-256 `9DFC7C73091D69891327587E324B61DE8CB82FFADE5D570E9BA8BC7312E5CA33`.
  [Package identity](evidence/desktop-acceptance-2026-09-17/package-identity.txt).
  This package was **not installed or launched** in this attempt.

### Desktop blocker and recovery

Importing `@oai/sky` succeeded, but `sky.list_apps()` returned:

```text
Computer Use native pipe is unavailable: failed to connect native pipe: The system cannot find the file specified. (os error 2)
```

Resetting the JavaScript session, importing again and retrying discovery returned
the same error. [B1: discovery record](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json)
records that sequence and the final tool result. A separate
[read-only pipe inspection](evidence/desktop-acceptance-2026-09-17/native-pipe-inspection.txt)
found no matching Computer Use endpoint. This reproduced the blocker outside Plan
mode. A stale configured endpoint or helper lifecycle problem remains a hypothesis,
not a proven root cause. No Codex configuration or permissions were changed.

The user was asked to check the Computer Use server/skill toggles and use Enable
and Try now in the plugin screen, following the
[official setup instructions](https://learn.chatgpt.com/docs/computer-use).
The connection was not repaired during this attempt. Before resuming, require
successful window discovery and an application screenshot, then install the
identified package and run the scenarios through its UI. If the package changes,
record the new hash and the checks exercised against it.

### Prepared fixtures

Disposable files under
`.verification/desktop-acceptance-2026-09-17/Masaüstü deneme ğüşıöç` include
Turkish UTF-8 text, BOM/CRLF, binary bytes, empty directories, capture exclusions
and unsupported-file examples. The
[fixture manifest](evidence/desktop-acceptance-2026-09-17/fixture-manifest.json)
records their initial bytes and hashes. Local Git fixtures contain a bare remote
and two working copies with disposable repository-local identities. Fixture
preparation is not acceptance evidence. Existing personal catalogs and project
data were not modified.

### Run-sheet results

Expected results below summarize [acceptance.md](acceptance.md); all substeps in
that checklist still apply. B1 supports the common infrastructure blocker, not
the expected application behavior. There are **45 blocked checks, 0 passes and
0 product failures** in this attempt. Checks 2, 7, 9, 10 and 13 cover P11;
11–12 retain the additional editor gaps; 15–42 cover P10; 57–66 cover Git UI.

| Check | Expected                                                                                                                        | Observed                           | Evidence                                                            | Status  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------- | ------- |
| 2     | Native picker opens the folder; cancelling preserves the workspace.                                                             | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 7     | Cancel, Save and Discard preserve or persist edits correctly on tab close, workspace replacement and exit.                      | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 9     | Recycle Bin confirmation/cancellation, affected tabs and Windows restoration work.                                              | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 10    | Refresh reloads clean files; dirty conflicts support Cancel, Reload and explicit Overwrite.                                     | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 11    | Missing-file buffers survive; read-only save errors preserve edits.                                                             | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 12    | Unsupported files, invalid names and collisions produce actionable errors without data loss.                                    | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 13    | Resize, focus, Escape, explorer and status remain usable at minimum size.                                                       | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 15    | Both terminal entry points work; opening is disabled without a workspace.                                                       | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 16    | Terminal starts in the workspace and renders Turkish output correctly.                                                          | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 17    | Ctrl+C cancels an interactive command without killing the shell; colors render.                                                 | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 18    | Divider/window resizing rewraps terminal output.                                                                                | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 19    | Hidden-terminal output continues and scrollback survives.                                                                       | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 20    | Exit code appears; Restart opens a working shell in the same folder.                                                            | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 21    | Terminal Close and workspace replacement leave no orphan shell.                                                                 | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 22    | Application exit leaves no orphan shell.                                                                                        | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 23    | New project creates its folder/manifest and opens; duplicate names are refused.                                                 | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 24    | Folder conversion and edited project metadata match the disk manifest.                                                          | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 25    | Recent persists across restart and distinguishes projects from plain folders.                                                   | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 26    | Missing Recent folders show an error and their entries are removed.                                                             | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 27    | Invalid/future manifests report errors and can be repaired through settings.                                                    | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 28    | Empty stack catalog, inclusion defaults, metadata exclusions and selection counts behave correctly.                             | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 29    | Capture honors unsaved-buffer choices, save failures and externally changed-file refresh.                                       | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 30    | Saved stack survives restart/source removal and creates byte-correct projects without executing commands.                       | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 31    | Stack replacement preserves ID; cancellation/failure preserves old snapshots and existing projects.                             | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 32    | Stack deletion supports cancellation and Recycle Bin recovery without changing existing projects.                               | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 33    | Project creation failure/cancellation preserves dirty workspace and terminal; success retires it; submissions do not duplicate. | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 34    | Links are unavailable; damaged/future stacks warn without hiding healthy entries.                                               | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 35    | Stack dialogs support keyboard, busy states, long content and actions at both required window sizes.                            | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 36    | Architecture creation validates and preserves nested/empty folders, Turkish UTF-8 files and unsaved-change cancellation.        | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 37    | Architectures persist and retain IDs; damaged/future entries warn without hiding healthy ones.                                  | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 38    | Architecture-based creation produces literal content, empty folders and fresh metadata without executing commands.              | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 39    | Stack/architecture composition preserves compatible files and blocks path/case conflicts until corrected.                       | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 40    | Architecture defaults work; settings only change metadata; unavailable IDs remain explained.                                    | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 41    | Architecture deletion/recovery and creation cancellation/failure preserve projects, buffers and terminal as specified.          | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 42    | Architecture dialogs support keyboard, busy controls and reachable actions at both required window sizes.                       | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 57    | Source control explicitly initializes/clones; branch labels agree; parent-repository operations are refused.                    | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 58    | Missing Git is explained while folder opening, editing and saving remain usable.                                                | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 59    | Staged/unstaged lists, Unicode paths and counts match independent Git output.                                                   | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 60    | Individual/all staging and unstaging, including unborn branches, preserve working-file bytes.                                   | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 61    | Invalid commits are disabled/refused and retain the draft; valid commits contain staged bytes only.                             | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 62    | Conflicts block commits until resolved and staged.                                                                              | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 63    | Branch creation, clean checkout and confirmed deletion work; dirty checkout/current-branch deletion are refused.                | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 64    | Local-remote fetch/pull/push, publication and ahead/behind work; divergence refusals preserve remote refs.                      | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 65    | Native clone flow preserves workspace; cancellations/collisions/unsafe transports create nothing unwanted.                      | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |
| 66    | Read-only text/staged/rename/binary previews preserve tabs; history pagination, empty history and layout work.                  | Not run; desktop discovery failed. | [B1](evidence/desktop-acceptance-2026-09-17/desktop-discovery.json) | blocked |

The run-sheet group mapping was corrected and the Git UI group was added. Merely
recording these blocked results does not satisfy P12 or establish desktop
acceptance. The previous dated verification records remain unchanged.

Documentation validation passed: Prettier on the three changed Markdown files,
`git diff --check`, all new evidence links, the installer hash, the 45-check result
set, and all 95 application-source fingerprints. The gate boxes remain unchecked.
[Record validation](evidence/desktop-acceptance-2026-09-17/record-validation.txt).
Application test suites were not rerun: no application source changed, and they
would not resolve the desktop blocker.

## Installed-app acceptance resumed — September 17, 2026, 00:16 +03:00

Computer Use discovery and screenshot capture succeeded in the fresh session. The
original installer hash and all 95 source fingerprints matched the previous record.
The package was installed into the disposable acceptance directory.
[Build and installation identity](evidence/desktop-acceptance-2026-09-17/resumed-001/identity.json).

The original package **failed check 1**: it exited before creating a window.
[Captured startup error](evidence/desktop-acceptance-2026-09-17/resumed-001/launch-stderr.txt)
reported duplicate Tauri managed state for `Mutex<()>`. Both `Templates` and `Git`
were aliases of that same concrete type. They now use separate newtypes; a regression
test verifies that all managed service TypeIds are distinct.

The 82 Rust tests and Clippy passed after the fix. Initial attempts to exercise a
Tauri builder inside the unit-test executable failed at Windows loader startup
(`STATUS_ENTRYPOINT_NOT_FOUND`); the final test checks the state-key invariant without
requiring the native GUI runtime. These automated results do not establish desktop
acceptance.
[Rust results](evidence/desktop-acceptance-2026-09-17/resumed-001/rust-tests-final.log),
[Clippy](evidence/desktop-acceptance-2026-09-17/resumed-001/clippy.log),
[fixed source manifest](evidence/desktop-acceptance-2026-09-17/resumed-001/source-manifest-fixed.txt).

The first Computer Use launch request timed out awaiting app approval. The retry
returned successfully but opened the historical `.verification/installed/tbce.exe`,
which was identified through its process path and closed. Its screenshot is not
credited to the current package. Directly launching the newly installed executable
exposed the startup panic above. Existing app data was backed up to the ignored
acceptance directory; the two catalog directories were empty before testing.

Execution is ongoing. Per-check Expected, Observed, Evidence and Status are recorded
in [the current result ledger](evidence/desktop-acceptance-2026-09-17/resumed-001/results.json).
P10/P11/P12 remain unchecked until their complete installed-app scenarios pass.

## Milestone 8 — GitHub connection, September 17, 2026

Read-only GitHub repository context is implemented and covered by automated tests against a mock
GitHub API. **This is not desktop acceptance.** No installed-app scenario ran in this session, no
real GitHub request was made, Milestone 6 gate items P10, P11 and P12 remain open, and the new
checks 67-74 are added to the [manual run-sheet](acceptance-runsheet-m6.md) unexecuted.

### Scope decisions

All four were confirmed by the user before implementation and are recorded in the
[delivery checklist](milestone-8.md).

1. **Authentication** is a Personal Access Token validated against `GET /user` and kept in the
   Windows Credential Manager. OAuth device flow would need a registered GitHub application and a
   client identifier in the source; reusing the token Git Credential Manager holds would give no
   promise of API scopes and no account to manage.
2. **Breadth** is the connection plus Overview, Branches, Commits and repository activity. Issue
   and pull request lists stay in Milestones 9 and 10.
3. **Proof** is a mock GitHub API on a local socket, so pagination, rate limits, `401`/`403`/`404`,
   `ETag`/`304`, oversized answers, timeouts and Unicode are exercised with no network and no token
   in CI.
4. **Desktop acceptance** continues under the Milestone 4-7 waiver, with its reason restated.

### Desktop acceptance waiver, and what changed about it

Desktop automation is **no longer unavailable**. The
[resumed run](#installed-app-acceptance-resumed--september-17-2026-0016-0300) discovered the
application, installed it and passed check 1 against the fixed installer. The 45 remaining checks
are unexecuted because the package under test crashed at startup, which was fixed in that same run.
The waiver therefore still applies, but its justification is now "45 checks unexecuted, one recorded
pass" rather than a missing Computer Use pipe. Repeating the old claim would have been false. No
desktop checkbox was ticked anywhere on the strength of this work.

### Automated verification

Every command below exited 0. Raw output:
[automated checks](evidence/m8-github/automated-checks.log).

| Check                                       | Before | After | Result |
| ------------------------------------------- | ------ | ----- | ------ |
| `npm run format:check`                      | —      | —     | Pass   |
| `npm run lint`                              | —      | —     | Pass   |
| `npx tsc -b`                                | —      | —     | Pass   |
| `npm test`                                  | 111    | 146   | Pass   |
| `cargo fmt --check`                         | —      | —     | Pass   |
| `cargo clippy --all-targets -- -D warnings` | —      | —     | Pass   |
| `cargo test --locked`                       | 82     | 107   | Pass   |

Twenty-five new Rust tests and thirty-five new frontend tests. Environment: Git
2.54.0.windows.1, Node 24.15.0, npm 11.12.1, Cargo 1.96.0, Windows.
[Source manifest](evidence/m8-github/source-manifest.txt) fingerprints the tested tracked and
untracked sources, excluding `docs/` and `README.md`; 102 entries, up from 95. Manifest SHA-256:
`086D9B855FA0706EBCA161F9715665CEC7FA543C80ED558B37CDEB4644036A15`.

Two dependencies were added and `Cargo.lock` is committed with them, because CI runs
`cargo test --locked`: `ureq` 2.12.1 with `native-certs`, and `keyring` 3.6.3 with `windows-native`
under `[target.'cfg(windows)'.dependencies]`. `ureq` was chosen over `reqwest` — which `tauri`
already carries transitively, but with no TLS stack enabled, so either choice adds one — because it
is purely synchronous and drops into the existing `spawn_blocking` plus `std::sync::Mutex` pattern
with no async-mutex question and no `reqwest::blocking`-inside-a-runtime hazard. It also honours
`HTTPS_PROXY`, which matches how the Git service defers to the user's environment.

### What the new tests actually assert

The Rust tests drive a mock GitHub API built from `std::net::TcpListener` in the module's own test
block, adding no test dependency — the same move as the bare-local-remote trick that proves fetch,
pull and push without a network. It hands out canned status lines, headers and bodies in order and
records what it received, so a test states exactly what GitHub is pretending to do and can then
assert what TBCE sent. The ones worth naming, because they encode decisions rather than restating
the code:

- A token is stored **only** after `GET /user` accepts it, and a rejected token leaves an existing
  working token untouched. Replacing a working credential with a typo would be its own failure.
- A malformed token is refused before anything is sent, asserted by the mock server recording zero
  requests. A token travels in a header, so a control character would corrupt the request rather
  than fail it cleanly.
- A revoked token is dropped and reported as signed out, so the panel offers to connect again
  instead of repeating a failure nobody can act on.
- A signed-out service reads nothing and asks nothing: the repository call fails with
  `GITHUB_SIGNED_OUT` and the mock server records no request at all.
- `hasMore` comes from the `Link` header, asserted by a **full** page with no `Link` header being
  reported as having nothing more. Inferring it from the page size would have looked correct until
  a repository had exactly thirty branches.
- A conditional request is proven by the second request carrying the `If-None-Match` the first
  answer set, and by a `304` with an empty body still producing the repository.
- An exhausted rate limit reports its reset time; a `403` that is _not_ a rate limit stays a
  refusal and keeps GitHub's own explanation, such as a SAML message.
- A crafted remote (`..`, a path separator, a query string, a space) and a crafted reference
  (`main&per_page=100`) are refused before anything is sent, asserted by zero recorded requests.
- A token never reaches a message, asserted against an answer that deliberately echoes it: the
  message contains `***` and not the token.
- The production constructor pins `https://api.github.com`, so the injectable base used by the
  tests cannot become a way to redirect a packaged build.
- Every GitHub remote form parses to the same owner and repository, including scp-style, a port and
  userinfo; a GitLab remote, a Windows path, a `file://` URL and a bare owner are all read as not a
  GitHub repository rather than guessed at.
- The credential vault itself round-trips a token under a disposable service name, so the Windows
  path is proven and not only the trait. Clearing an entry that is already gone is not a failure.

The frontend tests use the same mocked-adapter pattern as the Git store and panel. The notable ones:

- Opening a folder reads the Git remote and asks GitHub nothing, asserted by requiring zero calls
  to the account and repository commands.
- Switching tabs runs nothing at all, asserted by clearing the mocks and requiring zero calls. One
  refresh reads everything the panel shows, which is what makes that true.
- A read in flight disables paging but never disconnecting, which is the reason the store keeps two
  busy flags instead of one.
- Refused activity leaves the rest of the refresh intact, with the section explained rather than
  the whole panel failing.
- A token never reaches `localStorage` or the rendered document, asserted after a successful
  sign-in.
- Opening another folder keeps the account and forgets the repository.

### Production bundle

The development-only harness is still excluded, and a new check was added for this milestone: the
GitHub host appears nowhere in the bundle, because the webview names commands and never endpoints.
[Bundle inspection](evidence/m8-github/production-bundle-exclusion.txt). The panel ships in the main
entry chunk beside the other eagerly imported panels; the lazy chunks are unchanged. The content
security policy was not touched, which is why the panel shows a login name and no avatar.

### A deliberate negative check

The registration test was proven to fail. Removing `allow-github-commits` from
`capabilities/main.json` makes it report `github_commits is missing from the main window
capability`, and restoring the entry makes it pass. That test was also **generalized** in this
milestone, which is a correction rather than an improvement: see below.

### Packaging

`npm run tauri build -- --target x86_64-pc-windows-msvc` exited 0. Installer:
`src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/TBCE_0.1.0_x64-setup.exe`,
SHA-256 `8D30A640B3583CB16EA2BA5F4C27E8CB07EDA690293F14046BD8968A61991081`. It was **not** installed
or exercised in this session.

An earlier package of the same code, SHA-256
`EF10DDB58A4A3DDA38B7EC133F9DC2395C28658D665B9BE7E91827889E3155FF`, is superseded and must
not be quoted as this milestone's build; see correction 5. The frontend bundle is
byte-identical between the two, so the bundle inspection above holds for both.

### Corrections made during this work

1. The registration test scanned for `pub async fn git_` and would have read `github_account` as a
   Git command named `hub_account`, then asserted that a command called `git_hub_account` was
   registered — failing on a correctly registered command while checking a name that does not
   exist. It now scans every `pub async fn` in `commands/mod.rs` and checks all 54 commands against
   the invoke handler, the build-time list and the window capability. That required a trailing comma
   on the last `generate_handler!` entry, which the macro accepts.
2. The first version of the panel used one busy flag for everything, so loading commits disabled the
   Disconnect button. That contradicted the store's own stated design and would have trapped a user
   whose read was stalled or rate-limited, which is precisely when they would want to disconnect.
   Found by a test written from the design rather than from the code; the panel was fixed, not the
   test.
3. A first draft of the bundle evidence combined two `grep` patterns into one command, so the
   transcript showed a match while the narrative claimed the API host was absent. The claim was
   true but unproven by what was recorded, so the evidence was regenerated with one `grep` per
   claim. Evidence that does not support its own sentence is worse than no evidence.
4. Three store tests released a deferred promise before the operation had reached the deferred
   call, because a refresh reads the Git remote first. They now wait for the deferred call to be the
   one in flight. The tests were wrong, not the sequencing.

### Not verified

- Installed-app behaviour of anything in this milestone. No GitHub operation has been performed
  through the packaged application, and no panel has been rendered in WebView2.
- **Any real GitHub request.** Every automated test answers from a local socket. The live API's
  actual field values, its pagination behaviour on large repositories, its activity endpoint's real
  access requirements, secondary rate limits and abuse detection are all unexercised.
- Acceptance checks 67-74, and the still-open 15-42 and 57-66.
- Real TLS: the mock server speaks plain HTTP on loopback, so certificate verification, the
  `native-certs` trust store and a corporate proxy or TLS-inspecting middlebox are untested.
- A fine-grained token, a GitHub Enterprise host, an organization with SAML enforcement, and a
  repository large enough to page more than twice.
- Layout at 1280 × 820 and at the minimum 800 × 540 window size. No screenshot or rendering check
  was possible.
- Operating systems other than Windows. The credential vault reports
  `CREDENTIALS_UNSUPPORTED` elsewhere by design, and that path has not been compiled or run.
- Installer upgrade and uninstall, signing, and release ownership.

## Milestone 9 — GitHub issues, September 18, 2026

GitHub issues are implemented and covered by automated tests against a mock GitHub API. **This is
not desktop acceptance.** No installed-app scenario ran in this session, no real GitHub request was
made — so nothing was created, closed or reopened on any real repository — Milestone 6 gate items
P10, P11 and P12 remain open, and the new checks 75-82 are added to the
[manual run-sheet](acceptance-runsheet-m6.md) unexecuted.

### Scope decisions

The user chose four before implementation; the fifth was stated in the approved plan. All five are
recorded in the [delivery checklist](milestone-9.md).

1. **Body** as plain text, never rendered. No dependency added, content security policy unchanged.
2. **Create** with title, body, labels, assignees and a milestone — the broader of the two options
   offered.
3. **Close** through an in-panel prompt offering Completed, Not planned or Cancel.
4. **Filters** by state, label, assignee and milestone — again the broader option.
5. **Desktop acceptance** continues under the Milestone 4-8 waiver.

### Desktop acceptance waiver

Unchanged in substance from [Milestone 8](#desktop-acceptance-waiver-and-what-changed-about-it):
desktop automation works and check 1 has a recorded pass, so the outstanding work is unexecuted
checks — now 53 with this milestone's eight — rather than a missing tool. Checks 75-82 are the first
that change a real repository on GitHub, which is why the checklist requires a disposable one and
two purpose-made tokens.

### Automated verification

Every command below exited 0. Raw output:
[automated checks](evidence/m9-github-issues/automated-checks.log).

| Check                                       | Before | After | Result |
| ------------------------------------------- | ------ | ----- | ------ |
| `npm run format:check`                      | —      | —     | Pass   |
| `npm run lint`                              | —      | —     | Pass   |
| `npx tsc -b`                                | —      | —     | Pass   |
| `npm test`                                  | 168    | 201   | Pass   |
| `cargo fmt --check`                         | —      | —     | Pass   |
| `cargo clippy --all-targets -- -D warnings` | —      | —     | Pass   |
| `cargo test --locked`                       | 110    | 130   | Pass   |

Twenty new Rust tests and thirty-three new frontend tests. The "before" counts are 168 and 110,
not the 146 and 107 in the Milestone 8 table above, because the Milestone 8 review fixes added
twenty-two frontend and three Rust tests after that table was written; they are recorded in
[the review notes](evidence/m8-github/review-fixes.md). Environment: Git 2.54.0.windows.1, Node
24.15.0, npm 11.12.1, Cargo 1.96.0, Windows.
[Source manifest](evidence/m9-github-issues/source-manifest.txt) fingerprints the tested tracked and
untracked sources, excluding `docs/` and `README.md`; 105 entries, up from 102 with
`src-tauri/src/github/issues.rs`, `src-tauri/src/github/mock.rs` and `src/github/IssuesTab.tsx`.
Manifest SHA-256: `FAC66DE7E7A2A97205C0BE14387F85E705FD6460E779D45BF9485B06A1EEE9A1`.

No dependency was added, on either side.

### What the new tests actually assert

The mock GitHub API moved from the Milestone 8 test block into `github/mock.rs` so both test
modules share it, and it now records each request's method and JSON body as well as its path and
headers. That is what lets a test assert what TBCE **sent**, which matters more once requests
change things.

- A create sends exactly `{"title", "body", "labels", "assignees", "milestone"}` as JSON with
  `POST`: the title trimmed, duplicate labels removed case-insensitively, and an empty body or
  empty list omitted rather than sent.
- A pull request is never closed, reopened or read as an issue. The mock answers every `GET` with
  a pull request, and the test requires three refusals and three recorded requests, all `GET`. It
  was proven to bite: removing the guard in `change_state` makes it fail.
- A label named `bug&state=all #1 ü` is sent percent-encoded, and the path carries exactly one
  `state=`. An assignee or milestone carrying `&`, a zero milestone, a label with a newline and an
  over-long label are refused with zero requests recorded.
- An invalid draft — empty or blank title, a title one character over 256, a body one over 65,536,
  eleven assignees, a login with a space, a label with a tab, milestone zero — and issue number
  zero for read, close and reopen, all send nothing. A title of exactly 256 two-byte characters is
  accepted, so the limit counts characters rather than bytes.
- What GitHub silently drops is reported: a `201` whose answer lacks the requested label, assignee
  and milestone produces all three in `dropped`.
- A create whose answer never arrives is `GITHUB_WRITE_UNCONFIRMED` and was sent exactly once. A
  create against a port nothing listens on is an ordinary `GITHUB_NETWORK_FAILED`, because it
  cannot have arrived.
- `410` on a list is "issues turned off"; `410` on one issue keeps GitHub's own "deleted" message;
  `404` names the issue number; `422` keeps GitHub's validation message; a read-only token's `403`
  stays a refusal. A `401` during a create drops the token and the cache.
- A page of thirty issues whose bodies are 65,536 two-byte characters each — larger than 1 MiB —
  is read, and is not cached; a single issue over 1 MiB is still refused.
- The pickers read five pages of labels and stop, reporting `truncated`, then read assignees and
  open milestones; colours that are not six hexadecimal digits and empty descriptions arrive as
  nothing.

The frontend tests use the same mocked-adapter pattern. The notable ones:

- One refresh reads the first page of open issues, and switching to the Issues tab reads nothing.
  A repository reporting `has_issues: false` is not asked for issues at all.
- A refused or failing issue read leaves repository, branches and commits intact, and appears only
  in the Issues tab.
- A filter GitHub refuses leaves the previous filter and list in place instead of showing controls
  the list does not reflect.
- A second change started while one runs is refused, and the answer to a change for a replaced
  folder is discarded.
- A failed create keeps the typed draft; a write refused with `403` names Issues: Read and write;
  a create whose follow-up list read fails is still reported as created.
- The close prompt offers exactly Cancel, Not planned and Completed, and Cancel sends nothing.
- A body containing `<img src=x onerror="alert(1)"><b>…</b>` renders inside a `pre` as text: no
  `img` or `b` element exists in the document afterwards.

### Production bundle

The development-only harness is still excluded, the GitHub host still appears nowhere in the
bundle, and no source file uses `dangerouslySetInnerHTML`.
[Bundle inspection](evidence/m9-github-issues/production-bundle-exclusion.txt). The content
security policy was not touched.

### Deliberate negative checks

Two tests were proven to fail when the thing they protect is removed, then restored:

- Removing `allow-github-close-issue` from `capabilities/main.json` makes the registration test
  report `github_close_issue is missing from the main window capability`.
- Removing the pull-request check before `PATCH` in `change_state` makes
  `a_pull_request_is_never_closed_or_reopened_through_the_issue_endpoint` fail.

Both files were restored and their hashes match the source manifest.

### Packaging

`npm run tauri build -- --target x86_64-pc-windows-msvc` exited 0. Installer:
`src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/TBCE_0.1.0_x64-setup.exe`,
SHA-256 `F35C8210A283263F9021478BA3FCDC8C4A39723B5A4BE10876DA0659377D9EF3`. It was **not** installed or exercised in this session.

An earlier package, SHA-256 `F8D0A2A0B937ABBB43DC88F2AE3DF7CAA5C621A9F618591BE1E31A5A13CC289F`, was
built while a source comment was still being edited, and is superseded; see correction 2.

### Corrections made during this work

1. The approved plan mapped every `410` to "issues turned off". GitHub also answers `410` for a
   single deleted issue, so that mapping would have told a user that issues were disabled in a
   repository where they plainly work. `410` is now `GITHUB_GONE` with GitHub's own message, and
   only the list translates it to `GITHUB_ISSUES_DISABLED`.
2. The first installer was built while a comment in `src/stores/github.ts` was being corrected
   from "four requests" to "five". The comment does not reach the bundle, but a package must match
   its source manifest, so the installer was rebuilt from the final source and the first hash is
   recorded above only to say it is superseded.

### Not verified

- Installed-app behaviour of anything in this milestone, and no Issues tab rendered in WebView2.
- **Any real GitHub request, and in particular any real write.** GitHub's live behaviour when it
  silently drops labels, assignees or a milestone, its secondary rate limits on creating content,
  its exact `422` details and its `410` bodies are unexercised against the live service.
- Acceptance checks 75-82, and the still-open 15-42, 57-66 and 67-74.
- Real TLS, a fine-grained token's actual Issues permission boundaries, and a repository with more
  than five hundred labels, assignees or milestones.
- Layout at 1280 × 820 and at the minimum 800 × 540 window size.
- Operating systems other than Windows, installer upgrade and uninstall, signing, and release
  ownership.

## Milestone 10 — GitHub pull requests, September 18, 2026

The pull request viewer is implemented and covered by automated tests against a mock GitHub API.
**This is not desktop acceptance.** No installed-app scenario ran in this session and no real
GitHub request was made. Milestone 6 gate items P10, P11 and P12 remain open, and the new checks
83-90 are added to the [manual run-sheet](acceptance-runsheet-m6.md) unexecuted.

### Scope decisions

The user chose three before implementation; the fourth was stated in the approved plan. All four
are recorded in the [delivery checklist](milestone-10.md).

1. **Changed files** with their counts, and each file's patch opened read-only in the editor area.
   This was the broader of the two options offered, and it adds no request, because GitHub sends
   the patch with the file list.
2. **CI/check state** from Checks API runs and commit statuses together. This was the broader
   option again. It costs two requests, made only when a pull request is opened.
3. **Filters** by open or closed only, with merged told apart from closed.
4. **Desktop acceptance** continues under the Milestone 4-9 waiver.

### Desktop acceptance waiver

This is unchanged in substance from [Milestone 8](#desktop-acceptance-waiver-and-what-changed-about-it).
Desktop automation works and check 1 has a recorded pass, so what is outstanding is unexecuted
checks rather than a missing tool. With this milestone's eight there are now 61. Checks 83-90 only
read, so unlike 75-82 they cannot change a repository. They do need one prepared with a fork, a
draft, merged and closed pull requests, real CI reporting both check runs and a commit status, and a
change of more than thirty files.

### Automated verification

Every command below exited 0. The raw output is in
[automated checks](evidence/m10-github-pulls/automated-checks.log).

| Check                                       | Before | After | Result |
| ------------------------------------------- | ------ | ----- | ------ |
| `npm run format:check`                      | —      | —     | Pass   |
| `npm run lint`                              | —      | —     | Pass   |
| `npx tsc -b`                                | —      | —     | Pass   |
| `npm test`                                  | 201    | 229   | Pass   |
| `cargo fmt --check`                         | —      | —     | Pass   |
| `cargo clippy --all-targets -- -D warnings` | —      | —     | Pass   |
| `cargo test --locked`                       | 130    | 146   | Pass   |

- **New tests:** sixteen Rust and twenty-eight frontend.
- **Environment:** Git 2.54.0.windows.1, Node 24.15.0, npm 11.12.1, Cargo 1.96.0, Windows.
- **Source manifest:** the [source manifest](evidence/m10-github-pulls/source-manifest.txt)
  fingerprints the tested tracked and untracked sources, excluding `docs/` and `README.md`. It has
  110 entries, up from 105. The five new ones are:
  - `src-tauri/src/github/pulls.rs`
  - `src/components/PatchView.tsx`
  - `src/github/PullFileView.tsx`
  - `src/github/PullRequestsTab.tsx`
  - `tests/patch-view.test.tsx`
- **Manifest SHA-256:** `362148EFDCC814D44169FDD84B6039CB6BCAD9016D693D481E2BD7FB45173A3F`.

No dependency was added on either side. The lucide icons used for the pull request states already
ship in the installed `lucide-react` 0.468.0.

### What the new tests actually assert

The Rust tests use the mock GitHub API in `github/mock.rs`, which records each request's method,
path, headers and body.

- **Nothing writes.** A list, a pull request and a page of files send five requests between them,
  and every one is a `GET` with no body.
- **Checks target the right commit.** The check-run and status requests go to the head commit
  GitHub reported. `../../user`, a three-character value, forty `g`s, and a valid SHA followed by
  `?x=1` each produce one recorded request (the pull request itself) and a checks error, never a
  second request.
- **Summaries:**
  - success plus skipped plus a successful status is passing;
  - a run still in progress is pending;
  - a pending status is pending;
  - an errored status beside a queued run is failing;
  - a `timed_out` run is failing;
  - a commit whose only run was skipped is passing rather than none.
- **Refusals and failures:**
  - Refused check runs still leave the statuses read, and the reverse.
  - A `500` on check runs and an unreadable status answer are both reported inside `checks.error`,
    and the pull request is still returned.
  - A `401` on check runs drops the token and the cache, and stops before the statuses are read.
- **What the list reports:**
  - A merged pull request and one closed without merging are told apart.
  - A fork names its repository, and a deleted fork (`repo: null`) reads as cross-repository with
    no repository.
  - Requested teams follow requested users.
- **Files:**
  - A rename keeps its old path, a binary file has no patch, and paging follows `Link`.
  - A page of thirty 20,000-character patches, larger than 1 MiB, is read and is not cached.
- **Input limits:** `all`, `merged` and `open&x=1` do not deserialize as a state, and pull request
  number zero sends nothing.

The frontend tests use the same mocked-adapter pattern as earlier milestones. The notable ones:

- **Reads:**
  - One refresh reads the first page of open pull requests, and switching to the tab reads nothing.
  - An open pull request is read again on refresh.
- **Refusals stay local:**
  - A pull request read refused with `403`, or failing some other way, leaves repository, branches,
    commits and issues intact and appears only in the tab.
  - Files that cannot be read are reported beside a pull request that is still shown.
- **The closed state** is kept only once GitHub answers, and a failed switch leaves the open list in
  place.
- **Stale workspaces:** the answer for a pull request of a replaced folder is discarded, and its
  files are never requested.
- **Patches and the local diff:**
  - An open patch survives a refresh while its file is still listed and closes when it is not.
  - Opening a pull request file closes the local diff, and opening a local diff closes the patch.
  - In the application shell, a patch hides the editor without unmounting it.
- **Markup:** a description containing `<img src=x onerror="alert(1)"><b>…</b>` renders inside a
  `pre` as text, and no `img` or `b` element exists afterwards.
- **The patch view** with Monaco replaced by a recorder:
  - The patch reaches the model unchanged, read-only.
  - A file with no patch says so.
  - The local diff keeps its own heading, binary banner and close control on the shared view.

### Production bundle

The development-only harness is still excluded, and the GitHub host and any write method still
appear nowhere in the bundle. No source file uses `dangerouslySetInnerHTML` or `innerHTML`. The
shared patch view is now a lazy chunk of its own, loaded only when a local diff or a pull request
patch is opened. The content security policy was not touched. See the
[bundle inspection](evidence/m10-github-pulls/production-bundle-exclusion.txt).

### Deliberate negative checks

Three tests were proven to fail when the thing they protect is removed. Each file was then restored:

- Removing `allow-github-pull-files` from `capabilities/main.json` makes the registration test
  report `github_pull_files is missing from the main window capability`.
- Disabling the hexadecimal check on the head commit in `pulls.rs` makes
  `a_head_commit_that_is_not_hexadecimal_is_never_put_in_a_path` fail with `../../user reached a
request path`.
- Removing the call that closes the local diff from `openPullFile` makes
  `a pull request patch and a local diff never share the editor area` fail.

All three files were restored from copies. Their SHA-256 hashes were checked against the copies
taken beforehand, and they match the source manifest.

### Packaging

`npm run tauri build -- --target x86_64-pc-windows-msvc` exited 0. It produced the installer
`src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/TBCE_0.1.0_x64-setup.exe`, with
SHA-256 `142C6BC780C158D0BB192A4FA17EF964E7009488C7AC15BB51BB7F8900571380`. The build ran on the
final source, before the negative checks. The negative checks restored every file byte for byte,
so the installer matches the source manifest. It was **not** installed or exercised in this
session.

### Not verified

- **Installed-app behaviour** of anything in this milestone. No Pull requests tab or patch view has
  been rendered in WebView2.
- **Any real GitHub request.** None of the following has been exercised against the live service:
  - GitHub's mergeable computation;
  - real check-run and status payloads from GitHub Actions and external CI;
  - patch omission for large files;
  - fine-grained Pull requests, Checks and Commit statuses permission boundaries.
- **Acceptance checks** 83-90, and the still-open 15-42, 57-66, 67-74 and 75-82.
- **Scale:** a pull request with more than a hundred check runs, and a page of files over 8 MiB.
- **Layout** at 1280 × 820 and at the minimum 800 × 540 window size, including how the five tabs
  wrap.
- **Platform and release:** operating systems other than Windows, installer upgrade and uninstall,
  signing, and release ownership.

## Milestone 11 — Project dashboard, September 19, 2026

The project dashboard is implemented and covered by automated tests against a mock GitHub API and
mocked services. **This is not desktop acceptance.** No installed-app scenario ran in this session
and no real GitHub request was made. Milestone 6 gate items P10, P11 and P12 remain open, and the
new checks 91-98 are added to the [manual run-sheet](acceptance-runsheet-m6.md) unexecuted.

### Scope decisions

The user chose four before implementation; the other two were stated in the approved plan. All six
are recorded in the [delivery checklist](milestone-11.md).

1. **Placement** in the editor area, replacing the Welcome screen once a folder is open.
2. **Counts** exact, for one extra request, read from the `rel="last"` page of a one-per-page list.
3. **Build** for the local HEAD commit, with a commit GitHub does not have read as not pushed.
4. **Milestones** from GitHub, one new read; project progress a placeholder for Milestone 12.
5. **Commands** displayed, not run, until Milestone 13.
6. **Desktop acceptance** continues under the Milestone 4-10 waiver.

### Desktop acceptance waiver

This is unchanged in substance from [Milestone 8](#desktop-acceptance-waiver-and-what-changed-about-it).
Desktop automation works and check 1 has a recorded pass, so what is outstanding is unexecuted
checks rather than a missing tool. With this milestone's eight there are now 69. Checks 91-98 only
read. They reuse the repository prepared for 83-90, with an open milestone added.

### Automated verification

Every command below exited 0. The raw output is in
[automated checks](evidence/m11-dashboard/automated-checks.log).

| Check                                       | Before | After | Result |
| ------------------------------------------- | ------ | ----- | ------ |
| `npm run format:check`                      | —      | —     | Pass   |
| `npm run lint`                              | —      | —     | Pass   |
| `npx tsc -b`                                | —      | —     | Pass   |
| `npm test`                                  | 229    | 250   | Pass   |
| `cargo fmt --check`                         | —      | —     | Pass   |
| `cargo clippy --all-targets -- -D warnings` | —      | —     | Pass   |
| `cargo test --locked`                       | 146    | 158   | Pass   |

- **New tests:** twelve Rust and twenty-one frontend.
- **Changed tests:** four application-shell tests about panels reading nothing while another panel
  shows now open a file first. With a folder open and no file, the dashboard is on screen and reads
  Git and the GitHub account by design, so without the file those tests would no longer be asking
  what they were written to ask. The pull request fixtures gained the new `missing` field.
- **Environment:** Git 2.54.0.windows.1, Node 24.15.0, npm 11.12.1, Cargo 1.96.0, Windows.
- **Source manifest:** the [source manifest](evidence/m11-dashboard/source-manifest.txt)
  fingerprints the tested tracked and untracked sources, excluding `docs/` and `README.md`. It has
  116 entries, up from 110. The six new ones are:
  - `src-tauri/src/github/overview.rs`
  - `src/components/RecentProjects.tsx`
  - `src/dashboard/Dashboard.tsx`
  - `src/stores/dashboard.ts`
  - `tests/dashboard-view.test.tsx`
  - `tests/dashboard.test.ts`
- **Manifest SHA-256:** `B756A6B92325B14B0B616F770CC488080E9535A2079A38DCAE19138C8B0D94CC`.

No dependency was added on either side. The `LayoutDashboard` icon already ships in the installed
`lucide-react` 0.468.0.

### What the new tests actually assert

The Rust tests use the mock GitHub API in `github/mock.rs`.

- **Nothing writes.** Counts, milestones and head checks send five requests between them, and every
  one is a `GET` with no body.
- **Counts:**
  - A `Link` header naming page 7 as last gives seven open pull requests, and twenty combined gives
    thirteen issues.
  - With no `Link`, an empty page is zero and a page of one is one.
  - Two combined against five pull requests gives zero issues, not an underflow.
  - Issues turned off give no issue count.
  - On a second read the pull request count is revalidated with `If-None-Match`, answered `304`,
    and still six.
  - A last page of `9x` is ignored in favour of the page itself.
  - A `401` on the pull request count drops the token.
- **Milestones:** the query asks for open milestones soonest due first; counts, a Turkish title and
  a missing due date survive; `Link` sets `hasMore`.
- **Build:**
  - A known commit is read with check runs and then statuses, at the paths for that commit.
  - A `422` and a `404` on check runs each set `missing` after exactly one request.
  - No commit and `../../user` each send nothing.

The frontend tests use the mocked-adapter pattern of earlier milestones. The notable ones:

- **Reads:**
  - Signed out, the store asks GitHub nothing.
  - One refresh reads counts, milestones and head checks.
  - Refreshing everything also reads local Git and the GitHub store.
- **Failures stay local:** a `403` on counts and a failure on milestones each stay in their section,
  and head checks are still read after both. A `401` stops the rest and signs the GitHub store out.
- **Stale folders:** counts answered after the folder changed are discarded, and head checks are
  never requested.
- **Sign-out** clears what was read with the account.
- **The editor area:**
  - Showing the dashboard closes a diff.
  - Activating a tab, opening a diff or opening a pull request patch puts it in front.
  - In the shell, the dashboard replaces the Welcome screen once a folder opens.
  - It hides the editor without unmounting it, and a tab brings the editor back.
  - Focus refreshes it only while visible.
- **The dashboard:**
  - Every card shows the values its store holds.
  - A description containing `<img src=x onerror="alert(1)"><b>Tools</b>` renders as text, and no
    `img` or `b` element exists.
  - An unpushed commit reads as not on GitHub and raises no alert.
  - A folder that is not a repository reads nothing from Git status or GitHub counts.
  - The links call back with the right panel and tab.

### Production bundle

The development-only harness is still excluded, and the GitHub host and any write method still
appear nowhere in the bundle. No source file uses `dangerouslySetInnerHTML` or `innerHTML`. The
dashboard is a lazy chunk of its own. The content security policy was not touched. See the
[bundle inspection](evidence/m11-dashboard/production-bundle-exclusion.txt).

### Deliberate negative checks

Three tests were proven to fail when the thing they protect is removed. Each file was then restored:

- Removing `allow-github-head-checks` from `capabilities/main.json` makes the registration test
  report `github_head_checks is missing from the main window capability`.
- Removing the early return for a missing commit in `pulls.rs` makes
  `a_commit_github_does_not_have_is_missing_after_one_request` fail with `422 still read the
statuses`.
- Removing the line that hides the dashboard when a tab is activated makes `the dashboard is shown
in front of a diff or patch, and a file comes back in front of it` fail.

All three files were restored from copies. Their SHA-256 hashes were checked against the copies
taken beforehand, and they match the source manifest.

### Packaging

`npm run tauri build -- --target x86_64-pc-windows-msvc` exited 0. It produced the installer
`src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/TBCE_0.1.0_x64-setup.exe`, with
SHA-256 `34185EC6B7DC4819FE9C2B5C77233FDDD3255B03D9A732087EBC88BA6C6B4CBB`. The build ran on the
final source, after the negative checks had restored every file byte for byte, and the source
manifest was checked against the tree again afterwards. It was **not** installed or exercised in
this session.

### Not verified

- **Installed-app behaviour** of anything in this milestone. The dashboard has not been rendered in
  WebView2.
- **Any real GitHub request.** None of the following has been exercised against the live service:
  - the `rel="last"` link on a real pulls list;
  - how far GitHub's combined `open_issues_count` lags the pulls list;
  - real milestone counts;
  - GitHub's answer for a commit it does not have, which the tests take to be `422` or `404`.
- **Acceptance checks** 91-98, and the still-open 15-42, 57-66, 67-74, 75-82 and 83-90.
- **Layout** at 1280 × 820 and at the minimum 800 × 540 window size, including the single-column
  collapse.
- **Platform and release:** operating systems other than Windows, installer upgrade and uninstall,
  signing, and release ownership.

## Milestone 12 — Project progress, September 19, 2026

Project progress is implemented and covered by automated tests against a mock GitHub API, temporary
folders and mocked services. **This is not desktop acceptance.** No installed-app scenario ran in
this session and no real GitHub request was made. Milestone 6 gate items P10, P11 and P12 remain
open, and the new checks 99-106 are added to the [manual run-sheet](acceptance-runsheet-m6.md)
unexecuted.

### Scope decisions

The user chose four before implementation; the rest were stated in the approved plan. All are
recorded in the [delivery checklist](milestone-12.md).

1. **Storage** in `.tbce/progress.json`, a file of its own, with `project.json` left at schema 1.
2. **Mapping** by one GitHub label, one GitHub milestone, or both, each issue counted once.
3. **Counting** exact: mapped issues read in every state, pull requests left out, at most five pages
   of a hundred per label or milestone.
4. **Editing** on the dashboard card, with an Edit areas dialog for the structure.
5. **Plan-stated:** a project is required; two levels only; closed as not planned left out; no
   percentage for nothing to measure; tasks alone when issues cannot be read; commands still not
   run; desktop acceptance under the Milestone 4-11 waiver.

### Desktop acceptance waiver

This is unchanged in substance from [Milestone 8](#desktop-acceptance-waiver-and-what-changed-about-it).
Desktop automation works and check 1 has a recorded pass, so what is outstanding is unexecuted
checks rather than a missing tool. With this milestone's eight there are now 77. Checks 99-106 write
only to a disposable clone's `.tbce/progress.json` and read from GitHub. They reuse the repository
and clone prepared for 91-98, with a label, labelled issues and a milestone added by hand.

### Automated verification

Every command below exited 0. The raw output is in
[automated checks](evidence/m12-progress/automated-checks.log).

| Check                                       | Before | After | Result |
| ------------------------------------------- | ------ | ----- | ------ |
| `npm run format:check`                      | —      | —     | Pass   |
| `npm run lint`                              | —      | —     | Pass   |
| `npx tsc -b`                                | —      | —     | Pass   |
| `npm test`                                  | 250    | 278   | Pass   |
| `cargo fmt --check`                         | —      | —     | Pass   |
| `cargo clippy --all-targets -- -D warnings` | —      | —     | Pass   |
| `cargo test --locked`                       | 158    | 178   | Pass   |

- **New tests:** twenty Rust and twenty-eight frontend.
- **Changed tests:** in the dashboard view, the assertion that the placeholder names Milestone 12
  became assertions on the real card's figures, and the signed-out test also checks that mapped
  areas count their tasks alone and ask GitHub nothing. The dashboard tests mock the new progress
  adapter and area read, so the card reads nothing real.
- **Environment:** Git 2.54.0.windows.1, Node 24.15.0, npm 11.12.1, Cargo 1.96.0, Windows.
- **Source manifest:** the [source manifest](evidence/m12-progress/source-manifest.txt)
  fingerprints the tested tracked and untracked sources, excluding `docs/` and `README.md`. It has
  125 entries, up from 116. The nine new ones are:
  - `src-tauri/src/github/progress.rs`
  - `src-tauri/src/progress/mod.rs`
  - `src/dashboard/ProgressCard.tsx`
  - `src/dashboard/ProgressDialog.tsx`
  - `src/services/progress.ts`
  - `src/stores/progress.ts`
  - `src/types/progress.ts`
  - `tests/progress-view.test.tsx`
  - `tests/progress.test.ts`
- **Manifest SHA-256:** `A2B1CAB28D2980419A7DBDC877B84F2455F47578403F28A792B77D34294C1A06`.

No dependency was added on either side. `tempfile` and `sha2` were already dependencies, and the
icons come from the installed `lucide-react`.

### What the new tests actually assert

The Rust progress tests write into temporary folders.

- **Round trip:** a plan is written and read back equal, with the same revision, `schemaVersion` 1,
  the label and a ticked task on disk as JSON. The manifest's bytes are identical before and after.
- **Refusals:** a folder with no manifest is refused and gets no `.tbce` folder. A second writer that
  never read the file is refused, a writer holding an older revision is refused after a newer save,
  and the file keeps the newer plan.
- **Unusable files:** invalid JSON, schema version 2 and two areas named `A` and `a` each read as
  invalid, a write over each is refused, and each file keeps its exact contents.
- **Limits:** fourteen plans, one per limit, are each refused with `INVALID_PROGRESS`, and no file is
  written. Names, titles and labels are trimmed, a blank label dropped, and Turkish text survives.
- **Disk:** no temporary file is left beside the plan, and a `.tbce` junction to another folder is
  refused for reads and writes, with nothing written there.

The area issue tests use the mock GitHub API in `github/mock.rs`.

- **Paths:** a label is read with `state=all`, percent-encoded (`area%3Aauth`), a hundred a page,
  and paging follows the `Link` header. A label and a milestone are read separately, neither query
  naming the other, and the issue found by both is kept once. `x&state=open#` stays inside its
  parameter.
- **Content:** pull requests are dropped on every page; `not_planned` is marked only for a closed
  issue; issues come back newest first.
- **Limits:** six advertised pages stop after five requests with `truncated` set. No mapping, or a
  blank label, sends nothing; a comma, a tab, fifty-one characters and milestone 0 are refused before
  any request.
- **Failures:** `410` reads as issues turned off, and `401` drops the token.
- **Nothing writes:** three requests, each a `GET` with no body.

The frontend tests use the mocked-adapter pattern of earlier milestones. The notable ones:

- **Figures:** tasks and closed issues over tasks and issues; closed as not planned in neither; no
  percentage for nothing to measure; tasks alone, flagged, when a mapped area's issues are missing;
  an issue shared by two areas counted once in the project.
- **The dialog's checks** match the backend's: blank and duplicate names regardless of case, a comma
  or a fifty-one-character label, milestone 0, a blank task and a control character.
- **The progress store:** a first save names no revision and the next names the one returned;
  ticking a task changes only that task; `CONFLICT` reloads the plan on disk and keeps it with an
  explanation; an unusable file is never sent; an answer for a replaced folder is discarded.
- **The dashboard store:** two areas sharing a label cause one read and an unmapped area none;
  signed out nothing is read; a `403` stays with its area while the next is still read; a `401`
  stops the rest and signs out; a stale answer is discarded; Refresh reads the plan and then its
  areas.
- **The card and dialog:**
  - A plain folder is offered conversion and nothing is read.
  - An unusable file is explained and Edit areas is not offered.
  - Names and titles containing `<b>` and `<img … onerror>` render as text, with no such elements.
  - Ticking a task saves at once with the revision read, and the bar follows.
  - Adding, renaming, reordering, removing and labelling in the dialog produce one save of exactly
    that plan, trimmed.
  - Duplicate names and a comma are explained and Save stays disabled with nothing sent.
  - Signed out, a mapped area reads "1 of 2 tasks · issues not counted: connect a GitHub account".
- **The whole dashboard:** with a label and a milestone mapped and one issue closed as not planned,
  Authentication reads 50%, the project 40%, "2 of 5 done", and GitHub is asked once.

### Production bundle

The development-only harness is still excluded, and the GitHub host and any write method still
appear nowhere in the bundle. No source file uses `dangerouslySetInnerHTML` or `innerHTML`. The card
and dialog ship in the dashboard's lazy chunk. The content security policy was not touched. See the
[bundle inspection](evidence/m12-progress/production-bundle-exclusion.txt).

### Deliberate negative checks

Three tests were proven to fail when the thing they protect is removed. Each file was then restored:

- Removing `allow-write-progress` from `capabilities/main.json` makes the registration test report
  `write_progress is missing from the main window capability`.
- Weakening the revision check in `progress/mod.rs` so that it refuses only a writer that never read
  the file makes `a_write_against_a_changed_file_is_refused` fail: a stale revision was accepted.
- Counting issues closed as not planned in `types/progress.ts` makes `an issue closed as not planned
is left out rather than counted as done` fail, and with it the whole-dashboard test, whose figures
  change.

All three files were restored from copies. Their SHA-256 hashes were checked against the copies
taken beforehand, and the whole tree was checked against the source manifest afterwards.

### Packaging

`npm run tauri build` exited 0; the standard release target was free this time, so no `--target`
was needed. It produced the installer `src-tauri/target/release/bundle/nsis/TBCE_0.1.0_x64-setup.exe`,
with SHA-256 `AC74CD6FFE956F0744C33C420459D9E42C9289F4AFA8CD8A67578CC0370CF8AD`, and the executable
`src-tauri/target/release/tbce.exe`, with SHA-256
`8A95E3D24F7640A7C3329AE4AF49BE89D634892FF26DAAC581A9002E9073EF5A`. The build ran on the source the
manifest records, before the negative checks, which then restored every file byte for byte. The
[package log](evidence/m12-progress/windows-package.log) holds the output. It was **not** installed
or exercised in this session.

### Not verified

- **Installed-app behaviour** of anything in this milestone. The card and dialog have not been
  rendered in WebView2, and no `progress.json` has been written by the packaged application.
- **Any real GitHub request.** None of the following has been exercised against the live service:
  `state=all` with a label or a milestone; `state_reason` on real closed issues; paging a label with
  more than a hundred issues; a page of a hundred issues with long bodies against the page cap.
- **Acceptance checks** 99-106, and the still-open 15-42, 57-66, 67-74, 75-82, 83-90 and 91-98.
- **Layout** at 1280 × 820 and at the minimum 800 × 540 window size, including the dialog's
  scrolling and single-column fields.
- **Concurrent writers** beyond the revision check. Two TBCE windows on one project, or a Git
  checkout that replaces `progress.json` between the check and the move, are not tested; the move is
  not atomic with the check.
- **Platform and release:** operating systems other than Windows, installer upgrade and uninstall,
  signing, and release ownership.

## Build notes

Vite reports a large lazy Monaco chunk, expected for the bundled editor and language support. Tauri warns that the requested `com.tbce.app` identifier ends in `.app`; it is retained as specified, with macOS packaging deferred. Initial sandbox path-access errors were resolved by running build tools with the required filesystem access.
