# Manual acceptance run-sheet — installed-app checks 15–42

Written for the person running TBCE on Windows. Desktop automation is unavailable
in this environment, so these checks must be performed by hand. They are the
[Milestone 6 prerequisite gate](milestone-6.md) items P10 and P11, which stay
unchecked until this sheet comes back filled in.

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
3. Record the build identity once, then fill in one row per check.

| Field             | Value |
| ----------------- | ----- |
| Date              |       |
| Installer SHA-256 |       |
| TBCE version      | 0.1.0 |
| Windows version   |       |
| Git version       |       |

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

| Group          | Checks     | Covers                                                                                                              |
| -------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| Editor gaps    | 11, 12, 13 | Recycle Bin deletion and restoration, native file picker, save-conflict UI, dirty-exit prompts, minimum-size layout |
| Terminal       | 15–22      | Opening, working directory, Turkish output, Ctrl+C, resizing, scrollback, restart, orphaned processes               |
| Project system | 23–27      | Creation, conversion, Recent list, missing folders, corrupt manifests                                               |
| Saved stacks   | 28–35      | Capture defaults, unsaved buffers, creation, replacement, deletion, damaged definitions, layout                     |
| Architectures  | 36–42      | Catalog persistence, structure editing, previews, conflicts, deletion, layout                                       |

Checks 1–10 and 14 were recorded on September 13, 2026. Rerun them only if you
change the editor; they are not part of this gate.

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
[verification.md](verification.md) under a new dated heading. Only then may P10,
P11 and P12 be checked in the delivery checklist. Until that happens, the Git
backend is **implemented and covered by automated tests, but not desktop-accepted**,
and the documentation says so.
