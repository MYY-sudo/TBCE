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

- Populate stack and architecture from the catalogs that Milestones 4 and 5 introduce. Both are free-form strings today.
- Report the branch and repository state once `GitService` exists. A project only reports whether a `.git` entry is present.
- Run the stored project commands through `ProcessService` in Milestone 13. They are stored and edited but never executed.
- Keep recent projects in webview local storage until a real persistence requirement justifies a database. Clearing site data clears the list.
- Reconsider concurrent edits to `project.json`. It is written directly, without the revision checks that source files use.

## Within the interface

- Translate the interface. Every string is English and inlined in the components (`App.tsx`, `Explorer.tsx`, `ProjectSettingsDialog.tsx`, `Dialog.tsx`, `TerminalPanel.tsx`), and Rust surfaces user-visible sentences of its own. This belongs with Milestone 14, which already owns user-facing preferences, and should not displace the milestone order. `ServiceError` already carries a stable machine-readable `code` on every failure, so the frontend can map codes to localized text instead of the Rust messages being translated.

## Product roadmap

See the [full product vision and V1/V2 roadmap](roadmap.md) for every milestone, completion criteria, and security requirement.

Next: Milestone 4, saved stacks, followed by architectures, local Git and Git UI, GitHub context, issues, pull requests, dashboard, progress, project commands, settings, and stabilization in the supplied milestone order. Milestone 13 should run project commands through the existing `ProcessService` rather than adding a second way to execute programs.

Before starting Milestone 4, finish desktop acceptance checks 15–27 for the corrected terminal and project system. The September 13 review fixed the identified defects and passed automated checks, but desktop verification could not run because the Computer Use connection was unavailable. See `verification.md` for the exact results and limitation.

The current implementation does not claim V1 completion. Advanced automation remains outside the foundation/editor scope.
