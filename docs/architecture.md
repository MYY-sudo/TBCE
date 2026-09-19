# Architecture

TBCE 0.1 implements the desktop foundation, the local editor, the integrated terminal, the project system, personal saved stacks, personal architectures, the local Git backend, the source-control panel over it, GitHub repository context, GitHub issues, a read-only GitHub pull request viewer, and the project dashboard. Creating, reviewing and merging pull requests, running project commands and a database remain deferred.

## Boundaries

```text
React components
  → workspace actions / editor state
  → typed FileSystemService adapter
  → Tauri commands
  → Rust FileSystemService
  → operating system
```

```text
project panel / welcome screen
  → project store actions
  → typed ProjectService adapter
  → Tauri commands
  → Rust ProjectService → FileSystemService root
  → .tbce/project.json
```

```text
xterm.js view
  → terminal store actions
  → typed TerminalService adapter
  → Tauri commands
  → Rust TerminalService → ProcessService
  → pseudo terminal → shell process
```

```text
source control panel / explorer label
  → git store actions
  → typed GitService adapter
  → Tauri commands
  → Rust GitService → bounded process runner
  → git executable
```

```text
GitHub panel
  → github store actions
  → typed GitHubService adapter
  → Tauri commands
  → Rust GitHubService → bounded HTTP runner
  → api.github.com
```

```text
project dashboard
  → dashboard store actions, and the project, git and github stores
  → typed GitService and GitHubService adapters
  → Tauri commands
  → Rust GitService and GitHubService
```

The Rust filesystem service owns the selected root and a generation identifier. The frontend receives a display path and identifier, then supplies relative paths for editor operations and snapshot capture. Replacing the workspace invalidates the previous identifier. Native pickers choose folders, files, and new-project parents. Reopening a recent project accepts an absolute path; the stack library uses a backend-owned application-data root, as described below.

Commands return serializable values or `{ code, message }` errors. The service adapter is the only filesystem IPC caller. Window lifecycle integration lives in a separate service. The workspace store serializes user operations and owns tabs, dirty baselines, directory cache, and prompts. React renders those states; Monaco owns editor models, undo stacks, and per-tab view state.

## Native command contract

| Command                     | Arguments                                                                         | Result                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `choose_workspace`          | None; native folder picker                                                        | Workspace or null                                                                      |
| `choose_file`               | `workspaceId`; native file picker                                                 | Relative path or null                                                                  |
| `list_directory`            | `workspaceId`, `path`                                                             | Entries with name, path, kind                                                          |
| `read_file`                 | `workspaceId`, `path`                                                             | UTF-8 content, revision, BOM flag, path                                                |
| `write_file`                | `workspaceId`, `path`, `content`, `revision`, `bom`                               | Saved document                                                                         |
| `create_entry`              | `workspaceId`, `path`, `directory`                                                | Void                                                                                   |
| `rename_entry`              | `workspaceId`, `from`, `to`                                                       | Void                                                                                   |
| `trash_entry`               | `workspaceId`, `path`; native confirmation                                        | Whether deletion was confirmed                                                         |
| `detect_project`            | `workspaceId`                                                                     | None, found manifest, or invalid reason                                                |
| `init_project`              | `workspaceId`, `fields`                                                           | Project                                                                                |
| `update_project`            | `workspaceId`, `fields`                                                           | Project                                                                                |
| `read_progress`             | `workspaceId`                                                                     | None, found plan with its revision, or invalid reason                                  |
| `write_progress`            | `workspaceId`, `plan`, `revision` or null                                         | Saved plan and its new revision                                                        |
| `list_stacks`               | None                                                                              | Stacks and warnings for damaged definitions                                            |
| `inspect_stack_source`      | `workspaceId`, relative directory `path`                                          | File/directory selections with size, revision, exclusion defaults, and blocked reasons |
| `save_stack`                | `workspaceId`, optional existing `id`, `fields`, selected `entries`               | Stack or null after cancelled replacement confirmation                                 |
| `edit_stack`                | `id`, `fields`                                                                    | Stack with updated details/defaults                                                    |
| `delete_stack`              | `id`; native confirmation                                                         | Whether deletion was confirmed                                                         |
| `create_project_from_stack` | Current `workspaceId` or null, optional `stackId`, `fields`; native parent picker | Workspace or null                                                                      |
| `open_recent_project`       | `path`                                                                            | Workspace                                                                              |
| `start_terminal`            | `workspaceId`                                                                     | Terminal identifier and shell name                                                     |
| `restart_terminal`          | `workspaceId`, `id`                                                               | Terminal identifier and shell name                                                     |
| `write_terminal`            | `id`, `data`                                                                      | Void                                                                                   |
| `resize_terminal`           | `id`, `cols`, `rows`                                                              | Void                                                                                   |
| `stop_terminal`             | `id`                                                                              | Void                                                                                   |

Terminal output and exit codes arrive on the `terminal:event` channel as `{ kind: "output", id, data }` or `{ kind: "exit", id, code }`. The frontend subscribes before starting a shell and ignores exit reports from a replaced session.

## Project behavior

`ProjectService` is stateless: commands resolve the open workspace root through `FileSystemService`, then read or write `.tbce/project.json` beneath it. Detection reports one of three outcomes — no manifest, a manifest, or a manifest TBCE could not read — so a corrupt or future-schema file degrades to an explanation instead of an error. Project settings replace the stored fields rather than merging them, which is why progress is kept in a file of its own rather than in the manifest. Stack settings suggest the saved catalog and preserve unknown legacy strings. Architecture settings offer the personal catalog and preserve unavailable legacy strings as metadata. `commands` is stored and edited but never executed, because running commands belongs to the command milestone and must reuse `ProcessService`. The project service makes no claim about Git at all: it still runs no Git command, so opening a folder never waits on one, and repository state comes from a separate `GitService` call instead.

The frontend keeps recent projects in webview local storage, capped and deduplicated by path. Losing that list costs a convenience, never project data, so no database is introduced for it.

## Saved stacks

The Stacks panel and dialogs call a Zustand store and typed `TemplateService` adapter. Native commands delegate to the Rust template service on blocking worker threads. Library operations are serialized by a dedicated mutex; source capture and project creation also lock the filesystem workspace identity. The UI holds its workspace operation guard during capture/creation, including unsaved-change decisions, so a second workspace operation cannot invalidate the first.

Each stack has an opaque stable ID and a schema-version-1 `stack.json` under `<app_data>/stacks/<id>/`. Its definition records a name, description, language/framework lists, project defaults, active snapshot generation, and selected relative entries with SHA-256 revisions. File bytes live in `<generation>/files/`. The library starts empty and survives source deletion or Recent-list clearing. No database, Git process, generator, network download, or command runner is involved.

Inspection enumerates one directory at a time. The UI recursively loads selected directories and only opens excluded dependency trees on demand. `.git` and `.tbce` components are always excluded. `node_modules`, `target`, `dist`, `build`, `coverage`, `.next`, `.nuxt`, `.cache`, `.venv`, `venv`, `__pycache__`, `.pytest_cache`, `.mypy_cache`, `.turbo`, and `.env`/`.env.*` start deselected; `.env.example` is exempt. Explicit checkbox selection can override these defaults. Links, junctions, invalid paths and special files remain blocked.

Snapshots copy regular files as bytes, including binary assets, and preserve empty directories. Revision checks before, during, and after copying detect source changes. A failed capture leaves the published snapshot intact. Definitions use a synced temporary file and atomic replacement; the active snapshot changes only after copying completes. Old generations remain as recovery data until confirmed stack deletion moves the stack directory to the Recycle Bin. Damaged or future-schema entries are skipped with a catalog warning.

Project creation stages the selected snapshot and a fresh `.tbce/project.json` beside the intended destination. It exclusively creates a new destination directory and moves its staged entries there. Failure cleanup moves back only entries this operation created, attempts to remove the now-empty destination, and reports its path if cleanup cannot finish. Only successful creation changes the native workspace and triggers frontend adoption/Recent detection and retirement of the previous terminal. Picker cancellation and creation errors preserve the old workspace and dirty buffers. A failure opening an already-created project reports its location for recovery.

Project metadata stays at schema version 1: `stack` holds the stable ID, `name` is the new project name, and remaining fields come from reviewed defaults. Source file contents and package names are never substituted. Editing/deleting a saved stack does not rewrite existing projects. The existing local-process race limitation still applies; these services are not an adversarial filesystem sandbox.

## Personal architectures

The Architectures panel uses a typed adapter and Zustand store over Rust `ArchitectureService`. It shares the template-library mutex, serializing catalog changes, preview, and project creation. Commands run on blocking workers and are registered in the invoke handler, build-time manifest, and main-window capability.

Each `<app_data>/architectures/<id>/architecture.json` stores `schemaVersion: 1`, stable `id`, `name`, `description`, textual `boundaries`, relative `directories`, and `files` containing `path`/`content` pairs. The catalog starts empty. Updates sync and atomically replace the definition; new definitions publish only after success. Deletion requires native confirmation and uses the Recycle Bin. Corrupt, mismatched, or future-schema definitions produce catalog warnings.

| Native command              | Arguments                                                     | Result                                                    |
| --------------------------- | ------------------------------------------------------------- | --------------------------------------------------------- |
| `list_architectures`        | None                                                          | `{ architectures, warnings }`                             |
| `get_architecture`          | `id`                                                          | Architecture definition                                   |
| `save_architecture`         | nullable `id`, `fields`                                       | Saved architecture with stable ID                         |
| `delete_architecture`       | `id`                                                          | Boolean; false on cancellation                            |
| `preview_project_structure` | nullable `stackId`, nullable `architectureId`                 | `{ entries: [{ path, directory }], conflicts: string[] }` |
| `create_project_from_stack` | `workspaceId`, `stackId`, `fields`, optional `architectureId` | Workspace or null on picker cancellation                  |

Preview and creation use the same merge function, including implicit parent directories. Exact shared directory paths merge; file/file, file/directory, and case collisions block creation. The backend reloads the selected definitions and rechecks conflicts before staging. Architecture text is written with exclusive file creation alongside copied stack files, followed by fresh project metadata. The existing destination reservation, cleanup, workspace identity guard, unsaved-buffer handling, and terminal retirement flow remains in use.

Paths reject traversal, absolute paths, Windows-invalid names, links/junctions, and `.git`/`.tbce` components. Starter files are literal UTF-8 text without NUL characters, capped at 10 MiB each. No command execution or substitution is performed. Boundaries are documentation, with enforcement deferred.

Project metadata stays at schema version 1. `architecture` records the selected stable ID, while unavailable legacy values remain metadata without generating structure. Project settings and stack defaults offer the catalog; settings changes never apply structures to existing projects. Library edits/deletion leave generated projects intact.

## Terminal behavior

`ProcessService` owns pseudo-terminal processes: it spawns them, streams decoded output, forwards input, resizes, and terminates. `TerminalService` keeps shell sessions on top of it, keyed by identifiers it generates. Project commands and any future automation are expected to reuse the process module rather than executing shells themselves. That module also owns the bounded non-terminal runner the Git service uses, described below, so all operating-system process handling stays in one place.

The shell directory comes from the open workspace identifier, so the webview cannot choose where a shell runs. The default shell is `%COMSPEC%` on Windows and `$SHELL` elsewhere; choosing one belongs to the settings milestone.

Output is decoded as UTF-8 across read boundaries, so multi-byte characters split between reads survive. ConPTY asks the terminal for its cursor position and refuses to start the child until it is answered, so the frontend attaches its event listener before requesting a shell; xterm.js produces that answer on its own. ConPTY also keeps the output pipe open while the session lives, so exits are detected by waiting on the process instead of by end of output, after a short window that lets trailing output through. Windows reports a successful termination as an error, so stopping confirms that the process actually ended.

On Windows the session is started in UTF-8 rather than the machine's OEM code page. ConPTY already re-encodes what a program writes through the console API, but a program that writes raw UTF-8 bytes to standard output — Git and most ported command line tools do — is decoded by the console using its code page, which on a default installation cannot represent every character. `cmd.exe` is therefore started with `chcp 65001` and PowerShell with a UTF-8 `[Console]::OutputEncoding`. An unrecognized shell keeps the code page it starts with. The decoder is deliberately left strict: the shell is asked to produce UTF-8 instead of the decoder being made lenient about what it receives.

Closing the window terminates every session. Replacing the workspace stops the running shell because its directory belonged to the previous workspace.

## Git backend

```text
source control panel / explorer label
  → git store actions
  → typed GitService adapter
  → Tauri commands
  → Rust GitService → bounded process runner
  → git executable
```

UI code never runs Git. The webview supplies a workspace identifier, branch names,
relative paths and a commit message; the backend resolves the repository itself.

### The runner

Milestone 6 needs argument arrays, separate exit codes, bounded output and timeouts.
The pseudo-terminal service provides none of these: a terminal merges the two output
streams, reports exit asynchronously and never stops reading. A second runner therefore
lives beside it in the process module, so every operating-system process concern stays
in one place and the rule that nothing else executes programs directly still holds.

`process::run` takes a program, an argument array, a working directory and an
environment delta. It pipes both output streams separately, attaches nothing to standard
input, and creates no console window. Readers continue past the 8 MiB cap and discard
the excess rather than letting a full pipe stall the child, and report that the output
was truncated. The child is polled to a deadline and killed if it passes one, so a hung
Git process is reported as a timeout instead of freezing the application. Canonical
Windows roots carry a `\\?\` prefix that `CreateProcess` will not accept as a working
directory, so both the shell and the runner strip it through the same helper.

### Hardening

Every invocation carries `--no-optional-locks`, `core.quotePath=false` so non-ASCII
paths arrive as raw bytes rather than escapes, a disabled editor and pager, no colour,
and `protocol.ext.allow=never` with `protocol.fd.allow=never`. The environment sets
`GIT_TERMINAL_PROMPT=0` so a missing credential fails instead of waiting for a prompt,
and `LC_ALL=C` so diagnostics are stable enough to classify.

Three tempting settings are deliberately **not** used:

- `GIT_CONFIG_NOSYSTEM` would hide the system configuration, which on Git for Windows
  carries the credential manager. The milestone requires reusing existing credentials.
- `GIT_SSH_COMMAND` would override a configured `core.sshCommand`, breaking anyone with
  their own SSH setup.
- `core.hooksPath` is left alone. Disabling hooks would silently skip a user's own
  `pre-commit`. Hooks are contained by the null standard input, the absent console and
  the timeout instead.

Nothing writes global or system configuration; a test asserts that `--global`,
`--system` and `GIT_CONFIG_NOSYSTEM` appear nowhere in the service's code. The
consequence to be aware of: a passphrase-protected SSH key with no agent running has
nothing to prompt, so the operation runs to the network deadline and is reported as a
timeout.

Every message that can reach the interface passes through redaction, which replaces the
credentials in any URL userinfo. Failures are classified by matching the redacted text
against an ordered table per operation; an unrecognized failure stays a generic Git
failure carrying its first line rather than being guessed at.

### Resolution and the root requirement

`rev-parse` answers where the repository is. A bare repository is recognized before
`--show-toplevel` is asked for, because that option fails inside one. A git directory
that differs from the common directory marks a linked worktree.

The repository's top level must be the folder the user opened. Both paths are
canonicalized before comparison, so drive-letter case and the verbatim prefix cannot
produce a false mismatch. A repository found **above** the workspace is reported as a
parent and refused for every operation, not only for changes: status for a subdirectory
would describe paths relative to a folder the user did not open. Detection never fails
the caller — a missing, slow or broken Git is reported as unavailable — so the state of
a Git installation can never stop a folder from opening.

The editor's own path helpers are reused only where they fit. Relative pathspecs go
through `validate_relative`, which rejects traversal, backslashes, absolute paths and
Windows-invalid names. Repository resolution does not, because those helpers refuse
symbolic links and junctions, and a linked worktree's `.git` is a file pointing outside
the workspace.

### Concurrency

A dedicated mutex serializes repository operations, mirroring the stack library's lock.
The workspace root is resolved **after** that lock is acquired, because waiting in the
queue is exactly when a workspace switch can land; a stale request is rejected there.
The filesystem guard is released before Git starts, so a five-minute fetch never blocks
saving a file.

The lock order is a rule worth stating: the filesystem service is a leaf. It is acquired
last, held only long enough to read a root or the current identifier, and never held
while another lock is taken or while a child process runs.

### Native command contract

| Command                 | Arguments                                | Result                                             |
| ----------------------- | ---------------------------------------- | -------------------------------------------------- |
| `git_detect_repository` | `workspaceId`                            | None, found, parent, or unavailable                |
| `git_init_repository`   | `workspaceId`, nullable `defaultBranch`  | Repository                                         |
| `git_clone_repository`  | `source`, `folder`; native parent picker | Clone location, or null on cancellation            |
| `git_status`            | `workspaceId`                            | Branch, upstream, ahead/behind, changes, conflicts |
| `git_branches`          | `workspaceId`                            | Current, default, local and remote branches        |
| `git_create_branch`     | `workspaceId`, `name`, `startPoint`      | Branches, without switching                        |
| `git_checkout_branch`   | `workspaceId`, `name`                    | Status after switching                             |
| `git_delete_branch`     | `workspaceId`, `name`; native confirm    | Whether deletion was confirmed                     |
| `git_stage`             | `workspaceId`, `paths`                   | Status                                             |
| `git_stage_all`         | `workspaceId`                            | Status                                             |
| `git_unstage`           | `workspaceId`, `paths`                   | Status                                             |
| `git_commit`            | `workspaceId`, `message`                 | The new commit                                     |
| `git_fetch`             | `workspaceId`, nullable `remote`         | Status                                             |
| `git_pull`              | `workspaceId`                            | Status                                             |
| `git_push`              | `workspaceId`, `setUpstream`             | Status                                             |
| `git_history`           | `workspaceId`, `skip`, `limit`, `path`   | Bounded page of commits with a has-more flag       |
| `git_diff`              | `workspaceId`, `path`, `staged`          | Patch with binary, rename and truncation flags     |
| `git_diff_summary`      | `workspaceId`, `staged`                  | Per-file added/removed counts, null when binary    |

Index and working-tree changes are reported separately, so one file can appear in both
lists with different states. Ahead and behind are null when there is no upstream to
compare against, rather than a misleading zero. Operations read what is saved on disk;
no editor buffer is ever saved or discarded on the user's behalf.

### What is deliberately absent

Pull is fast-forward only. Merge and rebase workflows, force push, hard reset, stash,
tags and submodules remain absent. Deleting a branch uses `-d` and never `-D`, so Git
itself refuses unmerged work.

## Source control panel

```text
source control panel / diff preview
  → git store actions
  → typed GitService adapter
  → the eighteen Git commands above
```

Milestone 7 adds an interface and nothing else: no Rust source changed, and the Rust
test count is the same before and after. The panel is one more activity-bar panel
beside the explorer, stacks and architectures.

### What the store holds

A single Zustand store owns detection, the last status, the branch list, a page of
history, the per-file diff summaries, the open preview and the commit message draft.
Components read that store and call its actions; none of them invokes a command.

Two rules carry over from the services below it. Every read and mutation is numbered
and checked against the open workspace, so an answer that arrives after the user
opened a different folder is discarded rather than displayed. A second operation
started while one runs is refused rather than queued, because the backend serializes
repository access anyway and a queue would only hide the wait behind a growing backlog.

Mutations return a fresh status, which is written straight into the store instead of
being followed by another status call. Staging stops there, because moving content
between the index and the working tree cannot change which branches exist or what has
been committed. Commit, checkout, branch deletion, fetch, pull and push reread
everything, because each of them can.

### When Git runs

Never on its own schedule. Detection runs when a workspace opens, which is what the
explorer's branch label needs and is the only Git the project system waits on — and
it waits on none, because `detect_project` still runs no Git at all. Everything else
runs only while the panel is on screen: when it appears, when the set of file
revisions the editor holds changes, when the window regains focus, after a mutation,
and on the explicit Refresh control. Saving is what that revision rule is for; opening
a file changes the set too and refreshes as well, which is a harmless extra read rather
than a separate trigger worth its own code. Closing the panel stops all of it, except
that the Milestone 11 dashboard refreshes the same store while it is on screen. There is no file watcher and no
poll, so a change made outside TBCE appears on the next focus or refresh.

### The diff preview

The backend answers `git_diff` with a unified patch rather than two file versions, so
the preview is that patch shown read-only in Monaco with `diff` highlighting. A
side-by-side Monaco diff editor would need a nineteenth command returning the original
and modified contents; the patch keeps Git's own rename, binary and truncation
reporting, which a reconstructed side-by-side view would lose. The preview opens in
the editor area, because the sidebar is too narrow to read a patch in. The editor is
hidden rather than unmounted while it is open: unmounting runs Monaco's cleanup, which
disposes every model and would cost each tab its undo history. Closing the preview
returns to exactly what was being edited.

Since Milestone 10 the Monaco view itself is `components/PatchView.tsx`, shared with the
patches of a pull request's changed files. `git/DiffView.tsx` is the Git wrapper around
it, with its labels and banners unchanged. Only one patch occupies the editor area at a
time: opening a pull request file closes the local diff, and the GitHub store watches
the Git store so that opening a local diff closes the pull request patch.

### What the panel does not add

Partial or hunk-level staging, commit amending, merge and rebase workflows, force
push, hard reset, stash, tags and remote-branch management are all absent, because the
backend does not implement them and this milestone added no backend. Branch deletion
still asks for native confirmation in Rust rather than in the webview.

## GitHub service

```text
GitHub panel
  → github store actions
  → typed GitHubService adapter
  → twenty-one github_* commands
  → Rust GitHubService → bounded HTTP runner
  → api.github.com
```

Milestone 8 reads a repository and never writes one. It answers a single question — what does
GitHub know about the project that is open. Milestone 9 adds issues, and with them the only three
requests TBCE sends that change anything on GitHub: creating, closing and reopening an issue, each
on an explicit action. Milestone 10 adds pull requests, and only reads them: every request it adds
is a `GET`. Milestone 11 adds three reads for the project dashboard, and Milestone 12 one for the
issues of a progress area, each described in its own section below.

Three rules carry the security story, and they are the reason this shape was chosen over calling
GitHub from the webview.

- **The webview never names a host, a path, a header or a URL.** Commands carry a workspace
  identifier, a page number and values the backend checks; the backend builds every request. This is the same reasoning that
  makes the terminal commands take a workspace identifier instead of a program.
- **The token crosses IPC once, inbound.** `github_sign_in` is the only command that accepts one.
  Nothing returns it, it is read from the vault per operation rather than held in memory, and it is
  replaced with `***` in any text that can reach the interface.
- **The content security policy is unchanged.** `connect-src` stays IPC-only and `img-src` stays
  `'self' data:`, so the webview can make no request of its own and load no remote image. That is
  why the panel shows a login name rather than an avatar; fetching avatar bytes in Rust and handing
  over a data URL would work and is deliberately not done here.

### The runner

`process::run` is the wrong tool for an HTTP request and there is no second process to bound, so
the GitHub service has a runner of its own with the same responsibilities: one function holds the
headers, the deadlines, the size cap, the conditional cache and the classification, and nothing
else in the application makes a network request.

Every request carries `Accept: application/vnd.github+json`, `X-GitHub-Api-Version`, a
`TBCE/<version>` user agent and a bearer token. The base URL is a field rather than a constant, but
the production constructor pins `https://api.github.com` and there is no environment override, so a
packaged build cannot be pointed elsewhere; the tests construct the service with a local base
instead. Connect and read deadlines are 10 and 20 seconds — nothing here transfers a repository, so
the Git service's 300-second network limit would only postpone a report of failure. The response
cap is 1 MiB, read one byte past the limit so an answer that is exactly full is distinguishable from
one that is too large.

Redirects are **not** followed. A redirect would resend the authorization header to wherever it
points, so a moved repository is reported rather than chased.

`hasMore` comes from GitHub's own `Link` header, not from the size of a page: a page that happens to
be full is not a page with more behind it. Rate-limit headers are parsed and returned alongside the
data, so the panel can show what is left before the allowance bites, and `reset` crosses the wire as
Unix seconds because formatting a local time is the interface's job.

Answers are cached by request path with their `ETag` and revalidated with `If-None-Match`. A `304`
reuses the cached body, including the paging flag, which the `Link` header no longer carries on a
revalidated answer. Since Milestone 11 the runner also keeps the page number of the `rel="last"`
link, so a list read one item per page reports how many items there are; only the digits of its
`page` parameter are read, and that number is cached and restored on a `304` like the paging flag.
The cache is small, in memory, and cleared wholesale on sign-in and sign-out; it
exists to spare the rate limit, not to be a store, which is why it is not a reason to introduce
SQLite.

Failures are classified into a fixed set of codes, because `ServiceError` carries a `&'static str`:
`GITHUB_SIGNED_OUT`, `GITHUB_AUTH_FAILED`, `GITHUB_FORBIDDEN`, `GITHUB_RATE_LIMITED`,
`GITHUB_NOT_FOUND`, `GITHUB_UNAVAILABLE`, `GITHUB_NETWORK_FAILED`, `GITHUB_TIMED_OUT`,
`GITHUB_RESPONSE_INVALID`, `GITHUB_NOT_LINKED`, `GITHUB_TOKEN_REJECTED`,
`CREDENTIALS_UNAVAILABLE` and `CREDENTIALS_UNSUPPORTED`, and since Milestone 9
`GITHUB_WRITE_UNCONFIRMED`, `GITHUB_VALIDATION_FAILED` (a `422`), `GITHUB_GONE` (a `410`),
`GITHUB_ISSUES_DISABLED`, `GITHUB_NOT_AN_ISSUE` and `GITHUB_INVALID_ISSUE`, and since Milestone 10
`GITHUB_INVALID_PULL`. GitHub's own `message` field is carried
through where it explains something a user can act on — a SAML refusal, a suspended token — after
being scrubbed.

### The token

The token lives in the Windows Credential Manager under the application identifier, behind a
`CredentialStore` trait so that the rest of the module holds no platform detail and the tests need
no vault. It is written only after `GET /user` accepts it, so a typo never replaces a working token.
It is never written to application data or to `.tbce/project.json`: the manifest lives inside the
user's repository, and a secret there would be one `git add` away from being published.

A token GitHub reports as revoked is dropped and the account becomes signed out. There is nothing to
argue with — a revoked token cannot be used — and repeating a failure the user cannot act on would
be worse than offering to connect again.

On anything other than Windows the vault reports `CREDENTIALS_UNSUPPORTED` rather than writing a
secret somewhere unprotected, which matches every other document saying that only Windows is
verified.

Requests are always authenticated, even for a public repository, because an unauthenticated call
gets sixty requests an hour and would make the panel unusable the moment it is refreshed twice.

### Which repository

Identity is read from the workspace's own Git remote, never supplied by the interface. `GitService`
gained one method, `remote_url`, which reports the name and URL of the remote an operation would
talk to — the remote the current branch tracks, else the only remote, else `origin`. No Tauri
command was added for it, so the Git surface stays at eighteen commands and the IPC surface does not
grow.

The URL is parsed in Rust. HTTPS, `ssh://`, scp-style `git@github.com:owner/repo.git`, `git://`,
ports and userinfo are all recognized, and userinfo is dropped rather than parsed, because a token
in a remote URL is the user's own business and must not travel further. A host that is not
github.com is reported as a state the panel explains: only GitHub is supported, as the roadmap
requires. Owner and repository names are validated before they are put in a request path, so a
crafted remote cannot reach another endpoint.

`github_link` runs Git and no request at all, which is what lets the panel decide whether there is
anything to ask about without asking.

### Concurrency

A mutex serializes GitHub reads and guards the cache. The lock order is worth stating, because it is
the opposite of what the obvious implementation does: the GitHub lock is **never** held while the
Git lock is taken. Repository identity is resolved under the Git lock and that lock is released
before anything is sent, so a stalled or rate-limited GitHub answer cannot block staging a file or
saving one. The filesystem service remains a leaf.

### Native command contract

| Command             | Arguments                    | Result                                              |
| ------------------- | ---------------------------- | --------------------------------------------------- |
| `github_account`    | None                         | Signed out, or login, name, scopes and rate limit   |
| `github_sign_in`    | `token`                      | Account; stored only after GitHub accepts the token |
| `github_sign_out`   | None                         | Void; removes the credential and clears the cache   |
| `github_link`       | `workspaceId`                | Repository, remote or host state; runs no request   |
| `github_repository` | `workspaceId`                | Identity, description, default branch and counts    |
| `github_branches`   | `workspaceId`, `page`        | Page of remote branches with tip and protection     |
| `github_commits`    | `workspaceId`, `page`, `ref` | Page of commits                                     |
| `github_activity`   | `workspaceId`, `page`        | Page of repository activity                         |

Milestone 9 adds six more. The three that write are marked.

| Command                | Arguments                         | Result                                                |
| ---------------------- | --------------------------------- | ----------------------------------------------------- |
| `github_issues`        | `workspaceId`, `filter`, `page`   | Page of issues, pull requests left out                |
| `github_issue`         | `workspaceId`, `number`           | One issue with its body; a pull request is refused    |
| `github_issue_choices` | `workspaceId`                     | Labels, assignees and open milestones for the pickers |
| `github_create_issue`  | `workspaceId`, `draft`            | **Writes.** The new issue, and what GitHub left out   |
| `github_close_issue`   | `workspaceId`, `number`, `reason` | **Writes.** The closed issue                          |
| `github_reopen_issue`  | `workspaceId`, `number`           | **Writes.** The reopened issue                        |

Milestone 10 adds three, none of which writes.

| Command                | Arguments                       | Result                                                  |
| ---------------------- | ------------------------------- | ------------------------------------------------------- |
| `github_pull_requests` | `workspaceId`, `state`, `page`  | Page of pull requests, open or closed                   |
| `github_pull_request`  | `workspaceId`, `number`         | One pull request with its body, counts and head checks  |
| `github_pull_files`    | `workspaceId`, `number`, `page` | Page of changed files, each with GitHub's patch if sent |

Milestone 11 adds three more for the dashboard, none of which writes.

| Command              | Arguments     | Result                                                             |
| -------------------- | ------------- | ------------------------------------------------------------------ |
| `github_counts`      | `workspaceId` | Open pull requests and open issues counted apart                   |
| `github_milestones`  | `workspaceId` | First page of open milestones with their open and closed counts    |
| `github_head_checks` | `workspaceId` | Check runs and statuses of the local HEAD commit, or no commit yet |

Milestone 12 adds one more for project progress, which does not write either.

| Command              | Arguments                                           | Result                                                            |
| -------------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| `github_area_issues` | `workspaceId`, `label` or null, `milestone` or null | Issues with the label or in the milestone, pull requests left out |

Counts are reported as GitHub reports them. `openIssuesAndPullRequests` is named after what the
field actually contains: GitHub counts pull requests as issues, and a field called `openIssues`
would be wrong in every repository with an open pull request.

### The panel

One more activity-bar panel, mounted only while it is selected, so working in the editor never
reads GitHub. Since Milestone 11 the dashboard also reads while it is on screen, which with a folder
open and no file open it is; that section says what it reads. The panel reads when the panel appears, when the window regains focus while
it is visible, and on its Refresh control. Nothing polls.

One refresh reads everything the panel shows — repository, branches, commits, activity and the
first pages of issues and pull requests — so switching between Overview, Branches, Commits, Issues
and Pull requests runs nothing at all. Six requests against a 5000-per-hour allowance buys a panel
that never waits when a tab is selected. An issue open on screen costs one more and a pull request
four more — itself, its check runs, its commit statuses and its first page of files — so neither can
show a state older than the list beside it. Labels, assignees and milestones are read only when the
filters or the new-issue form first need them.

The store keeps two busy flags rather than one. Reading a repository must not disable the account
controls: a stalled or rate-limited read is exactly when someone wants to disconnect, and blocking
that would trap them. The account also sits outside the state a workspace change resets, because
signing in is global and opening another folder must not undo it.

Activity is the one section allowed to fail alone. It needs more access than repository metadata, so
a refusal leaves that section empty and explained instead of failing the whole read.

### Issues

Milestone 9 lives in `github/issues.rs`, a child of the GitHub module that uses the same runner, and
its models stay GitHub's own rather than joining the generic TBCE types.

**Writes.** `send` takes a method from a closed set — `GET`, `POST`, `PATCH` — and an optional JSON
body, and accepts `201` beside `200`. A write goes through `write`, which is never conditional,
never cached and never retried: sending a create twice would create two issues. A write that timed
out after it may have reached GitHub is reported as `GITHUB_WRITE_UNCONFIRMED`, telling the user to
refresh before trying again, rather than as a failure that invites a duplicate; a write that could
not connect at all is an ordinary `GITHUB_NETWORK_FAILED`. The cache needs no invalidation after a
write, because every cached read is revalidated with `If-None-Match` and cannot come back stale.

**What the webview may send.** The filter, the draft and the close reason are checked before any
request exists: a title is trimmed and must be 1-256 characters, a body at most 65,536, a label at
most 50 characters with no control characters, at most 100 labels and 10 assignees, a login in
GitHub's character set, a milestone or issue number of at least 1. The state and the close reason
are Rust enums, so no other value deserializes. Query values are percent-encoded byte by byte, so a
label called `bug&state=all` filters by that label rather than adding a parameter. A label colour
reaches the interface only as six hexadecimal digits, because the panel puts it in a style.

**Pull requests.** GitHub's issue endpoints return pull requests too, and `PATCH` on one closes a
pull request as readily as an issue. Lists leave them out — so a page can be shorter than thirty
while `Link` still advertises another — and closing or reopening reads the number first and refuses
a pull request before anything is changed. The check costs one conditional request.

**What GitHub silently drops.** Labels, assignees and a milestone are applied only for someone
with push access, and GitHub drops them without an error otherwise. The answer to a create is
compared with the request, case-insensitively as GitHub compares names, and whatever is missing is
reported rather than assumed away.

**Size.** An issue page can carry thirty bodies of 65,536 characters of up to four bytes each, so
issue lists alone are read with an 8 MiB cap; everything else, a single issue included, keeps the
1 MiB cap. Only answers within 1 MiB are cached, so the cache stays bounded at 64 × 1 MiB.

**The panel.** Bodies are shown as plain text in a `pre` element, never rendered: Markdown would
need a parser and a sanitizer, and images would stay blocked by the content security policy
anyway. Closing asks for a reason — completed or not planned — in the panel's own dialog rather
than a native one, because closing is undone by reopening; nothing here destroys data. The draft
lives in the store, so a failed create or a switch to another panel loses no typing. A create is
never reported as failed because the list could not be re-read afterwards: the issue exists, and the
list says it could not refresh.

### Pull requests

Milestone 10 lives in `github/pulls.rs`, another child of the GitHub module on the same runner. It
sends `GET` and nothing else, which a test asserts by recording every request the viewer makes.

**What is read.** A list page carries each pull request's number, title, state, draft flag, author,
source and target branch, labels, assignees, requested reviewers and teams, milestone and dates.
GitHub reports a merged pull request as `closed`, so `merged` is derived from `merged_at` and the
panel tells the two apart. The source names its repository when it differs from the target's, and a
fork GitHub reports as `null` — a deleted fork — is shown as such rather than as a local branch. One
pull request adds its body, commit and line counts, changed-file count, comment counts and GitHub's
mergeable state, which stays unknown until GitHub has computed it in the background.

**Checks.** Opening a pull request reads its head commit's check runs and its combined commit
status, a hundred each, because CI services outside GitHub Actions still report through statuses.
The head SHA comes from GitHub's answer, but it goes into a request path, so anything that is not 40
or 64 hexadecimal digits is refused before a request exists. Each entry is classified as passing,
failing, pending or neutral in Rust, and the summary is failing if anything failed, else pending if
anything is still running, else passing if anything ran at all. A refusal of either source is part
of the answer — `runsDenied` or `statusesDenied` — and any other failure becomes `checks.error`,
because the pull request above it was read fine. A `404` or `422` on the check runs means GitHub
does not have the commit; since Milestone 11 that sets `checks.missing` and skips the statuses read,
which cannot exist either. Only a rejected token stops the read, so the
account is still dropped exactly as elsewhere. More entries than were read is reported as
`truncated`.

**Files and patches.** Changed files are paged thirty at a time from GitHub's files endpoint, which
lists at most 3,000. Each carries GitHub's unified patch, or nothing for a binary or very large file,
and the panel opens that patch in the shared read-only Monaco view without another request. Pull
request list pages and file pages read with the 8 MiB list cap that issue lists use; a single pull
request and its checks keep 1 MiB, and the cache still keeps only answers within 1 MiB.

**The panel.** The state is a Rust enum, open or closed, so no other value reaches the query. The
description is plain text in a `pre` element, like an issue body. A token that cannot read pull
requests leaves the tab explained and the rest of the panel intact; a failure to read files is shown
beside the pull request rather than replacing it. Refresh re-reads an open pull request and its first
page of files, and an open patch stays open only while that page still lists its file.

### What is deliberately absent

No writes beyond creating, closing and reopening an issue: no editing, no comments, no locking, no
pull request creation, review or merge, no starring, no releases. No pull request comments or review
threads, no side-by-side patches and no checkout of a pull request's branch. No GitLab or Bitbucket. No OAuth device flow, no
GitHub Enterprise host, no avatar images, no SQLite cache, no background polling, and no code
browsing — the Code tab the roadmap suggests would duplicate the explorer for a working copy the
user already has on disk.

## Project dashboard

Milestone 11 is a view over services that already existed, plus three GitHub reads in
`github/overview.rs`. It fills the editor area rather than a sidebar panel: an activity-bar button
brings it in front of open files, and with a folder open and no file open it takes the place of the
Welcome screen, which is now shown only when no folder is open. The editor is hidden rather than
unmounted, as for a diff, so no tab loses its undo history. One thing occupies the editor area at a
time: showing the dashboard closes a local diff or pull request patch, and activating a tab or
opening a diff or patch puts that in front of it. The Recent list moved into a shared component so
the dashboard can show it too; otherwise it would be unreachable once a folder is open.

### What it reads

Most cards read nothing of their own. Repository, stack, architecture and commands come from the
project store; changes, upstream, branches and recent commits from the Git store, refreshed through
its own action; repository metadata and activity from the GitHub store, also refreshed through its
own action. The dashboard store holds only what nothing else read:

- **Counts.** GitHub reports open issues and pull requests as one number. `counts` reads the
  repository (normally a `304`) and then `pulls?state=open&per_page=1`, taking the number of open pull
  requests from the `rel="last"` page, or from the page itself when there is no second one. Open
  issues are the combined count minus that, never below zero, because GitHub updates the two
  separately. Issues turned off report no issue count.
- **Milestones.** The first thirty open milestones, soonest due first, with GitHub's own open and
  closed counts, which include pull requests assigned to a milestone. The card says so, and says
  when there are more than thirty.
- **Build.** The check runs and statuses of the commit checked out locally, through the Milestone 10
  checks reader. `github_head_checks` reads HEAD from the repository under the Git lock, releases it
  and then asks GitHub, so the webview never names a commit. A branch with no commits sends nothing.
  A commit GitHub does not have is reported as not pushed yet rather than as a failure.

Each of the three can be refused or fail alone, as activity and issues can in the panel; only a
rejected token stops the reads, and then the account is read again so the GitHub store signs out.
Answers for a replaced folder are discarded by the same numbered-request rule the other stores use.

### When it reads

Only while it is on screen: when it appears, when the window regains focus while it is visible, and
on its Refresh control. Local Git is read when the folder is a repository, and GitHub only when an
account is connected and the remote is on github.com. A signed-out dashboard still reads the account
once, as the GitHub panel does, because that is what says whether there is anyone to ask as.

Commands are displayed, not run: running them belongs to Milestone 13 and must go through
`ProcessService`. The Project progress card is described in its own section below.

## Project progress

```text
Project progress card / Edit areas dialog
  → progress store (plan, revision)      → typed progress adapter → read_progress / write_progress
  → dashboard store (issues per mapping) → typed GitHub adapter   → github_area_issues
  → Rust ProgressService, GitHubService
```

Milestone 12 divides a project into areas, each with explicit tasks and optionally a GitHub label
and a GitHub milestone. Commits are never counted: the roadmap rules them out, and nothing in the
progress code reads Git history.

### The plan on disk

`ProgressService` is stateless, like `ProjectService`, and keeps the plan in `.tbce/progress.json`
beside the manifest: `schemaVersion` 1 and a list of areas, each with an identifier, a name, an
optional label, an optional milestone number and its tasks, each with an identifier, a title and
whether it is done. It is a file of its own because a settings save rebuilds `project.json` from the
fields it knows, and because a manifest at schema version 2 would read as invalid in every earlier
build. The file sits in the project, so it travels through Git with the code it describes; it holds
no secret.

A read reports no plan, a plan with its revision, or why the file cannot be used. The limits are
checked on every read as well as every write, so a hand-edited file breaking one is reported rather
than shown half-valid. A write carries the revision the interface read, the SHA-256 of the file's
bytes, or null when there was no file; a different revision on disk is refused with `CONFLICT`, and
an unusable file has no revision to name, so TBCE never writes over one. The new file is written
beside the old one, synced and moved over it, the pattern architecture definitions already use. The
check and the move are not one atomic step, which is the existing local-process race limitation
rather than a new one. Writing requires `.tbce/project.json`, and both paths go through
`metadata_path`, so links and junctions are refused as they are for the manifest.

### Issues in an area

`github_area_issues` receives a label and a milestone number from the plan the webview holds. The
label is checked (at most 50 characters, no control characters, no comma, which GitHub would read
as two labels) and percent-encoded; the milestone must be a positive number; the repository still
comes from the Git remote. Each is read on its own, because GitHub combines filters with "and" and
an area wants either: `issues?state=all&labels=…` and `issues?state=all&milestone=N`, a hundred a
page and at most five pages each, with pull requests dropped and each issue kept once. A page of a
hundred issues can carry a hundred bodies, so the page cap is sized for that; bodies are read and
not kept. Neither GitHub's milestone counts nor a `rel="last"` count is used, because both include
pull requests.

The dashboard store reads each distinct mapping once, one at a time, however many areas share it.
Each read can be refused or fail alone, a rejected token stops the rest and signs the GitHub store
out, and a newer read, or a replaced folder, discards an older one. The card asks for a read when
the set of mappings changes, so ticking a task asks GitHub nothing; Refresh and window focus read
the plan again and then its issues.

### The figures

An area's figure is its done tasks plus its closed issues over its tasks plus its issues. An issue
closed as not planned counts in neither and is reported separately. An area with nothing to measure
has no percentage. The project's figure sums the areas' tasks and counts each issue once, even when
two areas find it. An area whose issues could not be read — signed out, no GitHub remote, a refused
or failed read — counts its tasks alone and says why; the project figure then says so too.

### What is deliberately absent

Nested areas, weights, due dates, assignees on tasks, history of progress over time, and issues
linked by number. More than five hundred issues and pull requests per label or milestone are not
read. A task is not a GitHub issue and is never sent to GitHub.

## Editing and failure behavior

- Every open file has a stable tab identifier. Renaming a file or ancestor remaps paths without losing its buffer or undo stack.
- A tab is dirty when its buffer differs from its last saved contents. Saves are explicit. Failed saves retain the buffer; cancellation leaves tabs open.
- Workspace replacement and close operations gather Save / Discard / Cancel decisions. Discard does not erase a buffer until the operation succeeds. Cancelling a folder picker or Recycle Bin confirmation therefore preserves edits.
- Reads supply SHA-256 revision tokens. Writes compare the disk revision, write and sync a same-directory temporary file, recheck the target, then replace it. The response describes the saved snapshot. An explicit overwrite reads a fresh revision and still checks it on the subsequent write.
- Clean files reload on application focus or Refresh. Dirty files retain their edits and show a conflict banner. Missing files retain their buffers and display an explanation.
- LF and CRLF files keep their line-ending convention and optional UTF-8 BOM. Mixed line endings and legacy CR-only files are rejected because Monaco normalizes them. Binary, invalid UTF-8, UTF-16, and files larger than 10 MiB are rejected.

## Security boundary

Only the local main window receives the explicitly enumerated application commands and event/close permissions. No shell plugin and no generic filesystem plugin permission is exposed. Monaco workers, fonts, and application assets are bundled locally, and the content security policy still allows no remote origin at all: `connect-src` is IPC-only and `img-src` is `'self' data:`, so the webview cannot reach the network even now that the application can.

Two of these sentences changed in Milestone 8 and the change is worth stating plainly. TBCE now makes network requests and now stores a credential. Both are confined to Rust: requests are built by `GitHubService` from a workspace identifier, a page number and values it checks first, such as an issue number or a label, so the webview cannot name a host, a path, a header or a URL; and the token is kept in the Windows Credential Manager, written only after GitHub accepts it, read per operation, never returned by any command, and scrubbed out of every message. Nothing writes a secret into the repository or into application data, because `.tbce/project.json` and `.tbce/progress.json` live inside the user's own repository and application data is unencrypted JSON.

Reopening a recent project is the one command that accepts an absolute path from the webview instead of a native picker. The path can only come from a folder this application already opened, and opening it still canonicalizes and checks the path exactly as the picker path does. Editor operations and snapshot source reads stay confined to the open workspace. Stack operations resolve opaque IDs beneath a backend-owned application-data directory. New-project writes use a native-picked parent; the webview cannot supply a destination path.

Shell execution is privileged. The webview cannot name a program, arguments, or directory: the terminal commands accept a workspace identifier and start the operating system's default shell in that workspace root. Whatever the user then types runs with the application's own privileges, exactly as it would in any terminal, so the shell is not a sandbox and must not be treated as one.

The backend rejects absolute paths, traversal components, Windows alternate data streams, invalid names, reserved device names, symlinks, and junctions. Existing targets and destination parents are checked against the canonical root. Renaming or deleting the root is forbidden. Creation and rename reject collisions; deletion uses the Recycle Bin and requires native confirmation.

These checks protect ordinary local editing. They do not provide an OS-level sandbox against another local process racing to replace directories between validation and filesystem operations. Strong handle-relative operations and additional isolation must be evaluated before introducing untrusted automation. Network shares and unusual filesystems are not certified for this release.

## Future services

SQLite should arrive with an actual persistence requirement; the GitHub conditional-request cache is deliberately in memory rather than a first reason to add one. `GitService` and `GitHubService` now both exist as independent services. UI components must continue to call service APIs. ArchitectureService is implemented independently of the editor and project metadata service.
