# TBCE

**Everything your project needs, in one place.**

TBCE means Tools, Branches, Code, Everything. This Windows-first desktop application implements Milestones 0 to 8: a Tauri/Rust foundation, a React/TypeScript workspace powered by Monaco, an integrated terminal, the project system, personal saved stacks, personal architectures, the local Git backend, the source-control panel over it, and read-only GitHub repository context. Desktop acceptance for the terminal, project system, stacks, architectures, Git, and GitHub remains pending; see the verification record.

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
- Read the remote branches GitHub reports, paged commits, and recent repository activity, all read-only.

GitHub issues and pull requests, the project dashboard, running project commands, and the rest of V1 remain for later milestones.

## Projects

A TBCE project is a folder containing `.tbce/project.json`. The file records a schema version, name, stack, architecture, default branch, and commands. New projects store their selected stack and architecture's stable IDs; settings retain legacy values. Architecture changes in existing project settings only update metadata. Commands are stored for later milestones; TBCE does not run them yet. Project metadata makes no claim about Git. Detecting a project still runs no Git command, so opening a folder never waits on one; repository state comes from the Git service instead.

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
Refresh. Close the panel and TBCE stops running Git entirely. A change made outside TBCE
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

Connecting an account is optional and read-only. TBCE never writes to GitHub: there is
no issue creation, no starring and no releases in this release.

Create a personal access token at github.com/settings/tokens. A fine-grained token needs
Metadata: Read and Contents: Read; a classic token needs `repo` for private repositories
or `public_repo` for public ones. Paste it once into the panel's masked field.

The token is stored in the Windows Credential Manager under `com.tbce.app`, written only
after GitHub accepts it, and read again for each request. It is never written into your
project, never into application data, and never sent back to the interface. Disconnecting
removes it. If GitHub reports that it has been revoked, TBCE drops it and offers to
connect again. On operating systems other than Windows, storing a token is not supported
in this release.

Which repository you are looking at comes from your own Git remote — the one your branch
tracks, or the only one, or `origin` — so there is nothing to configure. A remote pointing
anywhere other than github.com is explained rather than attempted. Every request is built
in Rust from a workspace identifier and a page number; the interface cannot name a host, a
path or a URL, and the application still allows no remote origin in the webview at all,
which is why you see your login name rather than an avatar.

The panel reads only while it is open: when it appears, when the window regains focus, and
when you use Refresh. Nothing polls. GitHub counts pull requests as issues, so the single
count on the Overview is labelled as open issues and pull requests together; separate lists
arrive with the issue and pull request milestones.

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

The Milestone 6 build used `npm run tauri build -- --target x86_64-pc-windows-msvc` because the standard release executable was running. Its executable and installer are under `src-tauri/target/x86_64-pc-windows-msvc/release/` and `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`. See the verification record for desktop acceptance limits.

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
- [Architecture and native interfaces](docs/architecture.md)
- [Windows acceptance checklist](docs/acceptance.md)
- [Manual acceptance run-sheet for checks 15-42, 57-66 and 67-74](docs/acceptance-runsheet-m6.md)
- [Verification results](docs/verification.md)
- [Remaining work](docs/remaining-work.md)

No project license has been selected. Git author configuration and repository ownership remain with the human owner.
