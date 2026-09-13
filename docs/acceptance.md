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

Record the checks actually performed in `verification.md`; distinguish automated service tests from installed-app UI checks.
