---
name: verify-reasoned
description: Drive the Reasoned Android app on a disposable emulator to prove user-facing behavior (provider setup, a full lesson session, provider 400 field naming, and the offline sample lesson) with scripted adb/uiautomator helpers, captured evidence, and cleanup. Use before claiming an Android UI change works.
---

# Verify Reasoned

Reasoned is a native Android app. The surface a user touches is the app's own activity: package
`com.kkgosu.reasoned.debug`, single activity `com.kkgosu.reasoned.MainActivity`, AppKit platform
fragments, XML views, no web view wrapper. There is no URL to open and no CLI. The only honest way
to verify it is to install the debug APK on an emulator and drive the real views.

Everything below is literal and runnable from the repository root. `verify.mjs` is the only entry
point; it owns the run, the device, the responder, and the evidence directory.

## Isolation

The run owns exactly three things, and refuses to start if any of them is already in use:

- AVD `reasoned_qa` (API 36, google_apis x86_64), booted headless as serial `emulator-5554`.
- One local responder on `127.0.0.1:8765`, reached from the device through
  `adb reverse tcp:8765 tcp:8765`.
- A lock file, `.opencode/verification/active.json`, with the run directory, serial, responder PID
  and port.

`launch` refuses (exit 1, nothing started) when the lock still has a live responder or a live
device, when the responder port already answers, or when `emulator-5554` is already online. Never
drive a device another run booted, and never tap a coordinate you did not read from a dump in this
run. Run `cleanup` first when `launch` complains.

Every run starts from an empty app data directory (`pm clear`) and installs the freshly built
debug APK, so migrations, first-run state and default preferences are exercised as a user would
meet them.

## Launch

```powershell
node .opencode/skills/verify-reasoned/helpers/verify.mjs launch
```

That one command, in order:

1. Refuses a double-drive (see Isolation).
2. Creates `.opencode/verification/<UTC stamp>/` with `ui/` and `screens/`, so the build attempts and
   every later helper command have somewhere to be recorded.
3. Builds `:app:assembleDebug` with `JAVA_HOME=C:\Program Files\Android\Android Studio\jbr` and
   `--offline`. If that attempt fails it retries once without `--offline`, logs both attempts in
   `commands.log`, and still requires `BUILD SUCCESSFUL` plus
   `app\build\outputs\apk\debug\app-debug.apk` on disk.
4. Boots the AVD with `-no-window -no-audio -no-boot-anim -gpu swiftshader_indirect
   -no-snapshot-load -no-snapshot-save -port 5554` and waits for `sys.boot_completed=1`.
5. Starts the responder and waits for `GET /v1/models` to answer on `127.0.0.1:8765`:
   - default: `node scripts/local-provider-stub.mjs 8765`, the repo's six-call teaching script;
   - `--responder error`: `helpers/error-responder.mjs 8765`, which lists the same model and
     answers chat completions with HTTP 400 `{"error":{"param":"max_tokens"}}`.
6. Installs the APK, runs `pm clear com.kkgosu.reasoned.debug`, adds the adb reverse, starts the
   activity, and dumps the hierarchy until the home screen's `graph_search_open` node exists.
7. Writes `run.json` (see Evidence) with the run identity, the device, the APK and the responder.

Ready means: `sys.boot_completed` is `1`, the app process is running, and a uiautomator dump shows
the app's home screen. `launch` prints `PASS run ready on emulator-5554 (versionName ..., home
x,y)` and the evidence path only after all of that.

Variants:

```powershell
node .opencode/skills/verify-reasoned/helpers/verify.mjs launch --skip-build      # reuse the APK
node .opencode/skills/verify-reasoned/helpers/verify.mjs launch --responder error # 400 responder
```

Teardown is `cleanup` (see Cleanup). Launching twice without cleanup is refused, not merged.

## Doctor

```powershell
node .opencode/skills/verify-reasoned/helpers/verify.mjs doctor
```

Read-only. Run it first whenever a drive misbehaves. It prints one PASS/FAIL line per check and
exits non-zero if any fails:

- `emulator-5554` is online and `sys.boot_completed=1`.
- `com.kkgosu.reasoned.debug` is installed and its `versionName` equals `versionName` in
  `app/build.gradle`, so a stale APK is caught.
- The app process is running, and the current hierarchy belongs to the debug package.
- `adb reverse tcp:8765` is present.
- The responder process recorded in the lock is alive and answers `GET /v1/models` with 200; the
  stub is additionally required to offer `stub-teach`.
- The app UI is on screen (`graph_search_open` or the app title).

## Drive

Handles come from `uiautomator dump`. Never use pixel coordinates in a recipe: `tap` and `type`
resolve a node from a fresh dump, derive the tap point from its bounds, and print what they hit.

```powershell
$V = ".opencode/skills/verify-reasoned/helpers/verify.mjs"
node $V dump  --label home         # save ui/<n>-home.xml, print "text id=x,y" rows
node $V find  --id lesson_status   # print text, enabled, checked and centre
node $V tap   --id settings_providers
node $V tap   --text "Providers & models" --contains
node $V tap   --desc "Open navigation"
node $V tap   --text "Custom endpoint" --scroll 3   # swipe up to 3 times to find it
node $V type  --id runtime_goal "Learn how reassignment works"
node $V wait  --text "Session ended. Not a mastery certification." --timeout 90
node $V scroll --times 1           # move down one screen
node $V back                       # system BACK, one step up the fragment stack
node $V shot  --label lesson-complete
node $V status                     # lesson_status / setup status + responder log tail
node $V logcat                     # save logcat -s ReasonedRuntime
```

`dump` prints only nodes that carry text. Icon-only controls such as `composer_action`,
`session_context` and the toolbar buttons have an empty `text` and a meaningful `content-desc`;
reach them by `--id` or `--desc`, and use `find` when their `enabled` or `checked` state is part of
the proof.

Rules that keep a drive honest:

- One action, then a dump or `wait`. The app renders from a state flow; asserting on the previous
  frame proves nothing.
- `tap` fails if the node is disabled, so a disabled `composer_action` is a real signal, not a bug
  in the harness. Select an answer first.
- `type` focuses the field, sends `input text` (spaces as `%s`), then presses ESC to close the
  keyboard. Typed values cannot contain a single quote; the helper rejects it instead of guessing.
- `--scroll N` swipes up to N times before giving up. Use it for anything below the fold on the
  provider page and inside the provider list dialog.
- `scroll --times N` accepts a whole number from 1 up. `0`, a negative number or a non-number exits 1
  with the accepted range instead of doing nothing.
- The drawer handle `Open navigation` exists on the home screen only. From Providers and models,
  `back` returns to `Settings` and a second `back` returns home. A `tap --desc "Open navigation"`
  on either screen fails, because the view is not in the hierarchy.
- Screenshots on the provider screen show black app content: `ProviderSettingsFragment.onShown`
  sets `FLAG_SECURE`, so only the system status and navigation bars render. That screen's proof is
  its UI dump, and `features/provider-setup.md` says so.
- A node that is clipped by the toolbar (for example `session_connection` after the keyboard
  scrolled the form) is absent from the dump. Dump before typing if a top-of-form value is part of
  the proof.

Stable handles observed on this app (resource ids, without the package prefix):

| Screen | Handles |
| --- | --- |
| Home | `graph_search_open`, `graph_loading`, `drawer_new_session`, `drawer_graph`, `drawer_settings`, `drawer_status` |
| Providers and models | `runtime_provider`, `runtime_key`, `runtime_key_note`, `runtime_save_key`, `runtime_forget_key`, `runtime_custom_url`, `runtime_custom_keyless`, `runtime_custom_save`, `runtime_model`, `runtime_setup_status` |
| New session | `session_connection`, `runtime_goal`, `runtime_start`, `session_create_status` |
| Learning session | `lesson_status`, `question_text`, `question_options` (dynamic), `question_dont_know`, `question_reading_thinking`, `question_thinking`, `reveal_question`, `composer_action`, `session_model` |

Answer options are dynamic views with no ids. Tap them by their authored label text, for example
`tap --text "It is replaced"`.

## Evidence

Each run writes `.opencode/verification/<UTC stamp>/`:

- `run.json`, written by `launch` once the home screen is up: `runId` (the directory stamp),
  `startedAt` (UTC), `serial`, `avd`, `apk` (repository-relative path), `versionName`,
  `responder.kind`, `responder.pid`, `port` and `reverse` (the rule added on the device). It holds
  no key, token or credential.
- `cleanup.json`, written by `cleanup`: what was stopped and what survived.
- `commands.log`: one timestamped line per helper invocation, appended when the invocation returns,
  so the order matches what happened. Success reads `ok <command> <options> :: <result>`; failure
  reads `fail exit=1 <command> <options> :: <reason>`, including failed taps, timeouts and bad
  arguments. A `type` into a field whose id, label or description names a key or password logs the
  typed value as `<redacted>`, in the invocation and the result, so a credential typed by hand never
  reaches the evidence directory. `launch` adds `info` lines for sub-steps that are not helper
  commands, such as each build attempt. A `launch` refusal that happens before the run directory
  exists prints to the console only.
- `ui/NNN-<label>.xml`: the raw uiautomator hierarchy per step. This is the primary proof.
- `screens/<label>.png`: `adb exec-out screencap -p` for each requested screen. The provider screen
  renders black app content because of `FLAG_SECURE`; its dump is the proof.
- `stub.log` or `error-responder.log`: the responder's own request log, the side-effect proof.
- `logcat-ReasonedRuntime.txt`: `adb logcat -d -s ReasonedRuntime`.
- `emulator.log`: boot output.

Proof standards:

- Exercise the real user path: tap the same controls a learner taps. No internal setters, no test
  endpoints, no `am broadcast` shortcuts.
- Capture the action and the resulting state. A dump of the end state alone cannot show that the
  control caused it; keep the intermediate dumps too.
- Verify the side effect, not just the screen. Six model calls must appear in `stub.log` as six
  `POST /v1/chat/completions` lines with the expected `note=`. The same log also carries `LISTEN` and
  `GET /v1/models` lines, so count the `POST` lines rather than the total. A 400 must appear as a
  `400 ... param=max_tokens` line in `error-responder.log` and as
  `invalid_request 400 field max_tokens` in logcat.
- The responder is a stand-in for a provider behind the app's existing `ModelProvider` boundary.
  That is the only mock in scope. Never add a mock inside the app for a verification run.
- Assert exact strings. The end states this skill relies on are:
  - `runtime_provider` = `Provider: Custom endpoint`
  - `runtime_key_note` = `Optional. This endpoint is marked keyless, so no key is sent.`
  - `runtime_model` = `stub-teach`
  - `runtime_setup_status` = `Saved.`
  - `lesson_status` = `Session ended. Not a mastery certification.`
  - `lesson_status` = `The provider rejected the request field "max_tokens". Change that setting or choose another model.`
  - sample session title = `Sample session · offline`

Do not delete a run directory. `cleanup` stops processes and devices and leaves the evidence where
it is; `report` lists it afterwards.

## Cleanup

```powershell
node .opencode/skills/verify-reasoned/helpers/verify.mjs cleanup
node .opencode/skills/verify-reasoned/helpers/verify.mjs report --run .opencode/verification/<stamp>
```

`cleanup` stops only what the lock says this run started:

- the responder, by recorded PID (`taskkill /PID <pid> /T /F`), never by process name;
- `adb -s emulator-5554 reverse --remove tcp:8765`;
- the emulator, by the device this run booted (`adb -s emulator-5554 emu kill`), and it waits until
  the serial disappears.

It writes `cleanup.json` into the run directory, removes `active.json`, and fails loudly if the
responder or the emulator survived. It never touches the run directory's contents.

If `launch` or a drive failed midway, run `cleanup` anyway before trying again; a stranded
responder or emulator is exactly what the next `launch` refuses.

## Helpers

All helpers are dependency-free Node ESM and live next to this file. Invocations are shown in the
sections above; the shapes are:

- `helpers/verify.mjs <command> [options]`: the CLI used by every recipe.
  Commands: `launch`, `doctor`, `start`, `reset`, `dump`, `find`, `tap`, `type`, `wait`, `back`,
  `scroll`, `shot`, `status`, `logcat`, `cleanup`, `report`.
  Common options: `--text <value>`, `--id <resource-id>`, `--desc <content-desc>`,
  `--contains`, `--scroll <n>`, `--label <name>`, `--timeout <seconds>`.
  `launch` options: `--responder stub|error`, `--port <n>`, `--avd <name>`, `--emulator-port <n>`,
  `--skip-build`.
- `helpers/adb.mjs`: adb/emulator primitives, the uiautomator XML parser, and the tap/type
  helpers. Imported by `verify.mjs`; you do not call it directly. It reads both `"` and `'`
  attribute quoting, because uiautomator switches to single quotes when a value contains a double
  quote.
- `helpers/error-responder.mjs <port>`: HTTP 400 responder for `features/provider-error.md`.
  Serves `GET /v1/models` with `stub-teach` and answers every chat completion with
  `400 {"error":{"message":...,"type":"invalid_request_error","param":"max_tokens"}}`. Set
  `REASONED_REJECTED_FIELD` to reject a different field without editing the file.

## Feature map

`features/README.md` is the index. Each file follows the same four sections and pairs a user action
with an exact command and an observable result. Read the index before driving; use the matching
file as the recipe. If a journey cannot run, its file records the reason under `Gotchas` and the
run reports a failure. Do not weaken a journey to make it pass, and do not report a skipped entry
point as verified through another one.

Keep the map current with `/pstack/maintain-verification-skill` after UI changes.
