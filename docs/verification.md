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

## Build notes

Vite reports a large lazy Monaco chunk, expected for the bundled editor and language support. Tauri warns that the requested `com.tbce.app` identifier ends in `.app`; it is retained as specified, with macOS packaging deferred. Initial sandbox path-access errors were resolved by running build tools with the required filesystem access.
