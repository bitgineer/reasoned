# Provider setup

Provider setup lets a learner choose where model requests go, store an API key, point the app at a
custom OpenAI-compatible endpoint, mark that endpoint keyless, and choose the model a session will
use. Nothing contacts a provider until a model is refreshed or a session starts.

## Sub-features

- `provider-open` opens Providers and models from Settings and shows the saved connection.
- `provider-choose` changes the connection and updates the provider button.
- `key-save` stores a syntactically valid API key and reports it as saved.
- `custom-endpoint` saves a custom base URL and shows the custom fields.
- `custom-keyless` marks the endpoint keyless; the key note turns optional when the endpoint is
  saved.
- `model-refresh-pick` lists models from the endpoint and saves the picked model id.

## How to get to it (user POV)

- Open the navigation drawer, choose `Settings`, then `Providers & models`.
- From a new session, choose `Connection settings`.
- On the provider screen, choose the provider button, then pick a provider from the dialog
  (scroll the dialog list to reach `Custom endpoint`).

## Driving it with verify-reasoned

Preconditions:

- `verify.mjs` in this file means
  `node .opencode/skills/verify-reasoned/helpers/verify.mjs` run from the repository root.
- `verify.mjs launch` succeeded with the default stub responder.
- `doctor` prints `doctor: all checks passed`.
- App data was cleared by `launch`, so the provider is `OpenAI`, no key is stored and no model is
  chosen.

- **Open the screen.** Open the drawer and Settings. Run
  `verify.mjs tap --desc "Open navigation"`, `verify.mjs tap --text "Settings"`,
  `verify.mjs tap --id settings_providers`.
  `verify.mjs dump --label providers-open` shows `runtime_provider` = `Provider: OpenAI`,
  `runtime_model` = `Choose a model` and `runtime_setup_status` = `No API key saved.`
- **Save a key.** Type a syntactically valid key and save it. Run
  `verify.mjs type --id runtime_key "verify-reasoned-dummy-key-0001"` and
  `verify.mjs tap --id runtime_save_key`.
  `verify.mjs dump --label key-saved` shows `runtime_setup_status` = `Saved securely on this
  device.` and `runtime_key` empty again.
- **Choose the custom provider.** Run `verify.mjs tap --id runtime_provider`, then
  `verify.mjs tap --text "Custom endpoint" --scroll 3`.
  `verify.mjs dump --label provider-custom` shows `runtime_provider` = `Provider: Custom endpoint`
  and the `runtime_custom_url`, `runtime_custom_keyless` and `runtime_custom_save` nodes.
- **Mark it keyless.** Run `verify.mjs tap --id runtime_custom_keyless` and
  `verify.mjs dump --label keyless`. That dump shows the `runtime_custom_keyless` node with
  `checked="true"`, and `runtime_key_note` still reads `Stored encrypted on this device. Requests go
  to this provider with this key; the app cannot verify a key until a request fails.` Ticking the
  box does not rewrite the note by itself; the next step proves where it changes.
- **Save the endpoint.** Type the local base URL and save it. Run
  `verify.mjs type --id runtime_custom_url "http://localhost:8765/v1"` and
  `verify.mjs tap --id runtime_custom_save`.
  `verify.mjs dump --label endpoint-saved` is the dump that proves the note changed: it shows
  `runtime_key_note` = `Optional. This endpoint is marked keyless, so no key is sent.` and
  `runtime_custom_keyless` still `checked="true"`, with `runtime_custom_url` as typed. The URL is
  accepted because the network security config allows cleartext for `localhost`, `127.0.0.1` and
  `10.0.2.2` only.
- **Refresh and pick a model.** Run `verify.mjs tap --id runtime_model --scroll 2`.
  A dialog titled `Model` lists `stub-teach` from `GET /v1/models`. Run
  `verify.mjs tap --text "stub-teach"`.
  `verify.mjs dump --label model-selected` shows `runtime_model` = `stub-teach`.
- **Reach the status line.** The confirmation sits below the fold. Run
  `verify.mjs scroll --times 1` and `verify.mjs dump --label provider-setup-bottom`.
  That dump shows `runtime_setup_status` = `Saved.` together with `runtime_model` = `stub-teach`.
- **Proof.** Run `verify.mjs shot --label provider-setup`. The app content of that screenshot is
  black because the screen sets `FLAG_SECURE`; only the system status and navigation bars render.
  The dump carries the proof, and `stub.log` holds only its `LISTEN` line and `GET /v1/models`
  lines, with no chat completion, because nothing has started a session.
- **Downstream check.** The Providers and models screen has no navigation drawer, so leave it with
  the system BACK key. Run `verify.mjs back` and `verify.mjs dump --label back-at-settings`: that
  dump shows the `Settings` list (`settings_providers` present, no `Open navigation`). Run
  `verify.mjs back` again and `verify.mjs dump --label back-at-home`: that dump shows
  `graph_search_open`. Then run `verify.mjs tap --desc "Open navigation"`,
  `verify.mjs tap --text "New session"`, `verify.mjs wait --id session_connection` and
  `verify.mjs dump --label downstream-new-session`. `session_connection` reads
  `Custom endpoint · stub-teach` and `runtime_start` is enabled. That proves the saved connection
  and model reach session creation.

## Gotchas

- The screen sets `FLAG_SECURE` in `onShown`, so every screenshot of it is black. Use the dump.
  Expect the same for any screenshot taken between opening the screen and leaving it.
- The page is a long `ScrollView`. `runtime_model` and `runtime_setup_status` are below the fold
  once the custom fields appear; pass `--scroll 2` and dump again after scrolling.
- The provider dialog is itself a scrollable list of every registry provider. `Custom endpoint` is
  at the bottom, so `--scroll 3` is the reliable way to reach it; the helper stops at the first
  match.
- `runtime_setup_status` is a transient status line. Saving the endpoint writes `Saved.`; picking a
  model writes `Saved.` again. Dump immediately after the action, and do not treat an older dump as
  current.
- A registry provider rejects an empty key; the custom endpoint accepts one only when the keyless
  box is ticked. The key is stored through the app's credential store, never displayed again.
- `Save endpoint` validates the URL locally. Its field hint and the acceptance rule agree:
  `http://` is allowed only for `localhost`, `127.0.0.1` and `10.0.2.2`; any other cleartext host
  fails with a field error.
- The model list for the custom endpoint comes from the endpoint itself. If the responder is not
  running, the dialog falls back to `Enter model ID` with an error message; that is a failed
  precondition, not a pass.
