# Milestone 6 — Git backend delivery checklist

Approved scope: Git backend only. The source-control panel stays in Milestone 7;
GitHub sign-in stays in Milestone 8. Existing credentials and conservative Git
operations are the defaults. Preserve the uncommitted Milestone 5 implementation.

## Completion rules

Every checked item needs an expected result, observed result, reproducible command
or scenario, evidence location, and tested source/build identity. Failed or blocked
items remain unchecked. Diagnose mismatches, fix their cause, rerun the scenario
and affected regression checks, and record the new evidence. Never change a
requirement merely to match a passing test.

Automated tests, package generation, and installed-app acceptance are separate
claims. The prerequisite gate below must pass before Git implementation begins.

## 1. Prerequisite gate

Evidence: [September 15 verification](verification.md#milestone-6-prerequisite-audit--september-15-2026).

- [x] P01: Record starting revision, source fingerprint, existing changes, and tool versions.
- [x] P02: Frontend formatting check passes.
- [x] P03: ESLint passes.
- [x] P04: Frontend tests pass (66 tests).
- [x] P05: TypeScript and frontend production build pass.
- [x] P06: Rust formatting check passes.
- [x] P07: Clippy passes with warnings denied.
- [x] P08: Rust tests pass (45 tests).
- [x] P09: Generate a Windows installer and record its SHA-256.
- [ ] P10: Complete pending installed-app acceptance checks 15–42.
- [ ] P11: Complete earlier unverified editor scenarios: confirmed Recycle Bin deletion/restoration, native file picker, save-conflict UI, dirty exit prompts, and minimum-size layout.
- [ ] P12: Resolve all prerequisite failures and confirm the gate passes.

P10/P11 remain blocked: desktop discovery fails with a missing native pipe, including
after resetting and reinitializing the JavaScript session. The
[September 17 execution attempt](verification.md#installed-app-acceptance-attempt--september-17-2026)
reproduced the failure outside Plan mode and generated a new installer. No desktop
scenario ran in that attempt; P10, P11 and P12 remain unchecked.

**September 16, 2026 scope decision.** The user directed that the Git backend be
implemented while a manual acceptance path is prepared, rather than waiting for
desktop automation that may not return. The
[manual run-sheet](acceptance-runsheet-m6.md) turns checks 15-42 into steps a person
performs against the packaged build. Until it comes back filled in, P10, P11 and P12
stay unchecked and the Git backend is **implemented and covered by automated tests,
but not desktop-accepted**. This mirrors the documented waiver used for Milestones 4
and 5. Installer upgrade/uninstall, signing, and other operating systems remain later
release work.

## 2. Service and native interface

- [x] G01: Rust `GitService`, typed TypeScript adapter, shared result types; 18 commands registered in the invoke handler, build-time list and capability. A test compares all four lists so a missed registration fails the suite instead of the packaged app. [Automated checks](evidence/m6-git/automated-checks.log)
- [x] G02: Bounded runner in `process::run`: argument arrays, no shell, piped stdio, null stdin, 30 s local and 300 s network deadlines with kill-on-timeout, 8 MiB capture cap, `CREATE_NO_WINDOW`, noninteractive environment, credential redaction, exit-code classification. No Tauri command exposes it. [Automated checks](evidence/m6-git/automated-checks.log)
- [x] G03: `rev-parse` resolution recognizes repository roots, linked worktrees, bare repositories, unborn branches and detached HEAD. A parent repository is reported as `parent` and refused for every operation. [Automated checks](evidence/m6-git/automated-checks.log)
- [x] G04: `Git = Mutex<()>` serializes operations; the workspace root is resolved after the queue wait so stale requests are rejected, and the filesystem guard is released before Git starts. [Automated checks](evidence/m6-git/automated-checks.log)

Expose detection, initialization, clone, status, branches, branch creation/checkout/
deletion, stage/unstage/stage-all, commit, fetch/pull/push, history, and diff.
Results include repository identity, branch/upstream state, separate index and
worktree changes, conflicts, commits, and binary/truncated-diff indicators.

## 3. Roadmap capabilities

- [x] G05: Explicit `init`; `clone` into a new folder under a natively picked parent, refusing an existing destination, removing only what it created on failure, and returning the location without switching workspaces. [Automated checks](evidence/m6-git/automated-checks.log)
- [x] G06: Branch, upstream, separate index and worktree changes, untracked files, conflicts and nullable ahead/behind from NUL-delimited porcelain v2. [Automated checks](evidence/m6-git/automated-checks.log)
- [x] G07: `branch` creates without switching; checkout refuses a dirty index or worktree and never forces; deletion confirms natively and rejects current, default, unmerged and elsewhere-checked-out branches. [Automated checks](evidence/m6-git/automated-checks.log)
- [x] G08: Staging paths or everything including deletions; unstaging without touching working files, including before the first commit; commit requires a nonempty message, a clean merge state, staged content and a configured identity. [Automated checks](evidence/m6-git/automated-checks.log)
- [x] G09: HTTPS, SSH, `file://` and local sources; transport helpers refused before any process starts; existing credential helpers and SSH used unchanged; explicit fetch, fast-forward-only pull, non-force push; authentication, upstream and divergence failures classified. No global or system configuration is written, asserted by a test. [Automated checks](evidence/m6-git/automated-checks.log)
- [x] G10: Bounded paginated history and staged/unstaged diffs with rename and binary handling; `--no-ext-diff --no-textconv` proven by a test that fails if an external diff command runs. [Automated checks](evidence/m6-git/automated-checks.log)
- [x] G11: `has_git` removed from the project surface. `detect_project` still runs no Git, so opening a folder never waits on it; repository state comes from `GitService`, and a missing or failing Git degrades to `unavailable`. Project metadata stays at schema version 1. [Automated checks](evidence/m6-git/automated-checks.log)

Operations use saved disk contents and never silently save/discard editor buffers.
Merge/rebase workflows, force push, hard reset, and the visual source-control panel
are outside this milestone.

## 4. Proof and final acceptance

- [x] V01: Real Git in disposable paths with spaces and Turkish characters; a local bare remote and two clones drive fetch, pull, push, divergence and ahead/behind. [Automated checks](evidence/m6-git/automated-checks.log)
- [x] V02: Unborn and detached HEAD, staged-plus-unstaged edits, renames, deletions, binary files, conflicts, missing remote/upstream/identity, invalid arguments and branch names, timeouts, output caps and protected branch deletion. [Automated checks](evidence/m6-git/automated-checks.log)
- [x] V03: Mutations are confirmed with independent `git` inspection or by reading bytes on disk; refusals assert that refs, the index and files are unchanged. [Automated checks](evidence/m6-git/automated-checks.log)
- [x] V04: TypeScript contracts and native permissions exercised through a development-only harness that a production build excludes. [Bundle exclusion](evidence/m6-git/production-bundle-exclusion.txt)
- [x] V05: All eight checks rerun and green; installer built and hashed (`D87F715D...101EF4`). Backend proof and desktop acceptance are stated separately everywhere. [Automated checks](evidence/m6-git/automated-checks.log), [package log](evidence/m6-git/windows-package.log)
- [x] V06: README, roadmap, architecture, acceptance, verification, and remaining-work updated; every ticked item above links its evidence, and the open P10-P12 gate is stated in each document rather than quietly dropped.

For each G/V item, add its evidence beside the checkbox when execution occurs.
G01-G11 and V01-V04 are delivered with the evidence linked beside each item. V05 and
V06 close out the run. P10-P12 stay open under the September 16 scope decision above:
81 Rust tests and 73 frontend tests prove the backend, and prove nothing about
installed-app behaviour.
