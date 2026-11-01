# Offline sample

The sample lesson is a debug-only, offline playground for the lesson chat and Markdown/LaTeX
rendering. It opens with authored test content and a local mock provider, needs no credentials, and
sends no network request. It is sample data, not learner evidence.

## Sub-features

- `sample-open` opens the sample session from the home screen's overflow menu.
- `sample-render` shows the authored LaTeX, matrix and prose examples with the real lesson renderer.
- `sample-question` shows an authored question with authored answer options.
- `sample-notice` explains in-app that the content is test data with no network or credentials.
- `sample-isolation` adds no provider request: the responder log gains no `POST`.

## How to get to it (user POV)

- On the home screen, open the overflow menu (`More options`) and choose `Sample lesson`.
- The same menu offers `Sample graph` and `Style reference`; both are debug-only too.

## Driving it with verify-reasoned

Preconditions:

- `verify.mjs` in this file means
  `node .opencode/skills/verify-reasoned/helpers/verify.mjs` run from the repository root.
- `verify.mjs launch` succeeded with the default stub responder. The responder only has to be
  running as the baseline; the sample must not use it.
- `doctor` passes, and the app is on the home screen.
- Note the current count of `POST` lines in `stub.log` (zero right after a fresh launch). The
  sample must not increase it.

- **Open the menu.** Run `verify.mjs tap --desc "More options"` and
  `verify.mjs dump --label overflow`. The dump lists `Sample lesson`, `Sample graph` and
  `Style reference`.
- **Open the sample.** Run `verify.mjs tap --text "Sample lesson"` and
  `verify.mjs wait --text "Sample session · offline"`.
- **Confirm authored content.** Run `verify.mjs dump --label sample-open`.
  The toolbar reads `Sample session · offline`, `lesson_status` reads `Prober` with `Waiting for
  your answer`, a transcript row starts with `Display math: fractions, sums, matrices and multiple
  lines` and contains `\frac`, `\sum` and `\begin{pmatrix}`, and the question row asks `At x = 3,
  which direction reduces f(x) = x² for a small step?` with authored options including `Left,
  toward zero.`
- **Confirm it is offline.** Run `verify.mjs tap --id session_context` and
  `verify.mjs dump --label sample-notice`. The dialog `Sample session · offline` says `Authored
  test content using the real chat and learning runtime. Responses are generated locally by a mock
  provider: no network, credentials, billing or knowledge-graph extraction. The sample uses a
  separate in-memory database and restores locally without starting a request.` Close it with
  `verify.mjs tap --text "OK"`.
- **Confirm no provider traffic.** Run `verify.mjs dump --label sample-final`; `session_model`
  reads `sample-offline`. Run `verify.mjs status`; the responder log still holds the same number of
  `POST` lines as before the sample opened, and no new `POST` was added by this journey.
- **Proof.** Run `verify.mjs shot --label sample-lesson` (this screen is not `FLAG_SECURE`; the
  screenshot shows the authored LaTeX and the question) and `verify.mjs status`.

## Gotchas

- Debug builds only. `graph_sample_lesson` is inflated from `res/menu/home_debug.xml` behind
  `BuildConfig.DEBUG`, and release builds strip the sample. A release APK has no entry point, so do
  not record a release run of this feature as covered.
- The sample is sample data, not learner evidence. Never cite its transcript, its graph or its
  questions as proof that a learner learned something, and never treat `Sample graph` nodes as
  extracted knowledge. Say plainly in the report that this is authored test content.
- It uses a separate in-memory database and a mock provider, so it proves rendering, navigation and
  the question UI. It proves nothing about provider transport, credentials or request shaping.
- Because no request is sent, an unchanged `POST` count is the expected side effect. A new `POST`
  line during this journey means the sample leaked into the real runtime.
- The overflow menu is `More options` with an empty `text` attribute; match it by content
  description.
- The sample session's model button is disabled and reads `sample-offline`; that is the marker that
  this is not a configured connection.
