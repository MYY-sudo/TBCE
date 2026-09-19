# Milestone 12 — Project progress delivery checklist

Approved scope: progress from explicit tasks and from GitHub issues, never from commits. A project
is divided into areas; each area has its own tasks and may name a GitHub label and a GitHub
milestone whose issues belong to it. The plan is kept in `.tbce/progress.json`, and the dashboard
card that Milestone 11 left as a placeholder shows and edits it. Nothing in this milestone writes to
GitHub or runs a project command. GitHub models stay in the GitHub module and are not shared with
generic TBCE models.

## Completion rules

Every checked item needs an expected result, observed result, reproducible command or scenario,
evidence location, and tested source/build identity. Failed or blocked items remain unchecked.
Diagnose mismatches, fix their cause, rerun the scenario and affected regression checks, and record
the new evidence. Never change a requirement merely to match a passing test.

Automated tests, package generation, and installed-app acceptance are separate claims and are
never merged into one statement.

## 1. Scope decisions

The user chose the first four on September 19, 2026, before implementation. The rest were stated
in the plan the user approved the same day.

- **Storage.** A file of its own, `.tbce/progress.json`, written atomically and shared through Git
  with the project. `project.json` stays at schema version 1: older builds refuse any other version
  as invalid, and a settings save rewrites the manifest from the fields it knows, which would erase
  a progress block kept inside it. The user chose this over a schema 2 manifest and over personal
  application data.
- **Mapping.** An area may name one GitHub label, one GitHub milestone, or both. Its issues are those
  carrying the label and those in the milestone, each counted once. The user chose this over a label
  alone and over linking issue numbers by hand.
- **Counting.** Exact: the mapped issues are read in every state, a hundred a page and at most five
  pages per label or milestone, and pull requests are left out locally. GitHub's issue list and its
  milestone counts both include pull requests, so neither is used as a count. About one request per
  mapping for a typical area; an area that reaches the limit says so. The user chose this over the
  `rel="last"` count, which would count pull requests as issues, and over the search API.
- **Editing.** On the dashboard card: tasks are ticked in place and saved at once, and an Edit areas
  dialog changes the structure. The user chose this over a separate activity-bar panel.
- **A project first.** Progress needs `.tbce/project.json`; a plain folder is offered conversion.
- **Two levels.** Areas contain tasks, as in the roadmap's tree. Nested areas are not supported.
- **Not planned.** An issue closed as not planned is left out of both the done count and the total,
  and the card says how many were left out.
- **Nothing to measure.** An area with no tasks and no counted issues shows no percentage rather
  than 0%, as milestones with nothing assigned already do.
- **No GitHub.** Signed out, without a GitHub remote, or when an area's read fails, the area counts
  its tasks alone and says why its issues are missing.
- **Commands.** Still displayed and not run. Running them is Milestone 13, through `ProcessService`.
- **Desktop acceptance.** The waiver used for Milestones 4 to 11 continues; see below.

## 2. Desktop acceptance gate

The [Milestone 6 gate](milestone-6.md) items P10, P11 and P12 are **still open**, and no desktop
checkbox is ticked anywhere on the strength of this milestone.

The reason is the one [Milestone 8](milestone-8.md#2-desktop-acceptance-gate) restated: desktop
automation works, check 1 has a recorded pass, and the other checks are unexecuted rather than
blocked by a missing tool. This milestone adds eight more, 99-106, to the
[manual run-sheet](acceptance-runsheet-m6.md), for 77 unexecuted in all. They write only to the
disposable clone's `.tbce/progress.json` and read from GitHub; labels and milestones are prepared on
github.com by hand.

## 3. Service and native interface

- [x] D01: `ProgressService` in `src-tauri/src/progress/mod.rs`, with `read_progress` and
      `write_progress` registered in the invoke handler, the build-time list and the window
      capability, and the typed adapter `src/services/progress.ts` beside them. The path goes
      through `metadata_path`, so containment, link and junction checks are the ones the manifest
      already uses. [Automated checks](evidence/m12-progress/automated-checks.log)
- [x] D02: A write names the revision it replaces, the SHA-256 of the file's bytes, or nothing when
      there was no file. A file changed on disk since it was read is refused with `CONFLICT` and never
      overwritten; a file that cannot be used has no revision, so it cannot be written over either.
      The new file is written beside the old one and moved over it. A folder with no manifest is
      refused. [Automated checks](evidence/m12-progress/automated-checks.log)
- [x] D03: Every limit is checked in Rust before anything is written and again when a file is read:
      at most 50 areas and 200 tasks each, area names unique regardless of case, names and titles
      trimmed and without control characters, labels of at most 50 characters without commas,
      milestone numbers from 1, and identifiers of letters, digits and hyphens used once.
      [Automated checks](evidence/m12-progress/automated-checks.log)
- [x] D04: `github_area_issues`, a child module `github/progress.rs` on the Milestone 8 runner. The
      webview sends a label and a milestone number, never a path; the label is checked and
      percent-encoded, the repository still comes from the Git remote, and a mapping with neither
      sends nothing. Label and milestone are read apart because GitHub combines filters with "and".
      [Automated checks](evidence/m12-progress/automated-checks.log)
- [x] D05: Nothing written to GitHub. The area read sends only `GET` requests with no body, and the
      module is added to the test that keeps printing macros out of GitHub code, along with
      `overview.rs` and `pulls.rs`, which that test did not cover before.
      [Automated checks](evidence/m12-progress/automated-checks.log)

## 4. Roadmap capabilities

- [x] D06: Explicit tasks and completed work items: tasks ticked on the card are saved at once and
      count as done. [Automated checks](evidence/m12-progress/automated-checks.log)
- [x] D07: Issues mapped into areas by label and by milestone, closed issues counting as done, pull
      requests left out, closed as not planned left out and counted separately, an issue found both
      ways counted once. [Automated checks](evidence/m12-progress/automated-checks.log)
- [x] D08: Milestones: an area may take a GitHub milestone as its source of issues. Its issues are
      counted one by one rather than from GitHub's milestone counts, which include pull requests.
      [Automated checks](evidence/m12-progress/automated-checks.log)
- [x] D09: A percentage per area and for the project, as in the roadmap's example, with the project
      counting an issue shared by two areas once. No percentage is computed from commits anywhere.
      [Automated checks](evidence/m12-progress/automated-checks.log)

## 5. Interface

- [x] D10: The Project progress card replaces the placeholder and spans the dashboard. It shows the
      overall figure and bar, then one bar per area with "3 of 5 tasks · 7 of 10 issues" and what was
      left out. An area opens onto its tasks, as checkboxes, and its first thirty issues, as read-only
      rows. Names and titles are rendered as text. [Automated checks](evidence/m12-progress/automated-checks.log)
- [x] D11: The Edit areas dialog adds, renames, reorders and removes areas and tasks, sets a label
      with GitHub's labels offered, and a milestone from GitHub's open milestones or by number when
      signed out. It says what the backend would refuse before anything is sent and disables Save
      until it is fixed. A save refused because the file changed restarts the edit from the file.
      [Automated checks](evidence/m12-progress/automated-checks.log)
- [x] D12: Plain folder, unreadable manifest, unreadable plan, empty plan, signed out and no remote
      each have their own explanation. Mapped issues are read when the dashboard is on screen and
      the set of mappings changes, on window focus and on Refresh; ticking a task reads nothing from
      GitHub. Each mapping is read once however many areas share it, each area's failure stays with
      it, a rejected token signs out, and answers for a replaced folder are discarded.
      [Automated checks](evidence/m12-progress/automated-checks.log)

## 6. Proof

- [x] V01: Twenty new Rust tests. Ten for the progress file: a plan read back with its revision, the
      manifest left byte for byte, a plain folder refused, conflicts for a stale revision and for a
      writer that never read, unusable files reported and never replaced, trimming, fourteen limit
      cases, no temporary file left behind, and junctions refused for reads and writes. Ten for area
      issues on the shared mock GitHub API: every state read and pull requests dropped across pages,
      label and milestone read apart and merged, not planned marked, the five-page limit, nothing sent
      without a mapping or for a crafted one, a label that cannot add a parameter, issues turned off, a
      revoked token, and nothing written. [Automated checks](evidence/m12-progress/automated-checks.log)
- [x] V02: Twenty-eight new frontend tests: fourteen for the figures, the dialog's checks and the
      progress store, eight for the card and dialog, and six for the dashboard store's area reads.
      Two dashboard tests changed: the placeholder assertion became assertions on real figures, and
      the signed-out test now also checks the tasks-only explanation.
      [Automated checks](evidence/m12-progress/automated-checks.log)
- [x] V03: Formatting, ESLint, TypeScript, the frontend suite, Rust formatting, Clippy with
      warnings denied and the Rust suite all pass. Frontend tests 250 to 278; Rust tests 158 to 178.
      [Automated checks](evidence/m12-progress/automated-checks.log)
- [x] V04: The production bundle still excludes the development-only harness, still names no
      GitHub host and contains no write method, and no component sets inner HTML. The progress card
      ships in the dashboard's lazy chunk. [Bundle inspection](evidence/m12-progress/production-bundle-exclusion.txt)
- [x] V05: Installer generated and hashed. [Verification record](verification.md#milestone-12--project-progress-september-19-2026)
- [x] V06: README, roadmap, architecture, acceptance, run-sheet, verification and remaining-work
      updated, with the open P10-P12 gate restated rather than quietly dropped.

D01-D12 and V01-V06 are delivered with their evidence linked beside each item. 278 frontend tests
and 178 Rust tests prove the services, the stores, the card and the dialog, and prove nothing about
installed-app behaviour or about the live GitHub API.

Installed-app checks for this milestone are numbered 99-106 in the
[acceptance checklist](acceptance.md) and belong to the
[manual run-sheet](acceptance-runsheet-m6.md), not to this list. Milestone 6 gate items P10, P11
and P12 stay unchecked.
