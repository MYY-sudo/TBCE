# Remaining work

## Within the terminal

- Support multiple terminal tabs, terminal names, and command history. The roadmap defers these; the backend already tracks sessions by identifier, so the panel is the part that needs work.
- Make the shell configurable. The default shell comes from the operating system until the settings milestone adds a choice.
- Extend the UTF-8 session bootstrap beyond `cmd.exe` and PowerShell. An unrecognized shell keeps the code page it starts with, so its output can still be mojibake on a non-UTF-8 machine.
- Test macOS and Linux. Only Windows and ConPTY have been exercised.
- Evaluate throttling very fast output. Reads are already batched into 8 KiB chunks, and no interactive throttling is applied on top of that.
- Consider restoring terminal scrollback across panel closes. Closing a terminal ends its session and its buffer.

## Within the editor

- Test macOS and Linux, including platform-specific filesystem semantics and shortcuts.
- Add workspace file watching, search/quick-open, and large-directory virtualization.
- Add session restoration and crash recovery only when explicitly scheduled. Unsaved buffers currently live in memory.
- Add deliberate support for mixed line endings, non-UTF-8 encodings, larger files, case-only rename, symlinks, and junctions.
- Decide how Unicode normalization should be handled. A name can be composed (`U+00FC`) or decomposed (`u` + `U+0308`); rename and collision checks compare raw strings, so the two forms read as different names. Windows supplies composed names in practice, so this is latent rather than active.
- Decide whether the explorer should collate names per locale. Sorting lowercases with Rust's locale-independent mapping, which folds `I` to `i` rather than to the `ı` a Turkish reader expects.
- Evaluate handle-relative filesystem operations and adversarial race testing before untrusted automation.
- Add cross-file language-server integration. Monaco provides built-in language support, not the full VS Code extension ecosystem.
- Establish signed releases, release ownership, licensing, and installer upgrade/uninstall verification before public distribution.

## Within the project system

- Stack and architecture settings use personal catalogs and preserve legacy values. Built-in architecture presets are deferred by the confirmed Milestone 5 scope.
- The project surface no longer claims anything about Git. `GitService` reports repository state, and `detect_project` still runs no Git so opening a folder never waits on it.
- Run the stored project commands through `ProcessService` in Milestone 13. They are stored and edited but never executed.
- Keep recent projects in webview local storage until a real persistence requirement justifies a database. Clearing site data clears the list.
- Reconsider concurrent edits to `project.json`. It is written directly, without the revision checks that source files use.

## Within saved stacks

- Complete installed-app acceptance checks 28–35, including file selection, native confirmations, persistence across restart, and project creation.
- Consider import/export and a snapshot-history/cleanup interface. Replaced snapshot generations currently remain as recovery data until the stack is deleted.
- Consider progress reporting and cancellation during large captures. Current operations show a busy state and block workspace changes until they finish.
- Test macOS/Linux and filesystem permission preservation. Windows is the current target; snapshots preserve file bytes and directory structure, not platform-specific ACLs or executable modes.
- No framework generators, built-in stacks, automatic dependency installation, or source synchronization are included.

## Within personal architectures

- Complete installed-app acceptance checks 36–42: catalog persistence, structure editing, previews, native pickers/confirmations, creation, and minimum-window-size layout.
- Consider built-in presets, capture from an existing project, applying structures to existing projects, and import/export when scheduled.
- Add variable substitution, binary starter assets, and architecture-rule enforcement only when explicitly scheduled. Milestone 5 generates literal UTF-8 text and treats boundaries as guidance.
- Test other operating systems and adversarial filesystem races; the existing containment limitation still applies.

## Within the interface

- Translate the interface. Every string is English and inlined in the components (`App.tsx`, `Explorer.tsx`, `ProjectSettingsDialog.tsx`, `Dialog.tsx`, `TerminalPanel.tsx`), and Rust surfaces user-visible sentences of its own. This belongs with Milestone 14, which already owns user-facing preferences, and should not displace the milestone order. `ServiceError` already carries a stable machine-readable `code` on every failure, so the frontend can map codes to localized text instead of the Rust messages being translated.

## Within the Git backend

- Merge and rebase workflows, force push, hard reset, stash, tags, submodules, and Git LFS are all deferred. Pull is fast-forward only, so a divergence is reported rather than resolved.
- Build the visual source-control panel in Milestone 7. The backend is complete but only a branch label and a development-only harness consume it.
- Test authenticated remotes. Fetch, pull and push are proven against a local bare repository, so credential-helper and SSH-agent paths are unexercised. A passphrase-protected key with no agent has nothing to prompt and will run to the 300-second network deadline before being reported as a timeout.
- Consider progress reporting and cancellation for clone, fetch and push. They currently block until they finish or the deadline passes.
- Consider choosing among several remotes. Operations use the branch upstream, the single configured remote, or `origin`.
- Test other operating systems. Only Windows has been exercised.
- Decide how conflicted files should be resolved inside TBCE. They are reported, and committing is refused until they are resolved elsewhere.

## Product roadmap

The [Milestone 6 delivery checklist](milestone-6.md) records the delivered backend
against its evidence. G01-G11 and V01-V05 are complete; the prerequisite gate items
P10-P12 are not. Desktop discovery still fails with a missing native pipe, so under
the September 16, 2026 scope decision the backend was implemented while a
[manual run-sheet](acceptance-runsheet-m6.md) was prepared for installed-app checks
15-42. Automated tests prove the backend and prove nothing about the packaged
application. Complete the run-sheet before treating any of this as desktop-verified.

See the [full product vision and V1/V2 roadmap](roadmap.md) for every milestone, completion criteria, and security requirement.

Milestone 5's personal architectures and Milestone 6's Git backend are implemented with automated coverage; desktop acceptance remains pending alongside earlier milestones. Next: the Git UI, GitHub context, issues, pull requests, dashboard, progress, project commands, settings, and stabilization in the supplied milestone order. Milestone 13 should run project commands through the existing `ProcessService` rather than adding a second way to execute programs.

Desktop acceptance checks 15-27 for the corrected terminal and project system remain outstanding alongside Milestone 4 checks 28-35 and the new Git checks 43-56. Implementation proceeded on the user's request after retrying Computer Use and finding the native pipe unavailable again. These milestones must not be treated as desktop-verified until those checks run. See `verification.md` for exact results and limitations.

The current implementation does not claim V1 completion. Advanced automation remains outside the foundation/editor scope.
