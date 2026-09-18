# Manual acceptance run-sheet — installed-app checks 15–42, 57–66 and 67–82

Run these checks against the installed TBCE application on Windows, by hand or
through working desktop automation. Checks 15–42 cover P10 of the
[Milestone 6 prerequisite gate](milestone-6.md). P11 covers the earlier editor
scenarios identified separately below. Checks 57–66 cover the Milestone 7
source-control panel and were added on September 16, 2026. Checks 67–74 cover the
Milestone 8 GitHub panel and were added on September 17, 2026. Checks 75–82 cover
the Milestone 9 Issues tab and were added on September 18, 2026. Recording blocked
checks does not complete acceptance or close the gate.

Checks 43–56 exercised the Git backend through the development harness. The
[source-control panel](milestone-7.md) now reaches every Git command, so run 57–66
instead; they cover the same ground through the interface a user actually has.

## Before you start

1. Build and install the package:

   ```sh
   npm run tauri build -- --target x86_64-pc-windows-msvc
   ```

   Install `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/TBCE_0.1.0_x64-setup.exe`
   and record its SHA-256 below. **Launch the installed application, not `npm run tauri dev`** —
   these checks exist to catch what only breaks in a packaged build.

2. Create a disposable folder whose name contains spaces and Turkish characters, for
   example `Masaüstü deneme ğüşıöç`. Keep it away from anything you care about.
3. Use disposable stack/architecture catalogs without deleting personal entries.
   Preserve any existing application data before testing empty or damaged libraries.
   Use a local bare remote and two disposable clones for check 64. For checks 67–74
   you need a GitHub account and a token you create for the run and revoke when you
   finish; prefer a fine-grained token limited to Metadata: Read and Contents: Read.
   Checks 75–82 change a repository on GitHub: use a disposable repository you own,
   never one other people watch, and the two tokens [acceptance.md](acceptance.md)
   describes for them. Never commit a token and never paste one into a project file. Scope missing-Git
   PATH changes to the test application process and identity changes to test Git
   configuration; do not rename the installed Git executable or edit global settings.
4. Record the build identity once, then fill in one row per check. If a fix changes
   the application, rebuild, record the new identity, and rerun affected scenarios.

| Field                     | Value |
| ------------------------- | ----- |
| Date                      |       |
| Source revision           |       |
| Source fingerprint        |       |
| Installer SHA-256         |       |
| Installed executable path |       |
| TBCE version              | 0.1.0 |
| Windows version           |       |
| Git version               |       |

## How to record a result

For each numbered check in [acceptance.md](acceptance.md), write down:

- **Expected** — what the checklist says should happen.
- **Observed** — what actually happened, in your own words.
- **Evidence** — a screenshot path, or the result of looking at the file or process
  yourself outside TBCE.
- **Status** — pass, fail, or blocked.

A check only passes when you observed the expected result **and** confirmed it
independently where the checklist asks for that. "The button did not error" is not
the same as "the file on disk changed". If something fails, write down what you saw
and stop treating that area as verified; do not adjust the expectation to match.

## What to run

| Group                  | Checks          | Covers                                                                                                                                                    |
| ---------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor gate (P11)      | 2, 7, 9, 10, 13 | Native file picker, dirty-exit prompts, Recycle Bin deletion/restoration, save-conflict UI, minimum-size layout                                           |
| Additional editor gaps | 11, 12          | Missing files, read-only saves, unsupported files, invalid names and collisions                                                                           |
| Terminal               | 15–22           | Opening, working directory, Turkish output, Ctrl+C, resizing, scrollback, restart, orphaned processes                                                     |
| Project system         | 23–27           | Creation, conversion, Recent list, missing folders, corrupt manifests                                                                                     |
| Saved stacks           | 28–35           | Capture defaults, unsaved buffers, creation, replacement, deletion, damaged definitions, layout                                                           |
| Architectures          | 36–42           | Catalog persistence, structure editing, previews, conflicts, deletion, layout                                                                             |
| Git UI                 | 57–66           | Detection, initialization, missing Git, status, staging, commits, conflicts, branches, remotes, clone, previews, history, layout                          |
| GitHub                 | 67–74           | Connecting and disconnecting an account, credential storage, remote states, overview values, branch and commit paging, revoked tokens, refusals, layout   |
| GitHub issues          | 75–82           | Issue lists and paging, filters, plain-text bodies, creating, closing with a reason, reopening, read-only refusals, disabled issues, network loss, layout |

Earlier records do not close the P11 scenarios above. Rerun those checks, including
their cancellation/error paths, and retain checks 11–12 from the original sheet.
Other editor checks need repeating only when an application change affects them.
Installing and launching the newly identified package remains required for every run.

## Results

Copy this block once per check.

```text
Check NN
Expected:
Observed:
Evidence:
Status: pass | fail | blocked
```

## When you are done

Send the filled-in sheet back, or paste it into
[verification.md](verification.md) under a new dated heading. Mark P10 only when
every check 15–42 passes, P11 only when all its editor scenarios pass, and P12 only
when all prerequisite failures are resolved and the gate passes. Track 57–66
separately as Git UI acceptance, 67–74 as GitHub acceptance and 75–82 as GitHub
issues acceptance. A filled-in sheet
containing fail or blocked results is not a passing gate. Until the relevant checks
pass, the Git backend, the source-control panel and the GitHub panel all remain
**implemented and covered by automated tests, but not desktop-accepted**.

Revoke the tokens you created for checks 67–82 as soon as you are finished, delete
the disposable repository used for 75–82, and disconnect the account in TBCE so
nothing is left in the credential vault.
