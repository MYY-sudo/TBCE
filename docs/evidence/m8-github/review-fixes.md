# GitHub integration review fixes

The seven findings in `.verification/review/review.md` are addressed in the working tree. Existing staged work was preserved; these fixes were not staged or committed.

- Account operations invalidate pending repository reads, release the data loading flag, and prevent new reads until the account operation finishes. Invalidated refreshes stop before issuing subsequent requests. Local remote detection has its own request counter.
- Workspace changes preserve the account operation lock. Successful disconnect, replacement authentication, and signed-out account validation clear repository data.
- A 401 during repository, branch, commit, or activity reads clears the backend credential and conditional cache. The frontend clears repository data and offers Connect account. A credential deletion failure retains the authentication error category and reports the cleanup failure without exposing the token.
- Only a 409 with GitHub's exact `Git Repository is empty.` message becomes an empty commits page. Other conflicts remain errors. The frontend retains readable overview data when commit loading fails and displays the failure.
- Watchers reads `subscribers_count`; a missing field remains unknown rather than falling back to stars.
- Focus refresh requires the sidebar to be visible, including when collapsed through either the GitHub navigation button or the toolbar toggle.
- Activity permission failures use the permission explanation. Network, timeout, rate-limit, server, and not-found failures retain their actual messages alongside the overview; authentication failures require reconnection. HTTP 429 is classified as a rate limit even without rate headers.

## Automated verification

Permanent coverage was added to `tests/github.test.ts`, `tests/github-panel.test.tsx`, `tests/app.test.tsx`, and the Rust GitHub module's tests.

| Check | Result |
| --- | --- |
| `npm.cmd test` | 168 passed across 13 files, including 22 new regressions |
| `npm.cmd test -- --config .verification/review.config.ts -t REVIEW` | All 6 preserved reproductions passed |
| `cargo test --locked --manifest-path src-tauri/Cargo.toml` | 110 passed, including 3 new tests and extended HTTP status coverage |
| `npm.cmd run lint` | Passed |
| `npm.cmd run typecheck` | Passed |
| `npm.cmd run format:check` | Passed |
| `cargo fmt --check --manifest-path src-tauri/Cargo.toml` | Passed |
| `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | Passed |
| `npm.cmd run build` | Passed; existing warning about chunks larger than 500 kB remains |
| `git diff --check` and `git diff --cached --check` | Passed |

Vitest initially could not resolve the project path inside the filesystem sandbox; the successful runs used elevated execution. The sandboxed Rust run passed 109 tests and failed the Windows vault round-trip with `ERROR_NO_SUCH_LOGON_SESSION`. The full Rust suite then passed outside the sandbox, including the vault test.

The frontend tests mock service adapters. Rust HTTP tests use a local fixture server; the vault round-trip uses a test credential. These checks do not constitute live authenticated GitHub or desktop UI acceptance.

## Computer-use retry

Discovery was retried in this session with a freshly initialized `@oai/sky` runtime. Both `sky.list_apps()` and `sky.list_windows()` returned:

```text
Computer Use native pipe is unavailable: failed to connect native pipe:
The system cannot find the file specified. (os error 2)
```

The browser computer-use interface returned `{"apps":[],"browsers":[]}`. A subsequent `cua.getBrowser({})` returned `No browser is available`.

No desktop UI actions, screenshots, layout inspection, native IPC acceptance flows, or live authenticated GitHub requests were completed. Desktop acceptance remains blocked until the native computer-use helper exposes a usable window. A browser connection alone would permit preview checks but would not verify Tauri IPC or the native credential flows.
