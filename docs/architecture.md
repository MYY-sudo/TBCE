# Architecture

TBCE 0.1 implements the desktop foundation and local editor. No terminal, shell execution, repository integration, database, or project-template behavior is exposed yet.

## Boundaries

```text
React components
  → workspace actions / editor state
  → typed FileSystemService adapter
  → Tauri commands
  → Rust FileSystemService
  → operating system
```

The Rust service owns the selected root and a generation identifier. The frontend receives a display path and identifier, then supplies only relative paths for filesystem operations. Replacing the workspace invalidates the previous identifier. Native pickers choose folders and files; opening an arbitrary absolute path is not exposed to the webview.

Commands return serializable values or `{ code, message }` errors. The service adapter is the only filesystem IPC caller. Window lifecycle integration lives in a separate service. The workspace store serializes user operations and owns tabs, dirty baselines, directory cache, and prompts. React renders those states; Monaco owns editor models, undo stacks, and per-tab view state.

## Native command contract

| Command            | Arguments                                           | Result                                  |
| ------------------ | --------------------------------------------------- | --------------------------------------- |
| `choose_workspace` | None; native folder picker                          | Workspace or null                       |
| `choose_file`      | `workspaceId`; native file picker                   | Relative path or null                   |
| `list_directory`   | `workspaceId`, `path`                               | Entries with name, path, kind           |
| `read_file`        | `workspaceId`, `path`                               | UTF-8 content, revision, BOM flag, path |
| `write_file`       | `workspaceId`, `path`, `content`, `revision`, `bom` | Saved document                          |
| `create_entry`     | `workspaceId`, `path`, `directory`                  | Void                                    |
| `rename_entry`     | `workspaceId`, `from`, `to`                         | Void                                    |
| `trash_entry`      | `workspaceId`, `path`; native confirmation          | Whether deletion was confirmed          |

## Editing and failure behavior

- Every open file has a stable tab identifier. Renaming a file or ancestor remaps paths without losing its buffer or undo stack.
- A tab is dirty when its buffer differs from its last saved contents. Saves are explicit. Failed saves retain the buffer; cancellation leaves tabs open.
- Workspace replacement and close operations gather Save / Discard / Cancel decisions. Discard does not erase a buffer until the operation succeeds. Cancelling a folder picker or Recycle Bin confirmation therefore preserves edits.
- Reads supply SHA-256 revision tokens. Writes compare the disk revision, write and sync a same-directory temporary file, recheck the target, then replace it. The response describes the saved snapshot. An explicit overwrite reads a fresh revision and still checks it on the subsequent write.
- Clean files reload on application focus or Refresh. Dirty files retain their edits and show a conflict banner. Missing files retain their buffers and display an explanation.
- LF and CRLF files keep their line-ending convention and optional UTF-8 BOM. Mixed line endings and legacy CR-only files are rejected because Monaco normalizes them. Binary, invalid UTF-8, UTF-16, and files larger than 10 MiB are rejected.

## Security boundary

Only the local main window receives the explicitly enumerated application commands and event/close permissions. No shell, generic filesystem plugin permission, remote origin, or credential storage is exposed. Monaco workers, fonts, and application assets are bundled locally.

The backend rejects absolute paths, traversal components, Windows alternate data streams, invalid names, reserved device names, symlinks, and junctions. Existing targets and destination parents are checked against the canonical root. Renaming or deleting the root is forbidden. Creation and rename reject collisions; deletion uses the Recycle Bin and requires native confirmation.

These checks protect ordinary local editing. They do not provide an OS-level sandbox against another local process racing to replace directories between validation and filesystem operations. Strong handle-relative operations and additional isolation must be evaluated before introducing untrusted automation. Network shares and unusual filesystems are not certified for this release.

## Future services

Add ProjectService with versioned `.tbce/project.json` in Milestone 3. Add ProcessService and TerminalService when implementing the terminal. SQLite should arrive with an actual persistence requirement. GitService, GitHubService, TemplateService, and ArchitectureService remain independent future services; UI components must continue to call service APIs.
