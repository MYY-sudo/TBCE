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

- Translate the interface. Every string is English and inlined in the components (`App.tsx`, `Explorer.tsx`, `ProjectSettingsDialog.tsx`, `Dialog.tsx`, `TerminalPanel.tsx`, `Dashboard.tsx`), and Rust surfaces user-visible sentences of its own. This belongs with Milestone 14, which already owns user-facing preferences, and should not displace the milestone order. `ServiceError` already carries a stable machine-readable `code` on every failure, so the frontend can map codes to localized text instead of the Rust messages being translated.

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
- Consider showing the separate open issue and pull request counts on the panel's Overview too. The Milestone 11 dashboard counts them apart for one extra request, but the panel's Overview still shows the single count GitHub reports, which counts pull requests as issues.
- Decide whether a Code tab is worth having. The roadmap suggests one, and it was left out because it would duplicate the explorer for a working copy already on disk.
- Support GitHub Enterprise hosts. Only github.com is recognized; another host is reported as a state rather than attempted.
- Consider showing avatars. The content security policy allows no remote image, so this needs either a widened `img-src` or Rust fetching the bytes and handing over a data URL.
- Consider OAuth device flow beside the token. A token is what this release asks for; device flow would need a registered GitHub application and a client identifier in the source.
- Support macOS and Linux credential storage. The vault reports `CREDENTIALS_UNSUPPORTED` off Windows rather than writing a secret somewhere unprotected, and that path has not been run.
- Reconsider the conditional-request cache if it ever needs to survive a restart. It is in memory, cleared wholesale, and exists to spare the rate limit rather than to be a store.
- Translate the panel with the rest of the interface in Milestone 14. Its strings are English and inlined, like every other component.

## Within GitHub issues

- Complete installed-app acceptance checks 75-82: lists and paging against github.com, the three filters, plain-text bodies, creating with labels, assignees and a milestone, closing with each reason, reopening, read-only and missing-access refusals, disabled issues, network loss during a create, and layout at the minimum window size. They change a real repository, so they need a disposable one.
- Exercise the real API. As in Milestone 8, every automated test answers from a mock server, so GitHub's actual behaviour when it silently drops labels, assignees or a milestone, its secondary rate limits on creating content, and its `422` details are unexercised against the live service.
- Add comments, which the roadmap defers. The issue view shows the comment count only.
- Consider editing an issue's title, body, labels, assignees and milestone after creation, locking, pinning, transferring and deleting. None of these exist; only create, close and reopen write anything.
- Decide whether bodies should be rendered as Markdown. They are plain text by choice, which needs no parser or sanitizer; rendering would need both, and images would still be blocked by the content security policy.
- Consider sorting, searching and more filters: author, mentions, several labels at once, and closed milestones. The list uses GitHub's default order, newest first; the label filter takes one label, and a label whose name contains a comma would be read by GitHub as two.
- Consider more than 500 labels, assignees or milestones. The pickers read at most five pages of a hundred each and say so when a list stops there.
- Reconsider a write that is not confirmed. A create that times out after it may have reached GitHub is reported as unconfirmed and never retried, so the user checks with Refresh; an idempotency key would need GitHub support that does not exist.
- A change whose answer arrives after the workspace was switched is still made on GitHub; only its display is discarded. The target repository is resolved when the command starts, so the change always lands where it was aimed.
- Translate the tab with the rest of the interface in Milestone 14.

## Within GitHub pull requests

- Complete installed-app acceptance checks 83-90: lists and paging against github.com, merged and closed states, plain-text descriptions, reviewers and counts, checks from both the Checks API and commit statuses, changed files and their patches, the patch and local diff sharing the editor area, refusals for pull requests, checks and statuses, network loss, and layout at the minimum window size. They only read, but need a repository prepared with forks, drafts, merged and closed pull requests, CI and a large change.
- Exercise the real API. As in Milestones 8 and 9, every automated test answers from a mock server, so GitHub's actual mergeable computation, check-run and status payloads from real CI, fine-grained Checks and Commit statuses permission boundaries, and patch omission on large files are unexercised against the live service.
- Create, review and merge pull requests, which the roadmap lists as later. Nothing in this release writes to a pull request.
- Add comments and review threads. The view shows the combined comment count only.
- Consider checking out a pull request's branch locally, and highlighting the pull request whose source is the current local branch. Both would join the Git and GitHub stores, which this milestone kept apart except for the shared patch view.
- Consider a side-by-side view of a file. The patch is shown as GitHub sent it; two full file versions would need two more reads per file.
- Consider pages of changed files larger than 8 MiB. A page of thirty files with very large patches is refused as more data than TBCE will read rather than shown in part.
- Consider more than a hundred check runs or commit statuses. The summary covers the ones read and says when GitHub reported more.
- Consider filters beyond open and closed. GitHub's list endpoint can filter by source or target branch and sort differently; author and label filters would need the search API.
- Translate the tab with the rest of the interface in Milestone 14.

## Within the dashboard

- Complete installed-app acceptance checks 91-98: placement over the editor and the Welcome screen, project and commands, Git and branch state, counts against github.com, build for a pushed, unpushed and uncomputed commit, milestones, navigation, focus refresh, and layout at the minimum window size.
- Exercise the real API. Every automated test answers from a mock server, so the `rel="last"` link on a real pulls list, how far GitHub's combined `open_issues_count` lags the pull request list, real milestone counts, and GitHub's actual answer for a commit it does not have are unexercised. The tests take that answer to be `422` or `404`.
- Make commands clickable in Milestone 13, through `ProcessService`. The card lists them and runs nothing.
- Consider more than thirty open milestones and closed milestones. The card shows the first page, soonest due first, and says when there are more.
- Consider opening a milestone, a commit or an activity entry from its row. Rows are read-only; only the Issues, Pull requests and Git state cards link to a panel.
- Reconsider the account read on showing the dashboard. With a folder open and no file, the dashboard is on screen and reads the GitHub account once, as the GitHub panel does when opened; before this milestone nothing read GitHub until that panel was opened.
- Translate the dashboard with the rest of the interface in Milestone 14.

## Within project progress

- Complete installed-app acceptance checks 99-106: conversion from the card, areas and tasks confirmed on disk with the manifest untouched, ticking and restart, a file changed or broken outside TBCE, label and milestone issues against github.com, shared mappings, signed out and no remote, the dialog's refusals, and layout at the minimum window size.
- Exercise the real API. As in Milestones 8 to 11, every automated test answers from a mock server, so `state=all` with a label or milestone, real `state_reason` values, paging a label past a hundred issues, and a page of a hundred issues with long bodies against the page cap are unexercised.
- Consider more than five hundred issues and pull requests per label or milestone. An area that reaches the limit says so and counts what was read.
- Consider nested areas, weights, due dates and assignees for tasks. The plan has two levels, every task and issue weighs the same, and a task has only a title and whether it is done.
- Consider linking individual issues by number, several labels per area, and closed milestones in the dialog's list. An area takes one label and one milestone; a closed milestone can still be entered as a number when signed out, and is shown by number when it is not among the open ones.
- Consider progress over time. Nothing records history; the figures are computed from the plan and GitHub each time the dashboard reads.
- Reconsider concurrent writers. The revision check refuses a stale write, but the check and the move are not one atomic step, so a second window or a Git checkout replacing the file in between is not caught.
- Consider turning a task into a GitHub issue, or the reverse. Tasks live only in `progress.json` and are never sent to GitHub.
- Translate the card and dialog with the rest of the interface in Milestone 14.

## Product roadmap

The [Milestone 6 delivery checklist](milestone-6.md) records the delivered backend
against its evidence. G01-G11 and V01-V06 are complete; the prerequisite gate items
P10-P12 are not. The [Milestone 7 checklist](milestone-7.md) records the panel over
it, the [Milestone 8 checklist](milestone-8.md) the GitHub context beside it, and the
[Milestone 9 checklist](milestone-9.md) the issues added to that context, and the
[Milestone 10 checklist](milestone-10.md) the pull request viewer beside them, and the
[Milestone 11 checklist](milestone-11.md) the project dashboard over all of them, and the
[Milestone 12 checklist](milestone-12.md) the project progress on that dashboard. The
[manual run-sheet](acceptance-runsheet-m6.md) now covers installed-app checks 15-42,
57-66, 67-74, 75-82, 83-90, 91-98 and 99-106. Desktop automation itself works again — the September 17 resumed
run installed the application and passed check 1 — so what is outstanding is the 45
unexecuted checks plus the eight each that Milestones 9, 10, 11 and 12 added, 77 in all, rather than a broken tool. Automated tests prove the code and prove
nothing about the packaged application. Complete the run-sheet before treating any of
this as desktop-verified.

See the [full product vision and V1/V2 roadmap](roadmap.md) for every milestone, completion criteria, and security requirement.

Milestone 5's personal architectures, Milestone 6's Git backend, Milestone 7's source-control panel, Milestone 8's GitHub context, Milestone 9's GitHub issues, Milestone 10's pull request viewer, Milestone 11's project dashboard and Milestone 12's project progress are implemented with automated coverage; desktop acceptance remains pending alongside earlier milestones. Next: project commands, settings, and stabilization in the supplied milestone order. Milestone 13 should run project commands through the existing `ProcessService` rather than adding a second way to execute programs.

Desktop acceptance checks 15-27 for the corrected terminal and project system remain outstanding alongside Milestone 4 checks 28-35, the Git UI checks 57-66, the GitHub checks 67-74, the GitHub issues checks 75-82, the GitHub pull request checks 83-90, the dashboard checks 91-98 and the project progress checks 99-106. Checks 43-56 targeted the backend through the development harness; the panel now covers the same ground through the real interface, so 57-66 replace them. Implementation proceeded on the user's request after retrying Computer Use and finding the native pipe unavailable again. These milestones must not be treated as desktop-verified until those checks run. See `verification.md` for exact results and limitations.

The current implementation does not claim V1 completion. Advanced automation remains outside the foundation/editor scope.
