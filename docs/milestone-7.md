# Milestone 7 — Source control panel delivery checklist

Approved scope: the visual interface over the Milestone 6 backend. No new Rust
command and no change to `GitService`. GitHub sign-in stays in Milestone 8. Pull
remains fast-forward only; merge, rebase, force push, hard reset, stash, tags and
partial staging stay deferred.

## Completion rules

Every checked item needs an expected result, observed result, reproducible command
or scenario, evidence location, and tested source/build identity. Failed or blocked
items remain unchecked. Diagnose mismatches, fix their cause, rerun the scenario
and affected regression checks, and record the new evidence. Never change a
requirement merely to match a passing test.

Automated tests, package generation, and installed-app acceptance are separate
claims and are never merged into one statement.

## 1. Scope decisions

Both were confirmed by the user on September 16, 2026, before implementation.

- **Diff rendering.** The backend answers with a unified patch, not two file
  versions, so the panel shows that patch read-only in Monaco with `diff`
  highlighting rather than a Monaco diff editor. The roadmap's "where practical"
  wording covers this, and it keeps Git's own rename, binary and truncation
  reporting intact without adding a nineteenth command.
- **Panel breadth.** Full breadth rather than the roadmap's minimal example:
  remote operations, paged history and the initialize/clone entry points are
  included, so all eighteen Git commands are reachable from the interface and the
  acceptance checks no longer need the development harness.

## 2. Desktop acceptance gate

The [Milestone 6 gate](milestone-6.md) items P10, P11 and P12 are **still open**.
Desktop automation remains unavailable — the missing Computer Use native pipe
recorded on September 15 was not resolved — and the user directed that Milestone 7
proceed under the same waiver used for Milestones 4, 5 and 6: implement, prove with
automated tests, extend the manual [run-sheet](acceptance-runsheet-m6.md), and state
in every document that the result is **not desktop-accepted**. No desktop checkbox
is ticked anywhere on the strength of this milestone.

## 3. Interface and state

- [x] U01: Zustand store over the existing typed adapter holds detection, status,
      branches, history, per-file diff summaries, the open preview and the commit
      message draft. UI code calls the store; no component invokes a Tauri command. [Automated checks](evidence/m7-git-ui/automated-checks.log)
- [x] U02: Every read and mutation is numbered and workspace-checked, so an answer
      for a replaced workspace is discarded. A second operation started while one
      runs is refused rather than queued. [Automated checks](evidence/m7-git-ui/automated-checks.log)
- [x] U03: Detection alone runs no other Git command, so opening a folder still
      never waits on status. The repository is read only once the panel is on screen. [Automated checks](evidence/m7-git-ui/automated-checks.log)
- [x] U04: Refresh happens when the panel appears, when the editor's file revisions
      change, when the window regains focus while the panel is visible, after every
      mutation, and on the explicit Refresh control. Nothing polls. [Automated checks](evidence/m7-git-ui/automated-checks.log)

## 4. Panel behaviour

- [x] U05: The four detection states each produce their own panel: initialize/clone
      offers for a plain folder, an explanation for a repository above the workspace,
      an explanation for an unavailable Git, and the full panel for a found repository. [Automated checks](evidence/m7-git-ui/automated-checks.log)
- [x] U06: Branch, upstream and ahead/behind are shown, with ahead/behind blank
      rather than zero when there is no upstream. Fetch, pull and push are available;
      pull is disabled without an upstream and push publishes an untracked branch. [Automated checks](evidence/m7-git-ui/automated-checks.log)
- [x] U07: Index and working-tree changes are listed separately with Git's own
      status letters, untracked files included, and per-file added/removed counts from
      the diff summaries. Staging and unstaging work per path and for everything. [Automated checks](evidence/m7-git-ui/automated-checks.log)
- [x] U08: Committing requires a nonempty message and staged content, and is refused
      while the repository is conflicted. A refused commit keeps the typed message. [Automated checks](evidence/m7-git-ui/automated-checks.log)
- [x] U09: Branches can be created without switching, checked out, and deleted
      through the backend's native confirmation; a cancelled confirmation changes
      nothing and the current branch cannot be deleted from the panel. [Automated checks](evidence/m7-git-ui/automated-checks.log)
- [x] U10: History is paged rather than loaded whole, and an unborn branch reports
      an empty history rather than an error. [Automated checks](evidence/m7-git-ui/automated-checks.log)
- [x] U11: Selecting a change opens its patch read-only in the editor area, with
      rename, binary and truncation reported. The editor is hidden rather than
      unmounted, so open tabs keep their Monaco models and undo history, and closing
      the preview returns to exactly what was being edited. [Automated checks](evidence/m7-git-ui/automated-checks.log)

## 5. Proof

- [x] V01: Frontend suite covers the store and the panel, including stale-workspace
      rejection, operation serialization, staging without rereading branches or
      history, refused commits, paging, upstream-aware push, cancelled branch
      deletion and every detection state. [Automated checks](evidence/m7-git-ui/automated-checks.log)
- [x] V02: Formatting, ESLint, TypeScript, the frontend suite, Rust formatting,
      Clippy with warnings denied and the Rust suite all pass. The Rust count is
      unchanged, because no Rust source was touched. [Automated checks](evidence/m7-git-ui/automated-checks.log)
- [x] V03: Production build excludes the development-only harness exactly as before. [Bundle exclusion](evidence/m7-git-ui/production-bundle-exclusion.txt)
- [x] V04: Installer generated and hashed. [Verification record](verification.md#milestone-7--source-control-panel-september-16-2026)
- [x] V05: README, roadmap, architecture, acceptance, run-sheet, verification and
      remaining-work updated, with the open P10-P12 gate restated rather than
      quietly dropped.

U01-U11 and V01-V05 are delivered with their evidence linked beside each item.
111 frontend tests and 81 Rust tests prove the store, the panel and the shell wiring,
and prove nothing about installed-app behaviour.

Installed-app checks for this milestone are numbered 57-66 in the
[acceptance checklist](acceptance.md) and belong to the
[manual run-sheet](acceptance-runsheet-m6.md), not to this list. Milestone 6 gate
items P10, P11 and P12 stay unchecked.
