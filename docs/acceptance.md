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

Record the checks actually performed in `verification.md`; distinguish automated service tests from installed-app UI checks.
