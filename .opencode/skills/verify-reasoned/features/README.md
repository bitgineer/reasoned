# Reasoned verification map

This directory is the maintained source for verifying the user-facing behavior of Reasoned. Read
this index before driving the app, then use the matching feature file as the recipe.

Reasoned is a native Android app, so every recipe runs on the emulator that `launch` boots, through
`helpers/verify.mjs`. There is no browser, no CLI, and no hosted URL.

## Baseline preconditions

- Run everything from the repository root.
- `node .opencode/skills/verify-reasoned/helpers/verify.mjs launch` succeeded, for the responder the
  feature needs: `stub` (default) or `--responder error`.
- `doctor` prints `doctor: all checks passed`.
- The app data directory was cleared by `launch`, so the app starts with no provider, no model and
  no sessions.
- Only one run exists at a time. `launch` refuses to share `emulator-5554` or port 8765.
- Never drive a device this run did not boot.

## Driving conventions

- `verify.mjs <args>` in these files means
  `node .opencode/skills/verify-reasoned/helpers/verify.mjs <args>` run from the repository root.
- One action, then a dump or a `wait`. Read the result before the next action.
- Resolve every tap from a fresh dump through `tap --id`, `tap --text` or `tap --desc`. Never use
  a coordinate copied from an earlier dump.
- Treat every command as literal. Keep quoted text unchanged, including the typographic `·` and the
  straight quotes inside the provider error message.
- PowerShell: wrap values containing spaces in double quotes, and use single quotes when the value
  itself contains double quotes.
- The provider screen sets `FLAG_SECURE`, so its screenshots are black. Its proof is the UI dump.
- The drawer handle `Open navigation` exists only on the home screen. From Providers and models,
  `back` reaches `Settings` and a second `back` reaches home.
- Screenshots are evidence of layout; dumps and logs are evidence of behavior. Keep both.

## Proof and skip reporting

- Capture the action and the resulting state, not only the final screen.
- UI proof is a saved `ui/*.xml` dump whose node text is quoted in the report, plus a screenshot
  when the screen is not `FLAG_SECURE`.
- Side-effect proof is the responder log: `stub.log` for teaching turns, `error-responder.log` for
  the rejected-field case.
- Runtime proof for errors is `logcat-ReasonedRuntime.txt`.
- `run.json` names the run, device, APK version and responder; `commands.log` is the ordered record
  of every helper invocation, including failures and their exit code.
- Record the feature file and the entry point used with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition.
- Never report a skipped entry point as verified through a different one.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph of user-visible behavior. It then uses
exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line per behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with verify-reasoned` starts with `Preconditions:` and pairs each user action with
   an exact command and an observable result.
4. `Gotchas` lists traps that can waste or invalidate a run.

## Features

- [Provider setup](./provider-setup.md) covers choosing a provider, saving a key, saving a custom
  endpoint, ticking keyless, refreshing and picking a model.
- [Lesson session](./lesson-session.md) covers a full teaching session against the six-call stub,
  from goal to `finish_lesson`.
- [Provider error](./provider-error.md) covers a 400 that names the rejected field instead of a
  bare `invalid_request`.
- [Offline sample](./offline-sample.md) covers the debug-only sample lesson that needs no
  credentials.
