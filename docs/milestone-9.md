# Milestone 9 — GitHub issues delivery checklist

Approved scope: list open and closed issues with their labels, assignees and milestone, filter
them, read an issue's body, and create, close and reopen an issue. Comments, editing and other
advanced metadata stay deferred, as the roadmap allows. Pull requests stay in Milestone 10. GitHub
models stay in the GitHub module and are not shared with generic TBCE models.

## Completion rules

Every checked item needs an expected result, observed result, reproducible command or scenario,
evidence location, and tested source/build identity. Failed or blocked items remain unchecked.
Diagnose mismatches, fix their cause, rerun the scenario and affected regression checks, and record
the new evidence. Never change a requirement merely to match a passing test.

Automated tests, package generation, and installed-app acceptance are separate claims and are
never merged into one statement.

## 1. Scope decisions

The user chose the first four on September 18, 2026, before implementation. The fifth was stated
in the plan the user approved the same day.

- **Body.** Shown as plain text with its line breaks, never rendered. Rendering Markdown would need
  a parser and a sanitizer, and images would stay blocked by the content security policy anyway.
  No dependency was added and the policy is unchanged.
- **Create.** Title, body, labels, assignees and a milestone. The user chose the broader option over
  title and body alone, so the repository's labels, assignable users and open milestones are read
  for the form.
- **Close.** An in-panel prompt offering Completed, Not planned or Cancel. Not a native
  confirmation, because closing is undone by reopening and nothing is destroyed.
- **Filters.** Open or closed, plus label, assignee and milestone. The user chose the broader option
  over state alone.
- **Desktop acceptance.** The waiver used for Milestones 4 to 8 continues; see below.

## 2. Desktop acceptance gate

The [Milestone 6 gate](milestone-6.md) items P10, P11 and P12 are **still open**, and no desktop
checkbox is ticked anywhere on the strength of this milestone.

The reason is the one [Milestone 8](milestone-8.md#2-desktop-acceptance-gate) restated: desktop
automation works, check 1 has a recorded pass, and the other checks are unexecuted rather than
blocked by a missing tool. This milestone adds eight more, 75-82, to the
[manual run-sheet](acceptance-runsheet-m6.md), for 53 unexecuted in all. They differ from every
earlier check in one way that matters: they **change a real repository on GitHub**, so they need a
disposable repository and must never be run against one that other people watch.

## 3. Service and native interface

- [x] I01: Six `github_*` commands — `github_issues`, `github_issue`, `github_issue_choices`,
      `github_create_issue`, `github_close_issue` and `github_reopen_issue` — registered in the
      invoke handler, the build-time list and the window capability, with the typed adapter and
      shared result types beside them. The issue code is a child module, `github/issues.rs`, using
      the Milestone 8 runner rather than a second one. [Automated checks](evidence/m9-github-issues/automated-checks.log)
- [x] I02: The runner writes. `send` takes a method from a closed set and an optional JSON body and
      accepts `201`; `write` is never conditional, never cached and never retried. A write that may
      have reached GitHub before its deadline is reported as `GITHUB_WRITE_UNCONFIRMED` rather than
      as a failure that invites a duplicate; one that never connected stays
      `GITHUB_NETWORK_FAILED`. `410` and `422` get codes of their own. A `401` during a write drops
      the token and the cache exactly as a read does. [Automated checks](evidence/m9-github-issues/automated-checks.log)
- [x] I03: Nothing the webview sends reaches GitHub unchecked. Titles, bodies, labels, logins,
      milestone and issue numbers are checked against GitHub's own limits before a request exists;
      the issue state and close reason are Rust enums; query values are percent-encoded byte by
      byte; a label colour reaches the interface only as six hexadecimal digits. The target
      repository still comes from the workspace's own remote. [Automated checks](evidence/m9-github-issues/automated-checks.log)
- [x] I04: Pull requests are never touched through the issue endpoints. Lists leave them out while
      paging still follows the `Link` header, and closing, reopening or reading one refuses it
      before anything is changed — proven by a test that records only `GET` requests. [Automated checks](evidence/m9-github-issues/automated-checks.log)
- [x] I05: An issue page may carry thirty full bodies, so issue lists alone read with an 8 MiB cap;
      a single issue and everything else keep 1 MiB. Only answers within 1 MiB are cached, so the
      cache stays bounded. [Automated checks](evidence/m9-github-issues/automated-checks.log)

## 4. Roadmap capabilities

- [x] I06: List issues, open and closed, with number, title, author, labels and their colours,
      assignees, milestone, comment count and dates, paged from GitHub's `Link` header. A later page
      that repeats an issue does not show it twice. [Automated checks](evidence/m9-github-issues/automated-checks.log)
- [x] I07: Labels, assignees and milestones as filters, including Nobody and No milestone. The
      choices are read once when the filters or the form first need them, at most five pages of a
      hundred each, and a longer list says it was cut short. [Automated checks](evidence/m9-github-issues/automated-checks.log)
- [x] I08: Open an issue and read its body as written, with state and close reason, author, dates,
      labels, assignees, milestone and comment count. [Automated checks](evidence/m9-github-issues/automated-checks.log)
- [x] I09: Create an issue with a title, body, labels, assignees and milestone. What GitHub silently
      leaves out for someone without push access is found by comparing its answer with the request,
      and reported. [Automated checks](evidence/m9-github-issues/automated-checks.log)
- [x] I10: Close an issue as completed or not planned, and reopen one. The list reflects the change
      without another request: an issue that no longer matches the filter leaves it. [Automated checks](evidence/m9-github-issues/automated-checks.log)

## 5. Interface

- [x] I11: An Issues tab beside Overview, Branches and Commits. One refresh reads the first page of
      issues with everything else, so switching tabs still reads nothing; an issue open on screen is
      read again on refresh. A repository with issues turned off is known from the repository itself
      and asked nothing more. [Automated checks](evidence/m9-github-issues/automated-checks.log)
- [x] I12: Refusals stay local. A token that cannot read issues, or issues turned off, is explained
      in the tab while the rest of the panel stays correct; a write refused for permission names the
      permission it needs; a failed create keeps the draft; and a create is never reported as failed
      because the list could not be re-read afterwards. [Automated checks](evidence/m9-github-issues/automated-checks.log)

## 6. Proof

- [x] V01: Twenty new Rust tests on the mock GitHub API, now shared by both test modules from
      `github/mock.rs` and recording each request's method and body as well as its path and headers.
      They assert consequences: the exact JSON a create sends, a pull request never receiving a
      `PATCH`, a crafted filter or draft sending nothing, a label unable to add a query parameter,
      dropped metadata reported, an unanswered write reported as unconfirmed and sent once, an
      oversized issue page read but not cached. [Automated checks](evidence/m9-github-issues/automated-checks.log)
- [x] V02: Thirty-three new frontend tests across the store and the panel, including tab switching
      reading nothing, refusals staying in their section, a filter kept only once GitHub answers,
      stale-workspace and single-in-flight refusal for changes, a failed create keeping the draft,
      the close prompt's Cancel sending nothing, and a body containing HTML rendering as text with
      no element created. [Automated checks](evidence/m9-github-issues/automated-checks.log)
- [x] V03: Formatting, ESLint, TypeScript, the frontend suite, Rust formatting, Clippy with
      warnings denied and the Rust suite all pass. Frontend tests 168 to 201; Rust tests 110 to 130. [Automated checks](evidence/m9-github-issues/automated-checks.log)
- [x] V04: The production bundle still excludes the development-only harness and still names no
      GitHub host, and no component sets inner HTML. [Bundle exclusion](evidence/m9-github-issues/production-bundle-exclusion.txt)
- [x] V05: Installer generated and hashed. [Verification record](verification.md#milestone-9--github-issues-september-18-2026)
- [x] V06: README, roadmap, architecture, acceptance, run-sheet, verification and remaining-work
      updated, with the open P10-P12 gate restated rather than quietly dropped.

I01-I12 and V01-V06 are delivered with their evidence linked beside each item. 201 frontend tests
and 130 Rust tests prove the service, the store and the panel, and prove nothing about
installed-app behaviour or about the live GitHub API.

Installed-app checks for this milestone are numbered 75-82 in the
[acceptance checklist](acceptance.md) and belong to the
[manual run-sheet](acceptance-runsheet-m6.md), not to this list. Milestone 6 gate items P10, P11
and P12 stay unchecked.
