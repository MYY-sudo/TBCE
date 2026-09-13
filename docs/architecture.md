# Architecture

TBCE 0.1 implements the desktop foundation, the local editor, the integrated terminal, and the project system. No repository integration, database, or project-template behavior is exposed yet.

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

The Rust service owns the selected root and a generation identifier. The frontend receives a display path and identifier, then supplies only relative paths for filesystem operations. Replacing the workspace invalidates the previous identifier. Native pickers choose folders and files. Reopening a recent project is the single exception, described under the security boundary.

Commands return serializable values or `{ code, message }` errors. The service adapter is the only filesystem IPC caller. Window lifecycle integration lives in a separate service. The workspace store serializes user operations and owns tabs, dirty baselines, directory cache, and prompts. React renders those states; Monaco owns editor models, undo stacks, and per-tab view state.

## Native command contract

| Command                 | Arguments                                           | Result                                  |
| ----------------------- | --------------------------------------------------- | --------------------------------------- |
| `choose_workspace`      | None; native folder picker                          | Workspace or null                       |
| `choose_file`           | `workspaceId`; native file picker                   | Relative path or null                   |
| `list_directory`        | `workspaceId`, `path`                               | Entries with name, path, kind           |
| `read_file`             | `workspaceId`, `path`                               | UTF-8 content, revision, BOM flag, path |
| `write_file`            | `workspaceId`, `path`, `content`, `revision`, `bom` | Saved document                          |
| `create_entry`          | `workspaceId`, `path`, `directory`                  | Void                                    |
| `rename_entry`          | `workspaceId`, `from`, `to`                         | Void                                    |
| `trash_entry`           | `workspaceId`, `path`; native confirmation          | Whether deletion was confirmed          |
| `detect_project`        | `workspaceId`                                       | None, found manifest, or invalid reason |
| `init_project`          | `workspaceId`, `fields`                             | Project                                 |
| `update_project`        | `workspaceId`, `fields`                             | Project                                 |
| `create_project_folder` | `name`; native folder picker for the parent         | Workspace or null                       |
| `open_recent_project`   | `path`                                              | Workspace                               |
| `start_terminal`        | `workspaceId`                                       | Terminal identifier and shell name      |
| `restart_terminal`      | `workspaceId`, `id`                                 | Terminal identifier and shell name      |
| `write_terminal`        | `id`, `data`                                        | Void                                    |
| `resize_terminal`       | `id`, `cols`, `rows`                                | Void                                    |
| `stop_terminal`         | `id`                                                | Void                                    |

Terminal output and exit codes arrive on the `terminal:event` channel as `{ kind: "output", id, data }` or `{ kind: "exit", id, code }`. The frontend subscribes before starting a shell and ignores exit reports from a replaced session.

## Project behavior

`ProjectService` is stateless: commands resolve the open workspace root through `FileSystemService`, then read or write `.tbce/project.json` beneath it. Detection reports one of three outcomes — no manifest, a manifest, or a manifest TBCE could not read — so a corrupt or future-schema file degrades to an explanation instead of an error. Project settings replace the stored fields rather than merging them. Stack and architecture are free-form strings until their own milestones; `commands` is stored and edited but never executed, because running commands belongs to the command milestone and must reuse `ProcessService`. A project reports whether a `.git` entry exists at its root; no Git command is ever invoked.

The frontend keeps recent projects in webview local storage, capped and deduplicated by path. Losing that list costs a convenience, never project data, so no database is introduced for it.

## Terminal behavior

`ProcessService` owns pseudo-terminal processes: it spawns them, streams decoded output, forwards input, resizes, and terminates. `TerminalService` keeps shell sessions on top of it, keyed by identifiers it generates. Project commands and any future automation are expected to reuse `ProcessService` rather than executing shells themselves.

The shell directory comes from the open workspace identifier, so the webview cannot choose where a shell runs. The default shell is `%COMSPEC%` on Windows and `$SHELL` elsewhere; choosing one belongs to the settings milestone.

Output is decoded as UTF-8 across read boundaries, so multi-byte characters split between reads survive. ConPTY asks the terminal for its cursor position and refuses to start the child until it is answered, so the frontend attaches its event listener before requesting a shell; xterm.js produces that answer on its own. ConPTY also keeps the output pipe open while the session lives, so exits are detected by waiting on the process instead of by end of output, after a short window that lets trailing output through. Windows reports a successful termination as an error, so stopping confirms that the process actually ended.

On Windows the session is started in UTF-8 rather than the machine's OEM code page. ConPTY already re-encodes what a program writes through the console API, but a program that writes raw UTF-8 bytes to standard output — Git and most ported command line tools do — is decoded by the console using its code page, which on a default installation cannot represent every character. `cmd.exe` is therefore started with `chcp 65001` and PowerShell with a UTF-8 `[Console]::OutputEncoding`. An unrecognized shell keeps the code page it starts with. The decoder is deliberately left strict: the shell is asked to produce UTF-8 instead of the decoder being made lenient about what it receives.

Closing the window terminates every session. Replacing the workspace stops the running shell because its directory belonged to the previous workspace.

## Editing and failure behavior

- Every open file has a stable tab identifier. Renaming a file or ancestor remaps paths without losing its buffer or undo stack.
- A tab is dirty when its buffer differs from its last saved contents. Saves are explicit. Failed saves retain the buffer; cancellation leaves tabs open.
- Workspace replacement and close operations gather Save / Discard / Cancel decisions. Discard does not erase a buffer until the operation succeeds. Cancelling a folder picker or Recycle Bin confirmation therefore preserves edits.
- Reads supply SHA-256 revision tokens. Writes compare the disk revision, write and sync a same-directory temporary file, recheck the target, then replace it. The response describes the saved snapshot. An explicit overwrite reads a fresh revision and still checks it on the subsequent write.
- Clean files reload on application focus or Refresh. Dirty files retain their edits and show a conflict banner. Missing files retain their buffers and display an explanation.
- LF and CRLF files keep their line-ending convention and optional UTF-8 BOM. Mixed line endings and legacy CR-only files are rejected because Monaco normalizes them. Binary, invalid UTF-8, UTF-16, and files larger than 10 MiB are rejected.

## Security boundary

Only the local main window receives the explicitly enumerated application commands and event/close permissions. No shell plugin, generic filesystem plugin permission, remote origin, or credential storage is exposed. Monaco workers, fonts, and application assets are bundled locally.

Reopening a recent project is the one command that accepts an absolute path from the webview instead of a native picker. The path can only come from a folder this application already opened, and opening it still canonicalizes and checks the path exactly as the picker path does. Every other filesystem operation remains confined to the open workspace.

Shell execution is privileged. The webview cannot name a program, arguments, or directory: the terminal commands accept a workspace identifier and start the operating system's default shell in that workspace root. Whatever the user then types runs with the application's own privileges, exactly as it would in any terminal, so the shell is not a sandbox and must not be treated as one.

The backend rejects absolute paths, traversal components, Windows alternate data streams, invalid names, reserved device names, symlinks, and junctions. Existing targets and destination parents are checked against the canonical root. Renaming or deleting the root is forbidden. Creation and rename reject collisions; deletion uses the Recycle Bin and requires native confirmation.

These checks protect ordinary local editing. They do not provide an OS-level sandbox against another local process racing to replace directories between validation and filesystem operations. Strong handle-relative operations and additional isolation must be evaluated before introducing untrusted automation. Network shares and unusual filesystems are not certified for this release.

## Future services

SQLite should arrive with an actual persistence requirement. GitService, GitHubService, TemplateService, and ArchitectureService remain independent future services; UI components must continue to call service APIs.
