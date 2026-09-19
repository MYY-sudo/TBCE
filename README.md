# TBCE

**Everything your project needs, in one place.**

TBCE means Tools, Branches, Code, Everything. This Windows-first desktop application implements Milestones 0 to 12: a Tauri/Rust foundation, a React/TypeScript workspace powered by Monaco, an integrated terminal, the project system, personal saved stacks, personal architectures, the local Git backend, the source-control panel over it, GitHub repository context, GitHub issues, a read-only pull request viewer, a project dashboard, and project progress. Desktop acceptance for the terminal, project system, stacks, architectures, Git, GitHub, the dashboard and progress remains pending; see the verification record.

## Available now

- Open a local folder with a native picker; browse a lazy directory tree, including hidden files.
- Create files and folders, rename items, refresh the tree, and move items to the Recycle Bin with confirmation.
- Edit UTF-8 files in multiple tabs with syntax highlighting, undo history, cursor/view preservation, and dirty indicators.
- Save explicitly, save all tabs, and resolve unsaved changes before closing tabs, switching workspaces, or exiting.
- Detect external edits on focus or refresh, with explicit reload/overwrite handling when saving conflicts.
- Run a shell in the workspace directory from a resizable terminal panel, with full input, output, resizing, restart, and stop.
- Resize or hide the explorer and use a compact dark editor interface.
- Create a project, convert an open folder into one, and edit its name, stack, architecture, default branch, and commands.
- Detect `.tbce/project.json` when a folder opens, and reopen earlier projects from the Recent list.
- Save selected project files and command defaults as reusable local stacks; edit details, replace snapshots, or delete stacks with confirmation.
- Create an independent project from a saved stack or start with a blank project.
- Define personal architectures with folders, UTF-8 starter files, descriptions, and recommended layer boundaries.
- Combine an architecture with a blank project or saved stack, preview the structure, and block conflicting paths before creation.
- Read real repository state: branch, upstream, ahead/behind, staged and unstaged changes, untracked files, conflicts, branches, history, and diffs.
- Initialize and clone repositories, create and switch branches, stage and unstage, commit, and exchange commits with a remote.
- Do all of it from a source-control panel: review changes, stage them, write a commit, switch branches, fetch, pull, push, read paged history, and preview any change as a patch.
- Connect a GitHub account with a personal access token kept in the Windows Credential Manager, and read the repository behind the open project: owner, description, default branch, visibility, language, last push, stars, forks and watchers.
- Read the remote branches GitHub reports, paged commits, and recent repository activity.
- List open and closed issues with their labels, assignees and milestone, filter them by label, assignee and milestone, read an issue's body, and create, close or reopen an issue.
- List open and closed pull requests, and read one: source and target branch, description, reviewers, counts, whether it merges cleanly, the state of its checks and commit statuses, and its changed files, each of which opens as a read-only patch in the editor area.
- See the whole project on one dashboard: repository, Git state, branch, the CI state of the commit you have checked out, open issue and pull request counts, commands, GitHub milestones, recent commits and recent activity.
- Track progress by area: divide the project into areas, tick off each area's tasks, and count the GitHub issues carrying its label or in its milestone. Commits are never counted.

Creating, reviewing and merging pull requests, running project commands, and the rest of V1 remain for later milestones.

## Projects

A TBCE project is a folder containing `.tbce/project.json`. The file records a schema version, name, stack, architecture, default branch, and commands. New projects store their selected stack and architecture's stable IDs; settings retain legacy values. Architecture changes in existing project settings only update metadata. Commands are stored and shown on the dashboard; TBCE does not run them yet. Project metadata makes no claim about Git. Detecting a project still runs no Git command, so opening a folder never waits on one; repository state comes from the Git service instead.

Opening a folder that has no manifest still works exactly as before. Use the project button in the explorer to convert it, or to edit an existing project's settings. Recent projects are remembered locally; an entry that no longer opens is reported and removed.

## Saved stacks

Open **Stacks** in the activity bar and choose **Save current project as stack**. Plain folders work too. Enter a name, description, languages, frameworks, and command defaults, then review the file tree. Unsaved edits can be saved first, or the snapshot can use files already on disk without discarding your buffers.

Git history and `.tbce` metadata are always omitted. Dependency folders, build output, caches, and `.env` files start unchecked; `.env.example` remains selected. Expand folders and adjust checkboxes to choose the files to reuse. Refresh resets the selection and rereads files after external changes. Binary assets and empty directories can be saved, independently of the editor's text-file limits.

The library starts empty, without built-in templates or downloads. **New project** / **Create project** offers a blank project or a saved stack, lets you review defaults, and opens a native parent-folder picker. Creation refuses an existing destination. Source files and internal package names remain unchanged; TBCE creates fresh project metadata. Install dependencies yourself through the terminal.

Stacks live under the application's data directory (`%APPDATA%/com.tbce.app/stacks` on Windows), independently of their source folders and the Recent list. Replacement publishes a new snapshot only after it succeeds; previous snapshot generations remain as recovery data until the stack is deleted. Deletion uses the Recycle Bin and leaves generated projects intact. Export/import, automatic source synchronization, and snapshot-history controls are deferred.

## Personal architectures

Open **Architectures** in the activity bar and choose **New architecture**. The catalog starts empty. Enter a name, description, and recommended boundaries; list folder paths one per line and add starter files with relative paths and text contents. The tree previews the resulting structure. Paths use `/`; Git and TBCE metadata paths are reserved. Starter files support UTF-8 text up to 10 MiB each, without NUL characters.

**New project** lets you choose an architecture with either a blank project or a saved stack. It previews the combined structure and creates a fresh `.tbce/project.json`. Shared folders merge; duplicate files, file/folder conflicts, and paths differing only by letter case block creation. Edit your architecture or change the selection to resolve conflicts. No files are overwritten and no commands are executed.

Architecture definitions live under `%APPDATA%/com.tbce.app/architectures/<id>/architecture.json`, independently of source folders. Edits keep the stable ID; confirmed deletion uses the Recycle Bin and leaves created projects intact. Unavailable legacy values remain metadata and generate no structure. Existing project settings and stack defaults offer the catalog; only new-project creation generates files.

Built-in presets, project capture, applying structures to existing projects, import/export, variable substitution, and advanced boundary enforcement are deferred.

## Git

TBCE runs your installed Git. Version 2 or later is required; if Git is missing or
fails, TBCE says so and everything else keeps working.

The explorer shows the current branch, or that a branch has no commits yet, or that
HEAD is detached. Opening a folder **inside** a repository is not enough: TBCE reports
where the repository is and asks you to open its root, because status for a
subdirectory would describe paths relative to a folder you did not open.

Open **Source control** in the activity bar for the rest. A plain folder offers to
initialize or clone a repository; neither happens on its own. A repository shows its
branch, upstream and ahead/behind counts, its staged and changed files in separate
lists, a commit box, its local branches, and its history a page at a time. Select any
changed file to read its patch in the editor area; your open tabs stay where they are,
and closing the patch returns to them.

Nothing polls. The panel reads the repository when you open it, when you save or open
a file, when the window regains focus, after anything you do in it, and when you press
Refresh. The dashboard reads the same way while it is on screen. With the panel closed and a file in front of the dashboard, TBCE runs no Git at all. A change made outside TBCE
appears on the next focus or refresh, not the instant it happens.

Available operations are initialize, clone, status, branches, create branch, switch
branch, delete branch, stage, unstage, commit, fetch, pull, push, history, and diff.
Creating a branch does not switch to it. Switching is refused while the index or
working tree has changes, and is never forced. Deleting a branch asks for confirmation
and is refused for the current branch, the default branch, an unmerged branch, and one
checked out in another worktree. Committing records what is staged, never what is
merely edited, and never saves or discards your editor buffers.

Pull is fast-forward only: if your branch and the remote have diverged, TBCE reports it
rather than merging or rebasing. Push is never forced. Merge and rebase workflows, force
push, hard reset, stash, and tags are deferred.

Staging works per file and for everything at once; a file cannot yet be staged in
pieces, and commits cannot be amended. The source-control panel lists your local
branches; the GitHub panel lists the branches GitHub reports.

Credentials are your own. For Git, TBCE uses the credential helpers and SSH keys Git is
already configured with, and never writes global or system Git configuration. A GitHub
token is separate and is the one secret TBCE stores itself: see the GitHub section below. Interactive
prompts are disabled, so a missing credential fails with an explanation instead of
hanging; a passphrase-protected SSH key with no agent running will time out. Repository
locations must be HTTPS, SSH, `file://`, or a local path — transport helpers such as
`ext::` name a program to run and are refused outright.

## GitHub

Connecting an account is optional. The only thing TBCE changes on GitHub is an issue, and
only when you create, close or reopen one; everything else in the panel is read-only. There
is no issue editing, no commenting, no starring and no releases in this release, and pull
requests are only read: TBCE cannot create, review or merge one.

Create a personal access token at github.com/settings/tokens. A fine-grained token needs
Metadata, Contents, Issues, Pull requests, Checks and Commit statuses, all Read, or Issues:
Read and write if you want to create, close and reopen issues; a classic token needs `repo`
for private repositories or `public_repo` for public ones. A token missing one of these
leaves that part of the panel explained and the rest working. Paste it once into the panel's masked field.

The token is stored in the Windows Credential Manager under `com.tbce.app`, written only
after GitHub accepts it, and read again for each request. It is never written into your
project, never into application data, and never sent back to the interface. Disconnecting
removes it. If GitHub reports that it has been revoked, TBCE drops it and offers to
connect again. On operating systems other than Windows, storing a token is not supported
in this release.

Which repository you are looking at comes from your own Git remote — the one your branch
tracks, or the only one, or `origin` — so there is nothing to configure. A remote pointing
anywhere other than github.com is explained rather than attempted. Every request is built
in Rust from a workspace identifier, a page number and values checked first; the interface cannot name a host, a
path or a URL, and the application still allows no remote origin in the webview at all,
which is why you see your login name rather than an avatar.

The panel reads only while it is open: when it appears, when the window regains focus, and
when you use Refresh. Nothing polls. GitHub counts pull requests as issues, so the single
count on the Overview is labelled as open issues and pull requests together; the Issues and
Pull requests tabs list each on its own.

Issue bodies are shown as plain text, exactly as written, rather than rendered. Closing an
issue asks whether it was completed or is not planned, and can be undone by reopening it.
GitHub applies labels, assignees and a milestone to a new issue only for people with push
access and drops them silently otherwise; TBCE compares GitHub's answer with what you asked
for and tells you what was left out. If a create or close is not confirmed before the
deadline, TBCE says it may or may not have happened, so check with Refresh before trying
again.

Pull request descriptions are plain text too. The Closed list tells merged pull requests
apart from ones closed without merging, and a pull request from a fork names the fork. Checks
combine GitHub Actions and other Checks API runs with commit statuses, which CI outside
GitHub still uses, into one passing, failing or pending summary; they are read only when you
open a pull request. Choosing a changed file shows GitHub's patch for it in the editor area,
read-only like a local diff, and only one of the two is shown at a time.

## Dashboard

Open a folder and the dashboard appears where the Welcome screen was. With files open, the
**Dashboard** button at the top of the activity bar brings it back in front of them; choosing a tab
returns to the editor, which keeps your unsaved edits and undo history.

Local cards work without an account: the project's name, stack, architecture and commands; how many
files are staged, changed or untracked; the branch, its upstream and how far ahead or behind it is;
and the latest commits. With a GitHub account connected and a github.com remote, the rest fill in:
exact open issue and pull request counts, the checks on the commit you have checked out, open
milestones with how much of each is closed, and recent activity. A commit you have not pushed says
so rather than reading as a failure. The links on the Git state, Issues and Pull requests cards open
the matching panel beside the dashboard.

Like the panels, it reads only while it is on screen: when it appears, when the window regains focus
and when you press Refresh. Commands are shown and not run yet, and the card says so. Project
progress has a card of its own, described next.

## Progress

The **Project progress** card on the dashboard divides the project into areas, such as
Authentication or Teams. Choose **Add areas** or **Edit areas** to name them, list each area's
tasks, and optionally give an area a GitHub label, a GitHub milestone or both. Open an area on the
card to tick its tasks; each tick is saved at once.

An area's figure is its done tasks and closed issues over all its tasks and issues. Its issues are
the ones carrying its label and the ones in its milestone, each counted once, with pull requests
left out. An issue closed as not planned counts neither way, and the card says how many were left
out. An area with nothing to measure shows no percentage rather than 0%. The project's figure adds
the areas together and counts an issue shared by two areas once. Commits are never counted.

The plan is kept in `.tbce/progress.json`, next to `project.json`, so it travels with the
repository; `project.json` itself is not changed. Progress needs a TBCE project, and a plain folder
is offered conversion first. If the file changes on disk while TBCE has it open, a change is
refused rather than written over the other one, and the card shows what is on disk. A file TBCE
cannot read is explained and never overwritten.

Issues are read only with a GitHub account connected and a github.com remote, and only when the
dashboard appears, when the areas' labels or milestones change, when the window regains focus, and
on Refresh; ticking a task asks GitHub nothing. Up to five hundred issues and pull requests are read per label or milestone,
and an area that reaches that says so. Signed out, or without a GitHub remote, an area counts its
tasks alone and says why.

## Development

Install Node.js 24 LTS, current stable Rust with the MSVC toolchain, Visual Studio C++ build tools including a Windows SDK, and WebView2. Run from the repository root:

```sh
npm ci
npm run tauri dev
```

`npm run dev` starts a browser-only UI preview. Native filesystem operations require `npm run tauri dev` or the packaged desktop app.

## Checks and packaging

```sh
npm run format:check
npm run lint
npm test
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm run tauri build
```

Use `npm run format` and `cargo fmt --manifest-path src-tauri/Cargo.toml` to format sources. Windows CI runs the same checks and builds an installer without publishing it.

The unsigned Windows installer is generated at `src-tauri/target/release/bundle/nsis/TBCE_0.1.0_x64-setup.exe`. A standalone executable is generated at `src-tauri/target/release/tbce.exe`. The installer uses a per-user installation; no signing or public release pipeline is configured.

The Milestone 6 build used `npm run tauri build -- --target x86_64-pc-windows-msvc` because the standard release executable was running. Its executable and installer are under `src-tauri/target/x86_64-pc-windows-msvc/release/` and `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`. The Milestone 12 build used the standard command, so its installer is at the standard path above. See the verification record for desktop acceptance limits.

## Keyboard shortcuts

| Action                                   | Windows shortcut |
| ---------------------------------------- | ---------------- |
| Save active file                         | Ctrl+S           |
| Save all files                           | Ctrl+Shift+S     |
| Close active tab                         | Ctrl+W           |
| Open a file inside the current workspace | Ctrl+O           |
| Show or hide the terminal                | Ctrl+`           |

Click the workspace name in the explorer to select the root before creating a root-level item. Otherwise new items are created inside the selected directory or beside the selected file.

## Current limits

One workspace per window, explicit saves, and no editor session restoration or crash recovery. The editor supports UTF-8 files, optionally with BOM, up to 10 MiB, using LF or CRLF. Binary files, other encodings, and mixed/legacy line endings cannot be edited but can be copied in stack snapshots. Symlinks and junctions are rejected. Monaco language features are bundled locally; no CDN is required and no account is needed for anything except GitHub context, which is optional.

One terminal at a time, running the operating system's default shell. Multiple terminal tabs, terminal names, command history, and choosing a shell arrive in later milestones. On Windows the session is started in UTF-8 so that tool output and non-ASCII file names survive; `cmd.exe` and PowerShell are recognized, and any other shell keeps the code page it starts with. Closing a terminal ends its session and its scrollback. Closing the window stops every shell.

Rust confines editing and snapshot source reads to the selected workspace, saved stacks to application data, and new-project creation to a native-picked parent. The one credential TBCE stores, a GitHub token, is kept in the Windows Credential Manager and never crosses back into the webview; GitHub requests are built in Rust, so the interface cannot name a host or a URL. Destructive editor operations cannot target the workspace root. The terminal starts in the workspace root and the webview cannot choose a program or directory, but commands the user types run with the application's privileges: the shell is not a sandbox. See the architecture notes for the local-process race limitation before building untrusted automation on these services.

## Documentation

- [Full product vision and V1/V2 roadmap](docs/roadmap.md)
- [Milestone 6 delivery checklist and prerequisite gate](docs/milestone-6.md)
- [Milestone 7 delivery checklist](docs/milestone-7.md)
- [Milestone 8 delivery checklist](docs/milestone-8.md)
- [Milestone 9 delivery checklist](docs/milestone-9.md)
- [Milestone 10 delivery checklist](docs/milestone-10.md)
- [Milestone 11 delivery checklist](docs/milestone-11.md)
- [Milestone 12 delivery checklist](docs/milestone-12.md)
- [Architecture and native interfaces](docs/architecture.md)
- [Windows acceptance checklist](docs/acceptance.md)
- [Manual acceptance run-sheet for checks 15-42, 57-66 and 67-106](docs/acceptance-runsheet-m6.md)
- [Verification results](docs/verification.md)
- [Remaining work](docs/remaining-work.md)

No project license has been selected. Git author configuration and repository ownership remain with the human owner.
