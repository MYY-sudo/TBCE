# Windows acceptance checklist

Use a disposable local folder with spaces and Unicode characters in its name. Keep testing separate from a valuable codebase.

1. Install the generated NSIS package and launch TBCE without a Vite server running.
2. Open the folder using the native picker. Cancel a second picker and verify the original workspace stays open.
3. Expand and collapse nested folders. Refresh and verify hidden files and newly created external files appear.
4. Open two UTF-8 files. Switch tabs and confirm cursor position, scroll position, edits, and undo history survive. Open the same file again and verify no duplicate tab appears.
5. Edit and save with Ctrl+S. Inspect the saved bytes outside TBCE, close the tab, and reopen it. Repeat with BOM + CRLF and plain LF files.
6. Edit both files and use Save All. Confirm both dirty indicators clear and both disk files change.
7. Close a dirty tab: Cancel retains it, Save persists then closes it, Discard closes without writing. Repeat for workspace replacement and application exit.
8. Create a file and folder; rename both, including a folder with an open dirty descendant. Verify the buffer and save destination follow the renamed path.
9. Move a disposable item to the Recycle Bin. Verify the confirmation can be cancelled, confirmation removes the item from the tree, affected tabs close, and Windows can restore the item.
10. Edit a file externally. Refresh: clean tabs reload, dirty tabs show a conflict. Save the dirty tab and exercise Cancel, Reload, and explicit Overwrite.
11. Remove a file externally and confirm its buffer survives with an explanatory banner. Try a read-only save and confirm edits survive the error.
12. Attempt to open a binary file, UTF-16 file, mixed-line-ending file, and file larger than 10 MiB. Verify actionable errors. Try invalid names and collisions; existing contents must survive.
13. Check resize, keyboard focus, dialog Escape, explorer visibility, and status information at the minimum window size.
14. Verify bundled Monaco language workers load without CDN requests. Inspect TypeScript/JSON language features in the packaged application.
15. Open the terminal with the activity-bar button and with Ctrl+`. Confirm the shell prompt appears and that the button is disabled before a folder is open.
16. Run `cd` and confirm the shell started in the workspace folder. Run a command that prints Turkish characters and confirm they are not mangled.
17. Run an interactive command, cancel it with Ctrl+C, and confirm the shell survives. Confirm colored output renders.
18. Drag the terminal divider and resize the window. Confirm long output rewraps to the new width rather than staying at the old one.
19. Hide the terminal, run a command that keeps printing, reopen it, and confirm the output continued and scrollback survived.
20. Type `exit`. Confirm the exit code is reported and that Restart brings back a working shell in the same folder.
21. Stop the terminal with Close. Confirm the panel closes and no shell remains in Task Manager. Repeat by opening another folder while a shell runs.
22. Close the application with a terminal running. Confirm no orphaned shell process remains.
23. Use New project, name it, and choose a parent folder. Confirm the folder and `.tbce/project.json` are created and the project opens. Repeat with an existing name and confirm the error.
24. Convert an already-open plain folder into a project. Edit the name, stack, architecture, branch, and commands afterwards, and confirm `project.json` on disk matches.
25. Restart TBCE. Confirm the project appears under Recent, reopens with its manifest detected, and that a plain folder is listed without the project tag.
26. Rename or delete a recent project's folder outside TBCE, then open it from Recent. Confirm an explanatory error appears and the entry disappears.
27. Corrupt `project.json` with invalid JSON and then with a higher `schemaVersion`. Reopen the folder each time and confirm TBCE explains the problem instead of failing, and that project settings can repair it.
28. Open Stacks with an empty application-data library. Confirm its empty state, create a plain disposable folder with source files, a binary asset, an empty directory, `.env`, `.env.example`, dependency/build folders, `.git`, and `.tbce`. Save it as a stack and verify inclusion defaults and file count/size. Git and TBCE metadata must not be selectable; explicitly include an excluded file and deselect a source file.
29. Capture with unsaved editor buffers. Verify Save all and continue, Use files on disk, and Cancel. A failed/conflicted save must block capture; using disk must retain dirty buffers. Change a selected file externally after inspection and verify save fails with an explanation until Refresh file list is used.
30. Restart TBCE, move or delete the disposable source folder externally, and create a project from its saved stack in a parent with spaces/Turkish characters. Verify binary bytes, line endings, empty directories, fresh project metadata, unchanged package names, and Recent detection. No installation or command execution should occur.
31. Edit stack details and defaults, then replace its snapshot from another disposable project. Cancel and confirm the native replacement prompt. Verify failure/cancellation leaves the old snapshot usable, success keeps the same stack ID, and previously created projects remain unchanged.
32. Cancel and confirm Delete stack. Verify cancellation preserves the entry, confirmation removes it from the library and makes it recoverable through the Recycle Bin, and previously created projects still open with their original metadata.
33. Try blank-project creation, an existing destination name, a read-only parent, and picker cancellation while an old workspace has dirty files and a running terminal. Failure/cancellation must preserve buffers and terminal; successful creation must switch workspaces and retire the previous terminal. Verify repeated submission cannot create duplicate projects.
34. Test source links/junctions and a damaged saved-stack definition in a disposable library. Links must be unavailable; corrupt or future-schema entries must show an actionable warning without hiding healthy stacks.
35. Check keyboard navigation, Escape and busy-state behavior, stack selection/default editing, long names, large file trees, and dialog scrolling at 1280 × 820 and the minimum 800 × 540 window size. Ensure every dialog action remains reachable.

36. Open Architectures with an empty disposable library. Create a named architecture with description, boundaries, nested/empty folders, and UTF-8 starter files containing Turkish characters. Check the structure tree, add/remove file controls, validation errors, and unsaved-change cancellation.
37. Restart TBCE. Confirm architecture persistence, edit its name and contents, and confirm its ID stays stable. A malformed or future-schema definition must show a warning while healthy entries remain usable.
38. Create a blank project with the saved architecture. Verify empty directories, literal UTF-8 contents, a fresh schema-version-1 manifest with the architecture ID, Recent detection, and no command execution.
39. Create with a stack and architecture sharing folders. Verify both sets of files survive. Test duplicate file paths, file/directory conflicts, and different casing; preview must show conflicts and disable creation. Choose a different architecture or none and confirm recovery.
40. Select architectures in project settings and stack defaults. Confirm settings only change metadata; a known stack default is selected during creation. Unavailable legacy/deleted values must remain visible as metadata, with an explanation that they generate no structure.
41. Cancel and confirm architecture deletion. Check Recycle Bin recovery and that existing projects stay unchanged. Exercise picker cancellation, failed creation, and repeated submission with an old dirty workspace and terminal; cancellation/failure must preserve the old workspace and successful creation must retire its terminal.
42. Check keyboard navigation, Escape, busy controls, long paths/content, and dialog scrolling at 1280 × 820 and 800 × 540. Ensure all architecture editor and new-project actions remain reachable.

## Git backend — installed-app checks

These exercise the Milestone 6 backend through the packaged application. Use the
development harness for commands that have no interface yet; it is present in
`npm run tauri dev` only. Work in disposable repositories with spaces and Turkish
characters in their paths, and confirm every result with the `git` command line
outside TBCE.

43. Open a plain folder that is not a repository and confirm no branch label appears. Initialize a repository, reopen the folder, and confirm the label shows the new branch and that `git status` outside TBCE agrees. Repeat in a folder that already has a repository and confirm initializing is refused.
44. Open a subdirectory of a repository. Confirm TBCE reports that the repository is above it and refuses status, staging and commits until the repository root is opened.
45. Rename `git.exe` out of the way, or edit `PATH` so Git cannot be found, and reopen a repository. Confirm the folder still opens, the editor still works, and TBCE explains that Git is unavailable rather than failing to open.
46. With staged and unstaged edits to the same file, confirm both are reported separately. Add a rename, a deletion, an untracked file, and a file with Turkish characters in its name; confirm every path is shown correctly and matches `git status --porcelain=v2`.
47. Create a merge conflict outside TBCE. Confirm the conflicted file is reported, and that committing is refused until it is resolved.
48. Create a branch and confirm the current branch does not change. Switch branches with a clean tree, then make an edit and confirm switching is refused with the edit intact.
49. Delete a merged branch and confirm the native prompt, that cancelling preserves it, and that confirming removes it. Confirm deletion is refused for the current branch, the default branch, an unmerged branch, and a branch checked out in another worktree.
50. Stage individual paths and everything, including a deletion. Unstage and confirm with a file comparison that the working file is byte-identical. Repeat before the first commit in a new repository.
51. Commit with an empty message, with nothing staged, and with `user.email` unset; confirm each is refused with an explanation and that no commit is created. Set an identity, commit, and confirm `git show` outside TBCE matches what was staged rather than later edits.
52. Read history in a repository with more commits than one page, and confirm paging and that an unborn branch reports an empty history rather than an error. View diffs for a text file, a binary file, and a renamed file.
53. Using a local bare repository as a remote and two clones, fetch, pull and push. Confirm ahead and behind counts change as expected and are blank when a branch has no upstream. Make the clones diverge, then confirm pull and push are both refused and that the bare repository is unchanged.
54. Clone from a local path into a folder you name, under a natively picked parent. Confirm cancelling the picker creates nothing, that an existing destination name is refused with its contents intact, and that a failed clone leaves no partial folder. Confirm the clone does not switch the open workspace.
55. Attempt to clone `ext::sh -c touch pwn`, a `git://` URL and an `http://` URL. Each must be refused before anything runs, with no folder created.
56. Start a long fetch against an unreachable host and confirm TBCE reports a failure within the timeout instead of hanging, and that no console window appears during any Git operation.

Record the checks actually performed in `verification.md`; distinguish automated service tests from installed-app UI checks.

## Milestone 6 prerequisite evidence

Checks 15-42 and the earlier editor gaps listed in the
[delivery checklist](milestone-6.md) remain the prerequisite gate. Under the
September 16, 2026 scope decision the Git backend was implemented while a
[manual run-sheet](acceptance-runsheet-m6.md) was prepared for these checks, so they
are still outstanding rather than superseded.
For each scenario, record the build identity, expected outcome, observed outcome,
evidence path (screenshots and independent disk/process observations as relevant),
and pass/fail/blocked status. A test-suite pass or an installer hash does not prove
an installed-app scenario. Desktop discovery on September 15 failed before any
scenario could run, including after a fresh-session retry; these checks remain open.
