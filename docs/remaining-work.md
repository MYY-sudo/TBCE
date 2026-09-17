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
- The visual source-control panel exists as of Milestone 7 and reaches all eighteen commands. The development harness remains as a development tool, no longer as the only way to run a Git command.
- Test authenticated remotes. Fetch, pull and push are proven against a local bare repository, so credential-helper and SSH-agent paths are unexercised. A passphrase-protected key with no agent has nothing to prompt and will run to the 300-second network deadline before being reported as a timeout.
- Consider progress reporting and cancellation for clone, fetch and push. They currently block until they finish or the deadline passes.
- Consider choosing among several remotes. Operations use the branch upstream, the single configured remote, or `origin`.
- Test other operating systems. Only Windows has been exercised.
- Decide how conflicted files should be resolved inside TBCE. They are reported, and committing is refused until they are resolved elsewhere.

## Within the source control panel

- Complete installed-app acceptance checks 57-66: initialization and cloning through the panel, staging and committing confirmed on disk, branch operations with their native confirmation, remote operations against a real remote, the diff preview, and layout at the minimum window size.
- Add partial and hunk-level staging. Staging works per file and for everything; a file cannot be committed in pieces.
- Add commit amending, and decide how a conflicted file should be resolved inside TBCE. Both are refused by the backend today, so both need backend work first.
- Show remote branches in this panel. `git_branches` returns them and the store keeps them, and the GitHub panel now lists the branches GitHub reports, so what is missing is the local view of remote-tracking refs rather than any remote information at all.
- Reconsider refreshing on window focus once a file watcher exists. Nothing polls, so a change made outside TBCE appears on the next focus or on Refresh, not immediately.
- Consider progress and cancellation in the panel for clone, fetch and push. They show a busy state and block other Git operations until the backend deadline passes.
- Translate the panel with the rest of the interface in Milestone 14. Its strings are English and inlined, like every other component.

## Within GitHub

- Complete installed-app acceptance checks 67-74: connecting and disconnecting an account, credential storage confirmed in Windows Credential Manager, the three remote states, Overview values checked against github.com, branch and commit paging, a revoked token, refusals, and layout at the minimum window size.
- Exercise the real API. Every automated test answers from a mock server on loopback, so live field values, pagination on a large repository, the activity endpoint's real access requirements, secondary rate limits and abuse detection are all unexercised. Real TLS, the bundled `native-certs` trust store and a TLS-inspecting proxy are untested for the same reason.
- Add issue and pull request lists in Milestones 9 and 10. The Overview shows the single count GitHub reports, which counts pull requests as issues; separate counts need those milestones.
- Decide whether a Code tab is worth having. The roadmap suggests one, and it was left out because it would duplicate the explorer for a working copy already on disk.
- Support GitHub Enterprise hosts. Only github.com is recognized; another host is reported as a state rather than attempted.
- Consider showing avatars. The content security policy allows no remote image, so this needs either a widened `img-src` or Rust fetching the bytes and handing over a data URL.
- Consider OAuth device flow beside the token. A token is what this release asks for; device flow would need a registered GitHub application and a client identifier in the source.
- Support macOS and Linux credential storage. The vault reports `CREDENTIALS_UNSUPPORTED` off Windows rather than writing a secret somewhere unprotected, and that path has not been run.
- Reconsider the conditional-request cache if it ever needs to survive a restart. It is in memory, cleared wholesale, and exists to spare the rate limit rather than to be a store.
- Translate the panel with the rest of the interface in Milestone 14. Its strings are English and inlined, like every other component.

## Product roadmap

The [Milestone 6 delivery checklist](milestone-6.md) records the delivered backend
against its evidence. G01-G11 and V01-V06 are complete; the prerequisite gate items
P10-P12 are not. The [Milestone 7 checklist](milestone-7.md) records the panel over
it, and the [Milestone 8 checklist](milestone-8.md) the GitHub context beside it. The
[manual run-sheet](acceptance-runsheet-m6.md) now covers installed-app checks 15-42,
57-66 and 67-74. Desktop automation itself works again — the September 17 resumed run
installed the application and passed check 1 — so what is outstanding is the 45
unexecuted checks rather than a broken tool. Automated tests prove the code and prove
nothing about the packaged application. Complete the run-sheet before treating any of
this as desktop-verified.

See the [full product vision and V1/V2 roadmap](roadmap.md) for every milestone, completion criteria, and security requirement.

Milestone 5's personal architectures, Milestone 6's Git backend, Milestone 7's source-control panel and Milestone 8's GitHub context are implemented with automated coverage; desktop acceptance remains pending alongside earlier milestones. Next: issues, pull requests, dashboard, progress, project commands, settings, and stabilization in the supplied milestone order. Milestone 13 should run project commands through the existing `ProcessService` rather than adding a second way to execute programs.

Desktop acceptance checks 15-27 for the corrected terminal and project system remain outstanding alongside Milestone 4 checks 28-35, the Git UI checks 57-66 and the GitHub checks 67-74. Checks 43-56 targeted the backend through the development harness; the panel now covers the same ground through the real interface, so 57-66 replace them. Implementation proceeded on the user's request after retrying Computer Use and finding the native pipe unavailable again. These milestones must not be treated as desktop-verified until those checks run. See `verification.md` for exact results and limitations.

The current implementation does not claim V1 completion. Advanced automation remains outside the foundation/editor scope.
