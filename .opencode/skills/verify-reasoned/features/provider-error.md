# Provider error

When a provider rejects a request because of one request field, the app names that field and tells
the learner what to change. The regression this guards against is a bare `invalid_request` that
leaves the learner with nothing to act on.

## Sub-features

- `error-field` shows `The provider rejected the request field "max_tokens". Change that setting or
  choose another model.` when the provider answers 400 with `error.param`.
- `error-log` records `invalid_request 400 field max_tokens` under the `ReasonedRuntime` log tag.
- `error-retry` keeps the message after an explicit retry, which sends the request again.

## How to get to it (user POV)

- Configure a provider that is reachable but rejects the request, then start a session with a goal.
- On the failed session, press `Retry`.

## Driving it with verify-reasoned

Preconditions:

- `verify.mjs` in this file means
  `node .opencode/skills/verify-reasoned/helpers/verify.mjs` run from the repository root.
- `verify.mjs launch --responder error` succeeded. That responder serves `GET /v1/models` with
  `stub-teach` and answers every `POST /v1/chat/completions` with
  `400 {"error":{"message":"This endpoint does not accept that request field.","type":"invalid_request_error","param":"max_tokens"}}`.
  It is the only mock, and it sits behind the app's existing provider boundary.
- `doctor` prints `doctor: all checks passed`.
- The device log is cleared with `adb -s emulator-5554 logcat -c` right after launch, so the
  `invalid_request` line can only come from this request.
- The custom endpoint is saved as `http://localhost:8765/v1`, keyless, with model `stub-teach`
  (see `provider-setup.md` for the exact steps).

- **Start a session.** If the previous journey left you on Providers and models, run
  `verify.mjs back` twice to go Providers and models → `Settings` → home; `Open navigation` exists
  only on the home screen. Then run `verify.mjs tap --desc "Open navigation"`,
  `verify.mjs tap --text "New session"`, `verify.mjs wait --id session_connection`,
  `verify.mjs type --id runtime_goal "Rejected field probe"`, `verify.mjs tap --id runtime_start`.
- **Observe the named field.** Run
  `verify.mjs wait --text 'The provider rejected the request field "max_tokens". Change that setting or choose another model.' --timeout 60`.
  It resolves on the session screen, and `verify.mjs dump --label provider-error` shows that exact
  string in `lesson_status`, with `composer_action` labelled `Retry`.
- **Observe the runtime evidence.** Run `verify.mjs logcat`. `logcat-ReasonedRuntime.txt` contains
  `invalid_request 400 field max_tokens`, and `error-responder.log` contains
  `POST /v1/chat/completions 400 model=stub-teach ... error={"type":"invalid_request_error","param":"max_tokens"}`.
- **Retry.** Run `verify.mjs tap --id composer_action`, then
  `verify.mjs wait --text "max_tokens" --contains --timeout 60`.
  The message is still there, and `error-responder.log` gains a second identical 400 line.
- **Proof.** Run `verify.mjs shot --label provider-error` (this screen is not `FLAG_SECURE`, so the
  screenshot shows the message), `verify.mjs dump --label provider-error-retry` and
  `verify.mjs status`.

## Gotchas

- The message contains double quotes. In PowerShell pass the expected text in single quotes, exactly
  as written above, or the match fails on the quotes rather than on the app.
- uiautomator quotes an attribute with single quotes when its value contains a double quote. A
  parser that only reads `text="..."` silently sees an empty string here, which looks like the app
  failing to render. Use the helper's parser, which reads both quote styles.
- The failure lands on the first turn, so there is no transcript content beyond the goal. The
  `lesson_status` line is the whole user-visible proof; do not expect an error card in the list.
- `Retry` sends another request immediately. Two identical 400 lines in the responder log are the
  expected side effect, not a double fire.
- Code path, not exercised by this run: a 400 whose body has no `error` object maps to plain
  `invalid_request`, and `RuntimeErrors.kt` renders `Request stopped (invalid_request). ...` for it.
  Seeing that string means the field extraction regressed.
- The provider screen itself is `FLAG_SECURE`; only the session screen can be screenshotted. A black
  screenshot here means the session screen was left and the provider screen was captured.
- The custom endpoint must be reachable through `adb reverse tcp:8765 tcp:8765`. Without the
  reverse, the failure is `network` and no 400 ever reaches the log.
