# Remaining work

## Within the editor

- Test macOS and Linux, including platform-specific filesystem semantics and shortcuts.
- Add workspace file watching, search/quick-open, and large-directory virtualization.
- Add session restoration and crash recovery only when explicitly scheduled. Unsaved buffers currently live in memory.
- Add deliberate support for mixed line endings, non-UTF-8 encodings, larger files, case-only rename, symlinks, and junctions.
- Evaluate handle-relative filesystem operations and adversarial race testing before untrusted automation.
- Add cross-file language-server integration. Monaco provides built-in language support, not the full VS Code extension ecosystem.
- Establish signed releases, release ownership, licensing, and installer upgrade/uninstall verification before public distribution.

## Product roadmap

See the [full product vision and V1/V2 roadmap](roadmap.md) for every milestone, completion criteria, and security requirement.

Next: Milestone 2, integrated terminal backed by reusable Rust ProcessService and TerminalService. Then implement the project system, stacks, architectures, local Git and Git UI, GitHub context, issues, pull requests, dashboard, progress, project commands, settings, and stabilization in the supplied milestone order.

The current implementation does not claim V1 completion. Advanced automation remains outside the foundation/editor scope.
