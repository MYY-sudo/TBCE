# Milestone 11 — Project overview delivery checklist

Approved scope: a project dashboard that shows the repository summary, Git state, branch state,
recent commits, open issue and pull request counts, the CI state of the checked-out commit, the
project's commands, open milestones, a project progress placeholder and recent activity, in one
view. Nothing in this milestone writes to GitHub or runs a project command. GitHub models stay in
the GitHub module and are not shared with generic TBCE models.

## Completion rules

Every checked item needs an expected result, observed result, reproducible command or scenario,
evidence location, and tested source/build identity. Failed or blocked items remain unchecked.
Diagnose mismatches, fix their cause, rerun the scenario and affected regression checks, and record
the new evidence. Never change a requirement merely to match a passing test.

Automated tests, package generation, and installed-app acceptance are separate claims and are
never merged into one statement.

## 1. Scope decisions

The user chose the first four on September 19, 2026, before implementation. The last two were
stated in the plan the user approved the same day.

- **Placement.** The editor area, not a sidebar panel. An activity-bar button brings the dashboard
  in front of open files, and with a folder open and no file open it takes the place of the Welcome
  screen. The editor is hidden, not unmounted.
- **Counts.** Exact, for one extra request: open pull requests from the `rel="last"` page of a
  one-per-page list, and open issues as GitHub's combined count minus that. The user chose this over
  the search API and over showing only the first page.
- **Build.** The CI state of the local HEAD commit, through the Milestone 10 checks reader. A commit
  GitHub does not have reads as not pushed yet. The user chose this over the default branch's head.
- **Milestones.** Open GitHub milestones with GitHub's open and closed counts, one new read. Project
  progress is a placeholder for Milestone 12. The user chose this over two placeholders.
- **Commands.** Displayed, not run. Running them is Milestone 13, through `ProcessService`.
- **Desktop acceptance.** The waiver used for Milestones 4 to 10 continues; see below.

## 2. Desktop acceptance gate

The [Milestone 6 gate](milestone-6.md) items P10, P11 and P12 are **still open**, and no desktop
checkbox is ticked anywhere on the strength of this milestone.

The reason is the one [Milestone 8](milestone-8.md#2-desktop-acceptance-gate) restated: desktop
automation works, check 1 has a recorded pass, and the other checks are unexecuted rather than
blocked by a missing tool. This milestone adds eight more, 91-98, to the
[manual run-sheet](acceptance-runsheet-m6.md), for 69 unexecuted in all. They only read, and reuse
the repository prepared for 83-90 with an open milestone added.

## 3. Service and native interface

- [x] D01: Three `github_*` commands — `github_counts`, `github_milestones` and
      `github_head_checks` — registered in the invoke handler, the build-time list and the window
      capability, with the typed adapter and shared result types beside them. The code is a child
      module, `github/overview.rs`, on the Milestone 8 runner. [Automated checks](evidence/m11-dashboard/automated-checks.log)
- [x] D02: Nothing writes. The three reads send five requests between them in a test that records
      each one's method and body, and every one is a `GET` with no body. [Automated checks](evidence/m11-dashboard/automated-checks.log)
- [x] D03: The webview names no commit. `github_head_checks` reads HEAD from the repository under the
      Git lock and releases it before any request; a branch with no commits sends nothing, and a
      value that is not 40 or 64 hexadecimal digits never reaches a path. [Automated checks](evidence/m11-dashboard/automated-checks.log)
- [x] D04: The runner reads the `rel="last"` page from GitHub's `Link` header, digits only, and keeps
      it through a `304` as it keeps the paging flag. [Automated checks](evidence/m11-dashboard/automated-checks.log)
- [x] D05: A commit GitHub does not have — a `404` or `422` on its check runs — sets `checks.missing`
      and costs one request, not two. The pull request viewer gains the same flag and no longer
      reports that case as GitHub refusing a change. [Automated checks](evidence/m11-dashboard/automated-checks.log)

## 4. Roadmap sections

- [x] D06: Repository summary: project name, stack and architecture from the manifest, `owner/repo`,
      description as plain text, visibility badges and default branch, with each remote state
      explained as the GitHub panel explains it. [Automated checks](evidence/m11-dashboard/automated-checks.log)
- [x] D07: Git state and branch state from the Git store: staged, unstaged, untracked and conflicted
      counts, upstream with ahead and behind, the current branch or HEAD state, default branch,
      local and remote-tracking counts, and branches whose upstream is gone. [Automated checks](evidence/m11-dashboard/automated-checks.log)
- [x] D08: Recent commits, the latest eight from local history, and recent activity, the latest
      eight GitHub reports. [Automated checks](evidence/m11-dashboard/automated-checks.log)
- [x] D09: Issues and pull requests counted apart and exactly; issues turned off and a refused count
      are explained in their own cards. [Automated checks](evidence/m11-dashboard/automated-checks.log)
- [x] D10: Build: the checks summary of the checked-out commit, not pushed yet, no commits yet, and
      refused or truncated checks. [Automated checks](evidence/m11-dashboard/automated-checks.log)
- [x] D11: Commands from the manifest, displayed and not run, and milestones with a closed-share
      progress bar, due date, and a note that GitHub counts pull requests in them and when there
      are more than thirty. A milestone with nothing assigned is not shown as 0%. Project progress
      says it arrives with Milestone 12. [Automated checks](evidence/m11-dashboard/automated-checks.log)

## 5. Interface

- [x] D12: The dashboard fills the editor area. With a folder open and no file it replaces the
      Welcome screen; its button brings it in front of open files; activating a tab, opening a diff
      or opening a pull request patch puts that in front of it; showing it closes a diff or patch.
      The editor is hidden rather than unmounted. The Recent list is shared with the Welcome screen,
      so another project stays one click away. [Automated checks](evidence/m11-dashboard/automated-checks.log)
- [x] D13: It reads only while on screen — when it appears, on window focus while visible, and on
      Refresh — and asks GitHub nothing about the repository while signed out or without a GitHub
      remote. Each GitHub read fails alone; a rejected token reloads the account; answers for a
      replaced folder are discarded. Its links open the Source control or GitHub panel, on the
      Issues or Pull requests tab, beside it. [Automated checks](evidence/m11-dashboard/automated-checks.log)

## 6. Proof

- [x] V01: Twelve new Rust tests on the shared mock GitHub API. They assert consequences: the count
      comes from the last page, and from the page itself with no second one; it survives a `304`;
      issues never go below zero and are absent when turned off; a last page that is not a number
      is ignored; a revoked token signs out; milestones keep their counts and query; the head is
      checked with runs and statuses; a `404` or `422` is missing after one request; no commit and
      a crafted commit send nothing; nothing writes. [Automated checks](evidence/m11-dashboard/automated-checks.log)
- [x] V02: Twenty-one new frontend tests across the store, the dashboard and the application shell,
      including signed-out reads, refusals kept per section, a rejected token, a stale folder,
      sign-out clearing, the editor area's one-thing-at-a-time rule, a description containing
      HTML rendering as text, and focus reading only while the dashboard is visible. Four existing
      shell tests now open a file first, because with a folder and no file the dashboard is on
      screen and reads by design. [Automated checks](evidence/m11-dashboard/automated-checks.log)
- [x] V03: Formatting, ESLint, TypeScript, the frontend suite, Rust formatting, Clippy with
      warnings denied and the Rust suite all pass. Frontend tests 229 to 250; Rust tests 146 to 158. [Automated checks](evidence/m11-dashboard/automated-checks.log)
- [x] V04: The production bundle still excludes the development-only harness, still names no
      GitHub host and contains no write method, and no component sets inner HTML. The dashboard is
      its own lazy chunk. [Bundle inspection](evidence/m11-dashboard/production-bundle-exclusion.txt)
- [x] V05: Installer generated and hashed. [Verification record](verification.md#milestone-11--project-dashboard-september-19-2026)
- [x] V06: README, roadmap, architecture, acceptance, run-sheet, verification and remaining-work
      updated, with the open P10-P12 gate restated rather than quietly dropped.

D01-D13 and V01-V06 are delivered with their evidence linked beside each item. 250 frontend tests
and 158 Rust tests prove the services, the stores and the dashboard, and prove nothing about
installed-app behaviour or about the live GitHub API.

Installed-app checks for this milestone are numbered 91-98 in the
[acceptance checklist](acceptance.md) and belong to the
[manual run-sheet](acceptance-runsheet-m6.md), not to this list. Milestone 6 gate items P10, P11
and P12 stay unchecked.
