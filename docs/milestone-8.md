# Milestone 8 — GitHub connection delivery checklist

Approved scope: read-only GitHub repository context for the open project. Issue and pull request
lists stay in Milestones 9 and 10; the dashboard stays in Milestone 11. Nothing in this milestone
writes to GitHub, and no GitLab or Bitbucket support is added.

## Completion rules

Every checked item needs an expected result, observed result, reproducible command or scenario,
evidence location, and tested source/build identity. Failed or blocked items remain unchecked.
Diagnose mismatches, fix their cause, rerun the scenario and affected regression checks, and record
the new evidence. Never change a requirement merely to match a passing test.

Automated tests, package generation, and installed-app acceptance are separate claims and are
never merged into one statement.

## 1. Scope decisions

All four were confirmed by the user on September 17, 2026, before implementation.

- **Authentication.** A Personal Access Token the user pastes once, validated against `GET /user`
  and kept in the Windows Credential Manager. OAuth device flow was considered and declined: it
  needs a registered GitHub application and a client identifier embedded in the source, which is
  more moving parts than a read-only milestone justifies. Reusing the token Git Credential Manager
  already holds was also declined, because a token stored for Git transport carries no promise of
  API scopes and would leave the user with no account to manage.
- **Breadth.** The connection plus Overview, Branches, Commits and repository activity. The
  Overview shows the single count GitHub reports, labelled as open issues **and** pull requests
  together, rather than inventing a separate issue count that would be wrong.
- **Proof.** Automated tests run against a mock GitHub API on a local socket, so pagination, rate
  limits, `401`/`403`/`404`, `ETag`/`304`, oversized answers, timeouts and Unicode are exercised
  with no network and no token in CI.
- **Desktop acceptance.** The waiver used for Milestones 4 to 7 continues, with its reason
  restated honestly rather than copied; see below.

## 2. Desktop acceptance gate

The [Milestone 6 gate](milestone-6.md) items P10, P11 and P12 are **still open**, and no desktop
checkbox is ticked anywhere on the strength of this milestone.

What has changed since Milestone 7 is the reason. Desktop automation is **no longer unavailable**:
the [September 17 resumed run](verification.md#installed-app-acceptance-resumed--september-17-2026-0016-0300)
discovered the application, installed it and **passed check 1** against the fixed installer. The
45 remaining checks are unexecuted because the package under test crashed at startup, a defect
fixed in the same run. So this milestone proceeds under the same waiver — implement, prove with
automated tests, extend the [manual run-sheet](acceptance-runsheet-m6.md), and state in every
document that the result is **not desktop-accepted** — but the waiver's justification is now "45
checks unexecuted, one recorded pass", not a missing Computer Use pipe.

## 3. Service and native interface

- [x] H01: Rust `GitHubService`, a typed TypeScript adapter and shared result types; eight
      `github_*` commands registered in the invoke handler, the build-time list and the window
      capability. The registration test was generalized from the `git_` prefix to every command,
      because `strip_prefix("pub async fn git_")` read `github_account` as a Git command named
      `hub_account` and would have passed while checking the wrong names. [Automated checks](evidence/m8-github/automated-checks.log)
- [x] H02: Bounded HTTP runner in `github::GitHubService::send`, the analogue of `process::run`:
      forced `Accept`, API version and user-agent headers, 10 s connect and 20 s read deadlines,
      a 1 MiB response cap read one byte past the limit so a full answer is distinguishable from
      an oversized one, no redirects followed, `Link`-header paging, rate-limit parsing, and token
      scrubbing on every message that can reach the interface. [Automated checks](evidence/m8-github/automated-checks.log)
- [x] H03: The token is stored in the Windows Credential Manager behind a `CredentialStore` trait,
      written only after GitHub accepts it, read per operation rather than cached, never returned
      by any command, and dropped when GitHub reports it revoked. A non-Windows build reports
      `CREDENTIALS_UNSUPPORTED` rather than writing a secret somewhere unprotected. [Automated checks](evidence/m8-github/automated-checks.log)
- [x] H04: The GitHub lock is never held while the Git lock is taken. Repository identity is
      resolved under the Git lock, which is released before any request is sent, so a slow or
      rate-limited GitHub answer cannot block staging or saving a file. [Automated checks](evidence/m8-github/automated-checks.log)

## 4. Roadmap capabilities

- [x] H05: Repository identity comes from the workspace's own Git remote through a new
      `GitService::remote_url`, not from the webview. HTTPS, SSH, scp-style, `git://`, port and
      userinfo forms are recognized; a host that is not github.com is reported as a state the
      panel explains, and no `git_*` command was added, so the Git surface stays at eighteen. [Automated checks](evidence/m8-github/automated-checks.log)
- [x] H06: Overview reports owner, name, description, default branch, visibility, fork and archive
      flags, language, last push, stars, forks, watchers, and the combined open issue and pull
      request count exactly as GitHub reports it, labelled as combined. [Automated checks](evidence/m8-github/automated-checks.log)
- [x] H07: Remote branches with their tip and protection flag, and commits with author, login,
      date and summary, both paged from GitHub's `Link` header rather than from the size of a page. [Automated checks](evidence/m8-github/automated-checks.log)
- [x] H08: Repository activity on the Overview. Activity needs more access than metadata, so a
      refusal leaves that one section empty and explained instead of failing the whole read. [Automated checks](evidence/m8-github/automated-checks.log)
- [x] H09: The webview never names a host, a path, a header or a URL: commands carry a workspace
      identifier and a page number. The content security policy is unchanged, which is why the
      panel shows a login name and no avatar — a remote image would need `img-src` widened. A
      crafted remote cannot reach another endpoint, asserted by a test that sends nothing. [Automated checks](evidence/m8-github/automated-checks.log), [Bundle exclusion](evidence/m8-github/production-bundle-exclusion.txt)

## 5. Interface

- [x] H10: One more activity-bar panel beside source control, mounted only while it is selected,
      so opening a folder or working in the editor never reads GitHub. It reads when the panel
      appears, when the window regains focus while it is visible, and on its Refresh control.
      Nothing polls. [Automated checks](evidence/m8-github/automated-checks.log)
- [x] H11: Signed out, signed in without a folder, no repository, no remote, a remote elsewhere, an
      unavailable Git and a linked repository each produce their own panel. One refresh reads
      everything the panel shows, so switching tabs runs nothing at all; and the account controls
      use their own busy flag, so a stalled or rate-limited read never blocks disconnecting. [Automated checks](evidence/m8-github/automated-checks.log)

## 6. Proof

- [x] V01: Twenty-five new Rust tests, most of them driving a mock GitHub API on a local socket
      and two needing none — a source check and a real credential-vault round trip. They assert
      consequences: a token stored only after validation, a rejected token leaving an existing one
      untouched, a revoked token dropped, `Link`-driven paging, `ETag` reuse proven by the second
      request carrying `If-None-Match`, an exhausted rate limit reporting its reset, each failing
      status mapping to its own code, malformed and oversized answers refused, a stalled answer
      timing out, a token never reaching a message, a crafted remote or reference sending nothing,
      every GitHub remote form recognized, and a real credential-vault round trip under a
      disposable service name. [Automated checks](evidence/m8-github/automated-checks.log)
- [x] V02: Thirty-five frontend tests cover the adapter, the store and the panel, including
      stale-workspace rejection, single-in-flight refusal, a signed-out panel reading nothing,
      tab switching running nothing, paging appending rather than replacing, refused activity
      leaving the rest intact, the token never reaching `localStorage` or the document, and the
      account surviving a workspace change while the repository does not. [Automated checks](evidence/m8-github/automated-checks.log)
- [x] V03: Formatting, ESLint, TypeScript, the frontend suite, Rust formatting, Clippy with
      warnings denied and the Rust suite all pass. Frontend tests 111 to 146; Rust tests 82 to 107. [Automated checks](evidence/m8-github/automated-checks.log)
- [x] V04: The production bundle still excludes the development-only harness, and does not contain
      the GitHub host at all: the webview names commands, never endpoints. [Bundle exclusion](evidence/m8-github/production-bundle-exclusion.txt)
- [x] V05: Installer generated and hashed. [Verification record](verification.md#milestone-8--github-connection-september-17-2026)
- [x] V06: README, roadmap, architecture, acceptance, run-sheet, verification and remaining-work
      updated, with the open P10-P12 gate restated rather than quietly dropped.

H01-H11 and V01-V06 are delivered with their evidence linked beside each item. 146 frontend tests
and 107 Rust tests prove the service, the store and the panel, and prove nothing about
installed-app behaviour.

Installed-app checks for this milestone are numbered 67-74 in the
[acceptance checklist](acceptance.md) and belong to the
[manual run-sheet](acceptance-runsheet-m6.md), not to this list. Milestone 6 gate items P10, P11
and P12 stay unchecked.
