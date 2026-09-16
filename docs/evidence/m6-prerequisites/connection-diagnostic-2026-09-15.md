# Recurring Computer Use connection failure

## Confirmed observations

- The user reports Computer Use is enabled and the problem occurred previously.
- Global configuration has both `computer-use@openai-bundled` and
  `unified-computer-use@openai-bundled` enabled.
- The configured `node_repl` runtime imports `@oai/sky` successfully.
- `sky.list_windows()` still fails before window selection with:
  `Computer Use native pipe is unavailable: failed to connect native pipe: The system cannot find the file specified. (os error 2)`.
- Configuration explicitly sets `SKY_CUA_NATIVE_PIPE_DIRECTORY` to
  `\\.\pipe\codex-computer-use-26eb2f15-719a-4ef6-946e-c49088249f7f`.
- Read-only Windows pipe enumeration found that exact address immediately before
  the failing discovery call. This does not prove that the tool process uses or
  can access that address, or that the endpoint remains healthy.
- The running desktop executable is in the
  `OpenAI.Codex_26.908.4834.0_x64__2p2nqsd0c76g0` Windows package.
- The three newest desktop log files dated September 15 were empty. Older logs
  show the runtime starting successfully but do not establish this failure's cause.

## Conclusion and next discriminating check

This is not established to be a disabled setting, stale pipe address, permission
denial, or TBCE defect. Session/runtime connection mismatch is a hypothesis.
No helper was manually launched, no direct pipe protocol was used, and no global
configuration or app permissions were changed.

Open a fresh local chat in the desktop app and request only:

> Use Computer Use to list available windows. Do not click, type, or change anything.

If that succeeds, the failure is specific to the existing session or its runtime
configuration. Resume TBCE acceptance from `docs/milestone-6.md` in the working
session. If it fails identically, report the issue through the desktop app's
feedback flow with this diagnostic and the exact error. Fresh-chat success alone
does not complete any TBCE acceptance checkbox.
