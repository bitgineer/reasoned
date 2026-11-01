# Lesson session

A lesson session takes a learning goal, probes what the learner already knows, presents a
dependency plan for approval, then teaches with prediction and check questions until the model ends
the session. The session ends with an explicit "not a mastery certification" line.

## Sub-features

- `session-start` creates a session from a goal and shows the prober's first question.
- `session-probe` records a multiple-choice probe answer and the resulting assessment.
- `session-plan` presents the dependency plan and approves it.
- `session-predict` asks the prediction question and records the answer as correct.
- `session-check` reveals, answers and grades the check question.
- `session-finish` ends the session and reports the closing status.

## How to get to it (user POV)

- Open the navigation drawer, choose `New session`, type a learning goal, and choose `Start
  session`.
- Reopen an existing session from the drawer's `Recent sessions` list.

## Driving it with verify-reasoned

Preconditions:

- `verify.mjs` in this file means
  `node .opencode/skills/verify-reasoned/helpers/verify.mjs` run from the repository root.
- `verify.mjs launch` succeeded with the default stub responder and `doctor` passes.
- The saved connection is `Custom endpoint · stub-teach` (see `provider-setup.md`), or the stub is
  reachable through any configured connection.
- The responder log has no `POST` lines yet, so the six `POST` lines can only come from this journey.

- **Start the session.** If the previous journey left you on Providers and models, leave it before
  opening the drawer: run `verify.mjs back` twice to go Providers and models → `Settings` → home.
  The drawer handle `Open navigation` exists only on the home screen. From home run
  `verify.mjs tap --desc "Open navigation"`, `verify.mjs tap --text "New session"`,
  `verify.mjs wait --id session_connection`, `verify.mjs dump --label new-session`.
  `session_connection` reads `Custom endpoint · stub-teach`.
- **Enter the goal.** Run `verify.mjs type --id runtime_goal "Learn how reassignment works"` and
  `verify.mjs tap --id runtime_start`.
  `verify.mjs wait --text "When you reassign a variable" --contains` resolves, and
  `verify.mjs dump --label probe` shows `lesson_status` = `Prober` with `Waiting for your answer`,
  the question in `question_text`, and options `It is kept` and `It is replaced`. There is no
  `answered_question` row on this screen; that id appears only after the answer is submitted.
  `composer_action` has an empty `text` attribute, so it does not appear in the dump's row list.
  Locate it by `--id composer_action`.
- **Answer the probe.** Run `verify.mjs tap --text "It is replaced"` and then
  `verify.mjs tap --id composer_action`.
  `verify.mjs wait --text "Review the plan." --contains` and
  `verify.mjs dump --label plan` show `lesson_status` = `Review the plan. Request changes below, or
  approve to start teaching.`, the chosen answer `✓  It is replaced` as a plain `TextView` (empty
  `resource-id`, `content-desc` = `Correct answer: It is replaced`), the
  `PROBE CONCLUDED — YOUR ASSESSMENT` block, and `composer_action` labelled `Approve plan`.
  `answered_question` is not on this screen.
- **Approve the plan.** Run `verify.mjs tap --id composer_action`.
  `verify.mjs wait --text "Your prediction"` and `verify.mjs dump --label predict` show
  `lesson_status` = `Teacher` with `Waiting for your answer`, the `Your prediction` heading, the
  prediction question `If two names refer to the same list, does a change through one show through
  the other?` in `question_text`, the options `Yes` and `No`, and `composer_action` labelled
  `Submit answer`. That screen is what proves approval: the app left the plan screen and started
  teaching. Do not assert the probe answer here. The transcript follows the new reply toward its
  bottom, so the probe's `answered_question` row is often scrolled out of view and absent from the
  dump, and whether it appears depends on how far the list had scrolled; the prediction question is
  the stable assertion (see Gotchas).
- **Answer the prediction.** Run `verify.mjs tap --text "Yes"` and
  `verify.mjs tap --id composer_action`.
  `verify.mjs wait --text "Check your understanding"` and
  `verify.mjs dump --label check-collapsed` show the check question collapsed behind the
  `reveal_question` button, the `PREDICT · CORRECT` record whose `answered_question` is the
  prediction question, and a reading-notes field.
- **Reveal and answer the check.** Run `verify.mjs tap --id reveal_question`,
  `verify.mjs dump --label check-open`, `verify.mjs tap --text "It clears both"` and
  `verify.mjs tap --id composer_action`.
  `verify.mjs wait --text "Session ended. Not a mastery certification." --timeout 90` resolves,
  and `verify.mjs dump --label complete` shows that exact `lesson_status`, the `CHECK · CORRECT`
  record and the closing summary `Covered reassignment and shared references. Still uncertain: when
  copying is the right fix.` `composer_action` reads `Start`, and a completed session has no send
  action left.
- **Proof.** Run `verify.mjs shot --label lesson-complete`, `verify.mjs status`,
  `verify.mjs logcat`, and open `stub.log`. A run that launches, runs `doctor` once and refreshes
  models once ends with ten lines: one `LISTEN`, three `GET /v1/models` and six
  `POST /v1/chat/completions` lines. Assert the six `POST` lines, not the total, because extra
  `GET` lines are harmless. The six carry `reply=probe note=probe phase start`,
  `reply=finish_probe note=assessment`, `reply=plan_init note=plan`,
  `reply=quiz note=predict quiz`, `reply=quiz note=check quiz`, `reply=finish_lesson note=finish`.
- **Persistence.** Run `verify.mjs back`, `verify.mjs tap --desc "Open navigation"`,
  `verify.mjs dump --label drawer-after-complete`, then
  `verify.mjs tap --text "Learn how reassignment works"` and
  `verify.mjs wait --text "Session ended. Not a mastery certification." --timeout 30`.
  The reopened transcript and status are unchanged, and `stub.log` still holds the same six `POST`
  lines: reopening a session never starts a request.

## Gotchas

- `composer_action` is an icon-only button for `Send` and `Submit answer`; its `text` attribute is
  empty and its label lives in `content-desc`. Locate it by `--id composer_action`, and never treat
  an empty text as a missing button.
- The probe question opens expanded. The check question opens collapsed behind
  `Check your understanding` (`reveal_question`); the options do not exist in the dump until it is
  tapped.
- The transcript follows each new reply toward its bottom, and a dump holds only what is on screen,
  so a previously answered row may be present or scrolled out of view: the probe answer was absent
  from one run's `predict` dump and visible in another. The harness only scrolls down, and it offers
  no up-scroll, so an offscreen row cannot be asserted through it. Assert an answer on a step whose
  dump has room for it (the `check-collapsed` dump carries the prediction's `PREDICT · CORRECT` row)
  and treat a missing `answered_question` as scroll position, not lost state.
- Selecting an option is what enables submission. A disabled `composer_action` before selecting is
  correct behavior, so the harness fails a `tap` on a disabled node by design.
- Tapping `Approve plan` with text in the composer sends a change request instead of approving. The
  composer must be empty; do not type into it on the plan screen.
- The plan is rendered as a Mermaid diagram row (`Mermaid diagram`). Diagram rendering is off the
  proof path; the `lesson_status` and the assessment block are the assertions.
- The stub's script is keyed on the last assistant tool call, so it expects exactly one answer per
  question. Do not double-tap `Submit answer`: send one answer per step and wait for the next
  question.
- Reopening the session must not start a request: the app only continues on explicit input. If
  `stub.log` grows after a reopen, that is a regression, not a retry.
- The drawer's session list grows with every run. Match the session title you created, not the list
  position.
