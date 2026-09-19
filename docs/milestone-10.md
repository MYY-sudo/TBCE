# Milestone 10 — Pull request viewer delivery checklist

Approved scope: list open and closed pull requests, view one with its source and target branch,
description, CI/check state and changed files, and show a changed file's patch. Creating,
reviewing and merging stay in the roadmap's "Later" list, and nothing in this milestone writes to
GitHub. GitHub models stay in the GitHub module and are not shared with generic TBCE models.

## Completion rules

Every checked item needs an expected result, observed result, reproducible command or scenario,
evidence location, and tested source/build identity. Failed or blocked items remain unchecked.
Diagnose mismatches, fix their cause, rerun the scenario and affected regression checks, and record
the new evidence. Never change a requirement merely to match a passing test.

Automated tests, package generation, and installed-app acceptance are separate claims and are
never merged into one statement.

## 1. Scope decisions

The user chose the first three on September 18, 2026, before implementation. The fourth was stated
in the plan the user approved the same day.

- **Changed files.** Listed with status and additions and deletions, and choosing one opens its
  patch in the editor area, read-only, in the Monaco view the local diff uses. GitHub sends the
  patch with the file list, so showing it costs no request. The user chose this over a list alone.
- **CI/check state.** Checks API runs and commit statuses, merged into one summary. The user chose
  this over check runs alone, because CI services outside GitHub Actions still report through
  statuses. Both are read only when a pull request is opened, never for every row of the list.
- **Filters.** Open or closed only, with merged pull requests told apart from ones closed without
  merging. The user chose this over adding a target-branch filter.
- **Desktop acceptance.** The waiver used for Milestones 4 to 9 continues; see below.

## 2. Desktop acceptance gate

The [Milestone 6 gate](milestone-6.md) items P10, P11 and P12 are **still open**, and no desktop
checkbox is ticked anywhere on the strength of this milestone.

The reason is the one [Milestone 8](milestone-8.md#2-desktop-acceptance-gate) restated: desktop
automation works, check 1 has a recorded pass, and the other checks are unexecuted rather than
blocked by a missing tool. This milestone adds eight more, 83-90, to the
[manual run-sheet](acceptance-runsheet-m6.md), for 61 unexecuted in all. Unlike 75-82 they change
nothing on GitHub, but they need a repository prepared with forks, drafts, merged and closed pull
requests, real CI and a change of more than thirty files.

## 3. Service and native interface

- [x] PR01: Three `github_*` commands — `github_pull_requests`, `github_pull_request` and
      `github_pull_files` — registered in the invoke handler, the build-time list and the window
      capability, with the typed adapter and shared result types beside them. The code is a child
      module, `github/pulls.rs`, using the Milestone 8 runner rather than a second one. [Automated checks](evidence/m10-github-pulls/automated-checks.log)
- [x] PR02: Nothing writes. Every request the viewer sends is a `GET` with no body, proven by a test
      that runs all three commands against the mock server and records each request's method and
      body. [Automated checks](evidence/m10-github-pulls/automated-checks.log)
- [x] PR03: Nothing the webview sends reaches GitHub unchecked. The state is a Rust enum, so `all`,
      `merged` or a value carrying `&` does not deserialize; pull request number zero sends nothing;
      the target repository still comes from the workspace's own remote. The head commit comes from
      GitHub's answer, but it goes into a request path, so anything other than 40 or 64 hexadecimal
      digits is refused before a request exists. [Automated checks](evidence/m10-github-pulls/automated-checks.log)
- [x] PR04: Checks never cost the pull request. A refusal of check runs or of commit statuses is
      recorded as its own flag while the other source is still read; any other failure becomes an
      error inside the answer; only a rejected token stops the read, and it still drops the token
      and the cache. [Automated checks](evidence/m10-github-pulls/automated-checks.log)
- [x] PR05: Pull request pages and file pages read with the 8 MiB list cap issue pages use, renamed
      from `ISSUE_PAGE_CAP` to `LIST_PAGE_CAP`; a single pull request and its checks keep 1 MiB.
      Only answers within 1 MiB are cached, so the cache stays bounded. [Automated checks](evidence/m10-github-pulls/automated-checks.log)

## 4. Roadmap capabilities

- [x] PR06: List pull requests, open and closed, with number, title, author, draft and merged state,
      source and target branch, labels and their colours, assignees, requested reviewers and teams,
      milestone and dates, paged from GitHub's `Link` header. A later page that repeats one does not
      show it twice. [Automated checks](evidence/m10-github-pulls/automated-checks.log)
- [x] PR07: Source and target branch. The source names its repository when it is a fork, and a fork
      GitHub reports as deleted is shown as such rather than as a local branch. [Automated checks](evidence/m10-github-pulls/automated-checks.log)
- [x] PR08: View a pull request with its description as written, commit, line, file and comment
      counts, and GitHub's mergeable state, which reads as not yet known until GitHub has computed
      it. [Automated checks](evidence/m10-github-pulls/automated-checks.log)
- [x] PR09: CI/check state of the head commit: every run and status with where it came from and how
      it ended, and one summary — failing, else pending, else passing, else none. More than GitHub
      returned in one read is reported as truncated. [Automated checks](evidence/m10-github-pulls/automated-checks.log)
- [x] PR10: Changed files with status, old and new path of a rename, and additions and deletions,
      paged; each file's patch opens in the editor area, and a file GitHub sent no patch for says
      so. [Automated checks](evidence/m10-github-pulls/automated-checks.log)

## 5. Interface

- [x] PR11: A Pull requests tab beside Overview, Branches, Commits and Issues; the tabs wrap rather
      than overflow in the sidebar. One refresh reads the first page of pull requests with
      everything else, so switching tabs still reads nothing; a pull request open on screen is read
      again on refresh with its checks and first page of files. [Automated checks](evidence/m10-github-pulls/automated-checks.log)
- [x] PR12: Refusals stay local. A token that cannot read pull requests is explained in the tab
      while the rest of the panel stays correct; refused checks are explained in the Checks
      section; files that cannot be read are reported beside the pull request. [Automated checks](evidence/m10-github-pulls/automated-checks.log)
- [x] PR13: One patch at a time. The Monaco patch view is shared through `components/PatchView.tsx`
      with the local diff, whose labels and banners are unchanged; opening a pull request file closes
      a local diff and opening a local diff closes the pull request file; the editor stays hidden
      rather than unmounted, so no tab loses its undo history. [Automated checks](evidence/m10-github-pulls/automated-checks.log)

## 6. Proof

- [x] V01: Sixteen new Rust tests on the shared mock GitHub API. They assert consequences: every
      request is a `GET` with no body, checks are read for the head commit GitHub reported, a
      crafted head commit reaches no path, a refused source leaves the other read, a failed checks
      read still returns the pull request, a revoked token during checks signs out, a deleted fork
      reads as one, a merged pull request is told apart, an oversized file page is read but not
      cached. [Automated checks](evidence/m10-github-pulls/automated-checks.log)
- [x] V02: Twenty-eight new frontend tests across the store, the panel, the patch view and the
      application shell, including tab switching reading nothing, refusals staying in their
      section, the state kept only once GitHub answers, stale-workspace refusal, an open patch
      surviving a refresh only while its file is still listed, the patch and the local diff never
      sharing the editor area, and a description containing HTML rendering as text with no element
      created. [Automated checks](evidence/m10-github-pulls/automated-checks.log)
- [x] V03: Formatting, ESLint, TypeScript, the frontend suite, Rust formatting, Clippy with
      warnings denied and the Rust suite all pass. Frontend tests 201 to 229; Rust tests 130 to 146. [Automated checks](evidence/m10-github-pulls/automated-checks.log)
- [x] V04: The production bundle still excludes the development-only harness, still names no
      GitHub host and contains no write method, and no component sets inner HTML. [Bundle exclusion](evidence/m10-github-pulls/production-bundle-exclusion.txt)
- [x] V05: Installer generated and hashed. [Verification record](verification.md#milestone-10--github-pull-requests-september-18-2026)
- [x] V06: README, roadmap, architecture, acceptance, run-sheet, verification and remaining-work
      updated, with the open P10-P12 gate restated rather than quietly dropped.

PR01-PR13 and V01-V06 are delivered with their evidence linked beside each item. 229 frontend tests
and 146 Rust tests prove the service, the store, the panel and the patch view, and prove nothing
about installed-app behaviour or about the live GitHub API.

Installed-app checks for this milestone are numbered 83-90 in the
[acceptance checklist](acceptance.md) and belong to the
[manual run-sheet](acceptance-runsheet-m6.md), not to this list. Milestone 6 gate items P10, P11
and P12 stay unchecked.
