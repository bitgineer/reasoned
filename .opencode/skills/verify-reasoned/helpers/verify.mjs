// verify-reasoned: launch, doctor, drive, evidence and cleanup for the Reasoned Android app.
// Run from the repository root: node .opencode/skills/verify-reasoned/helpers/verify.mjs <command>
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PACKAGE,
  adb,
  appPid,
  bootCompleted,
  bootEmulator,
  clearAppData,
  deviceOnline,
  dumpNodes,
  findNode,
  forwardReverse,
  install,
  installedVersion,
  key,
  logcat,
  removeReverse,
  requireTools,
  reverseList,
  screenSize,
  screenshot,
  sleep,
  startApp,
  swipe,
  tap,
  typeText,
  visibleText,
} from './adb.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..', '..');
const EVIDENCE_ROOT = join(REPO, '.opencode', 'verification');
const LOCK = join(EVIDENCE_ROOT, 'active.json');
const APK = join(REPO, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const STUB = join(REPO, 'scripts', 'local-provider-stub.mjs');
const ERROR_RESPONDER = join(HERE, 'error-responder.mjs');
const DEFAULT_AVD = 'reasoned_qa';
const DEFAULT_PORT = 8765;
const DEFAULT_EMULATOR_PORT = 5554;
const HOME_MARKER = 'graph_search_open';

function pass(message) {
  console.log(`PASS ${message}`);
}

class VerifyError extends Error {}

/** Every command failure throws, so the dispatcher can record its exit code before exiting. */
function fail(message) {
  throw new VerifyError(message);
}

let runLogDir = null;

function logPath() {
  return runLogDir;
}

/** One timestamped line for the invocation that just returned, success or failure. */
function logLine(line) {
  const dir = logPath();
  if (dir) appendFileSync(join(dir, 'commands.log'), `${new Date().toISOString()} ${line}\n`);
}

function info(message) {
  logLine(`info ${message}`);
}

/** Typed values for credential fields must never reach commands.log or the console. */
const SECRET_FIELD = /key|password/i;
const secrets = new Set();

function secretTarget(value) {
  return value ? SECRET_FIELD.test(String(value)) : false;
}

function redact(text) {
  let out = String(text);
  for (const secret of secrets) if (secret) out = out.split(secret).join('<redacted>');
  return out;
}

function flags(argv) {
  const args = [];
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith('--')) {
      args.push(value);
      continue;
    }
    const name = value.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) options[name] = true;
    else {
      options[name] = next;
      i += 1;
    }
  }
  return { args, options };
}

function readLock() {
  return existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, 'utf8')) : null;
}

function writeLock(state) {
  mkdirSync(EVIDENCE_ROOT, { recursive: true });
  writeFileSync(LOCK, `${JSON.stringify(state, null, 2)}\n`);
}

function clearLock() {
  if (existsSync(LOCK)) unlinkSync(LOCK);
}

function needRun() {
  const state = readLock();
  if (!state) fail('No active run. Run launch first.');
  return state;
}

function processAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

async function portAnswers(port, path = '/v1/models') {
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      signal: AbortSignal.timeout(2000),
      headers: { connection: 'close' },
    });
    return { status: response.status, body: await response.text() };
  } catch {
    return null;
  }
}

function buildApk() {
  console.log('building :app:assembleDebug');
  const attempts = [];
  for (const offline of [true, false]) {
    const result = gradleBuild(offline);
    const label = offline
      ? 'build :app:assembleDebug --offline'
      : 'build :app:assembleDebug (retry without --offline)';
    info(`${label} :: ${result.ok ? 'BUILD SUCCESSFUL' : `failed (exit ${result.status})`}`);
    if (result.ok) {
      if (!existsSync(APK)) fail(`Build reported success but ${APK} is missing`);
      return;
    }
    attempts.push(`${label} exit ${result.status}: ${result.tail}`);
    if (offline) info('offline build failed; retrying once without --offline');
  }
  fail(`Gradle build failed after both attempts:\n${attempts.join('\n')}`);
}

function gradleBuild(offline) {
  const env = { ...process.env };
  const jbr = 'C:/Program Files/Android/Android Studio/jbr';
  if (existsSync(jbr)) env.JAVA_HOME = jbr;
  const args = ['/c', 'gradlew.bat', ':app:assembleDebug', ...(offline ? ['--offline'] : [])];
  const result = spawnSync('cmd.exe', args, {
    cwd: REPO,
    env,
    encoding: 'utf8',
    timeout: 900_000,
    windowsHide: true,
  });
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  return {
    ok: !result.error && result.status === 0 && /BUILD SUCCESSFUL/.test(out),
    status: result.error ? result.error.code ?? 'spawn error' : result.status,
    tail: out.split(/\r?\n/).slice(-25).join(' | '),
  };
}

async function startResponder(state, mode, port) {
  const script = mode === 'error' ? ERROR_RESPONDER : STUB;
  const logPath = join(state.runDir, mode === 'error' ? 'error-responder.log' : 'stub.log');
  mkdirSync(dirname(logPath), { recursive: true });
  const log = openSync(logPath, 'a');
  const child = spawn(process.execPath, [script, String(port)], {
    cwd: REPO,
    stdio: ['ignore', log, log],
    windowsHide: true,
    detached: true,
  });
  child.unref();
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`${relative(REPO, script)} exited with ${child.exitCode}. ${readFileSync(logPath, 'utf8').trim()}`);
    }
    if (await portAnswers(port)) return { pid: child.pid, logPath };
    await sleep(250);
  }
  throw new Error(`${relative(REPO, script)} did not answer on 127.0.0.1:${port}. See ${relative(REPO, logPath)}`);
}

async function waitForHome(serial, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { nodes } = dumpNodes(serial);
    const marker = nodes.find((node) => node.id === `${PACKAGE}:id/${HOME_MARKER}`);
    if (marker) return marker;
    await sleep(1000);
  }
  throw new Error(`App home screen never rendered: no ${HOME_MARKER} node within ${timeoutMs}ms`);
}

function ensureUsable(state) {
  if (!deviceOnline(state.serial)) fail(`${state.serial} is not online. Run launch first.`);
  if (!bootCompleted(state.serial)) fail(`${state.serial} has not finished booting`);
}

function saveDump(state, label) {
  const { xml, nodes } = dumpNodes(state.serial);
  state.dumps = (state.dumps ?? 0) + 1;
  const name = `${String(state.dumps).padStart(3, '0')}-${label ?? 'step'}.xml`;
  const path = join(state.runDir, 'ui', name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, xml);
  writeLock(state);
  return { path, nodes };
}

function lookupFrom(options) {
  if (options.id) return { id: String(options.id) };
  if (options.desc) return { desc: String(options.desc), contains: Boolean(options.contains) };
  if (options.text) return { value: String(options.text), contains: Boolean(options.contains) };
  fail('Give --text, --id or --desc');
  return null;
}

async function locate(state, options) {
  const lookup = lookupFrom(options);
  const swipes = Number(options.scroll ?? 0);
  for (let attempt = 0; attempt <= swipes; attempt += 1) {
    const { nodes } = dumpNodes(state.serial);
    const node = findNode(nodes, lookup);
    if (node) return node;
    if (attempt < swipes) {
      const [width, height] = screenSize(state.serial);
      swipe(state.serial, [width / 2, height * 0.72], [width / 2, height * 0.32], 400);
      await sleep(600);
    }
  }
  fail(`not found after ${swipes} swipe(s): ${JSON.stringify(lookup)}`);
  return null;
}

// --- commands -------------------------------------------------------------------------------

async function launch(options) {
  requireTools();
  const avd = options.avd ?? DEFAULT_AVD;
  const port = Number(options.port ?? DEFAULT_PORT);
  const emulatorPort = Number(options['emulator-port'] ?? DEFAULT_EMULATOR_PORT);
  const serial = String(options.serial ?? `emulator-${emulatorPort}`);
  const responder = String(options.responder ?? 'stub');

  const previous = readLock();
  if (previous) {
    const stubAlive = processAlive(previous.stubPid);
    const deviceAlive = deviceOnline(previous.serial);
    if (stubAlive || deviceAlive) {
      fail(
        `Refusing to double-drive. ${relative(REPO, previous.runDir)} still owns ` +
          `${[stubAlive ? `responder pid ${previous.stubPid}` : '', deviceAlive ? `device ${previous.serial}` : ''].filter(Boolean).join(' and ')}. ` +
          `Run cleanup first.`
      );
    }
    console.log(`dropping stale run pointer for ${relative(REPO, previous.runDir)}`);
    clearLock();
  }
  if (await portAnswers(port)) fail(`127.0.0.1:${port} already answers. Refusing to share one responder port.`);
  if (deviceOnline(serial)) fail(`${serial} is already online. That is not this run's device. Run cleanup, then launch.`);

  const startedAt = new Date().toISOString();
  const runId = startedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const runDir = join(EVIDENCE_ROOT, runId);
  mkdirSync(join(runDir, 'ui'), { recursive: true });
  mkdirSync(join(runDir, 'screens'), { recursive: true });
  runLogDir = runDir;

  if (!options['skip-build']) buildApk();
  if (!existsSync(APK)) fail(`Missing ${APK}. Drop --skip-build.`);

  const state = {
    runId,
    runDir,
    serial,
    avd,
    port,
    responder,
    stubPid: null,
    stubLog: null,
    apk: relative(REPO, APK),
    startedAt,
    dumps: 0,
  };
  writeLock(state);

  console.log(`booting ${avd} as ${serial}`);
  await bootEmulator({ avd, port: emulatorPort, logPath: join(runDir, 'emulator.log') });

  const started = await startResponder(state, responder, port);
  state.stubPid = started.pid;
  state.stubLog = relative(REPO, started.logPath);
  writeLock(state);

  console.log(`installing ${relative(REPO, APK)}`);
  install(serial, APK);
  clearAppData(serial);
  forwardReverse(serial, port);
  startApp(serial);
  const marker = await waitForHome(serial);
  state.versionName = installedVersion(serial);
  writeLock(state);
  writeFileSync(
    join(runDir, 'run.json'),
    `${JSON.stringify(
      {
        runId,
        startedAt,
        serial,
        avd,
        apk: state.apk,
        versionName: state.versionName,
        responder: { kind: responder, pid: state.stubPid },
        port,
        reverse: `tcp:${port} tcp:${port}`,
      },
      null,
      2
    )}\n`
  );
  pass(`run ready on ${serial} (versionName ${state.versionName}, home ${marker.bounds.center.join(',')})`);
  console.log(`evidence ${relative(REPO, runDir)}`);
  return (
    `ready on ${serial} (versionName ${state.versionName}, home ${marker.bounds.center.join(',')}); ` +
    `responder ${responder} pid ${state.stubPid}; evidence ${relative(REPO, runDir)}`
  );
}

async function doctor() {
  requireTools();
  const state = needRun();
  const problems = [];
  const check = (condition, label) => {
    if (condition) pass(label);
    else {
      console.log(`FAIL ${label}`);
      problems.push(label);
    }
  };
  check(deviceOnline(state.serial), `device ${state.serial} is online`);
  if (deviceOnline(state.serial)) check(bootCompleted(state.serial), `sys.boot_completed=1 on ${state.serial}`);
  const version = installedVersion(state.serial);
  const expected = readFileSync(join(REPO, 'app', 'build.gradle'), 'utf8').match(/versionName\s+"([^"]+)"/)?.[1] ?? '';
  check(version.length > 0, `${PACKAGE} installed (versionName=${version || 'none'})`);
  check(version === expected, `installed version matches app/build.gradle (${expected || 'unknown'})`);
  check(appPid(state.serial).length > 0, `app process running (pid ${appPid(state.serial) || 'none'})`);
  check(reverseList(state.serial).includes(`tcp:${state.port}`), `adb reverse tcp:${state.port} present`);
  check(processAlive(state.stubPid), `${state.responder} responder pid ${state.stubPid} alive`);
  const answer = await portAnswers(state.port);
  check(answer?.status === 200, `responder answers GET /v1/models (${answer?.status ?? 'no answer'})`);
  if (state.responder === 'stub' && answer) check(answer.body.includes('stub-teach'), 'stub model list offers stub-teach');
  if (deviceOnline(state.serial)) {
    const { nodes } = dumpNodes(state.serial);
    check(
      nodes.some((node) => node.id.startsWith(PACKAGE)),
      `hierarchy belongs to ${PACKAGE}`
    );
    check(
      nodes.some((node) => node.id === `${PACKAGE}:id/${HOME_MARKER}` || node.text === 'Reasoned Debug'),
      'app UI is on screen'
    );
  }
  if (problems.length) fail(`doctor: ${problems.length} check(s) failed`);
  console.log('doctor: all checks passed');
  return 'all checks passed';
}

async function startOrReset(options, reset) {
  const state = needRun();
  ensureUsable(state);
  if (reset) clearAppData(state.serial);
  startApp(state.serial);
  const marker = await waitForHome(state.serial);
  const summary = `${reset ? 'app data cleared, ' : ''}home screen rendered (${HOME_MARKER} at ${marker.bounds.center.join(',')})`;
  pass(summary);
  return summary;
}

function dump(options) {
  const state = needRun();
  ensureUsable(state);
  const { path, nodes } = saveDump(state, options.label ? String(options.label) : undefined);
  for (const row of visibleText(nodes)) console.log(`${JSON.stringify(row.text)} id=${row.id || '-'} ${row.bounds.center.join(',')}`);
  const summary = `saved ${relative(REPO, path)}`;
  console.log(summary);
  return summary;
}

async function find(options) {
  const state = needRun();
  ensureUsable(state);
  const node = await locate(state, options);
  const summary =
    `${JSON.stringify(node.text)} id=${node.id.replace(`${PACKAGE}:id/`, '')} desc=${JSON.stringify(node.desc)} ` +
    `enabled=${node.enabled} checked=${node.checked} ${node.bounds.center.join(',')}`;
  console.log(summary);
  return summary;
}

async function tapCommand(options) {
  const state = needRun();
  ensureUsable(state);
  const node = await locate(state, options);
  if (!node.enabled) fail(`node is disabled: ${JSON.stringify(lookupFrom(options))}`);
  tap(state.serial, node.bounds.center);
  const summary = `tapped ${JSON.stringify(node.text || node.desc || node.id.replace(`${PACKAGE}:id/`, ''))} at ${node.bounds.center.join(',')}`;
  pass(summary);
  return summary;
}

async function typeCommand(options, args) {
  const state = needRun();
  ensureUsable(state);
  const value = args[0];
  if (!value) fail('Give the text to type as the positional argument');
  if (!options.id) fail('Give the target field with --id');
  const node = await locate(state, { id: options.id });
  if ([options.id, options.text, options.desc, node.id, node.desc, node.text].some(secretTarget)) {
    secrets.add(value);
  }
  tap(state.serial, node.bounds.center);
  await sleep(400);
  typeText(state.serial, value);
  await sleep(400);
  key(state.serial, 111); // ESC closes the IME without navigating back.
  await sleep(400);
  const summary = `typed ${redact(JSON.stringify(value))} into ${options.id} and closed the keyboard`;
  pass(summary);
  return summary;
}

function backCommand() {
  const state = needRun();
  ensureUsable(state);
  key(state.serial, 4);
  pass('pressed BACK');
  return 'pressed BACK';
}

async function scrollCommand(options) {
  const state = needRun();
  ensureUsable(state);
  const times = Number(options.times ?? 1);
  if (!Number.isInteger(times) || times < 1) {
    fail(`--times must be a whole number of screens from 1 up; got ${JSON.stringify(options.times)}`);
  }
  const [width, height] = screenSize(state.serial);
  for (let i = 0; i < times; i += 1) {
    swipe(state.serial, [width / 2, height * 0.72], [width / 2, height * 0.32], 400);
    await sleep(500);
  }
  const summary = `scrolled down ${times} screen(s)`;
  pass(summary);
  return summary;
}

async function waitCommand(options) {
  const state = needRun();
  ensureUsable(state);
  const lookup = lookupFrom(options);
  const limit = Number(options.timeout ?? 60);
  const deadline = Date.now() + limit * 1000;
  while (Date.now() < deadline) {
    const { nodes } = dumpNodes(state.serial);
    const node = findNode(nodes, lookup);
    if (node) {
      const summary = `found ${JSON.stringify(node.text || node.desc || node.id.replace(`${PACKAGE}:id/`, ''))} within ${limit}s`;
      pass(summary);
      return summary;
    }
    await sleep(1000);
  }
  fail(`timed out after ${limit}s waiting for ${JSON.stringify(lookup)}`);
  return null;
}

function shot(options) {
  const state = needRun();
  const label = String(options.label ?? `shot-${Date.now()}`);
  const path = join(state.runDir, 'screens', `${label}.png`);
  const bytes = screenshot(state.serial, path);
  const summary = `screenshot ${relative(REPO, path)} (${bytes} bytes)`;
  pass(summary);
  return summary;
}

function statusCommand() {
  const state = needRun();
  ensureUsable(state);
  const { nodes } = dumpNodes(state.serial);
  const ids = ['lesson_status', 'runtime_setup_status', 'runtime_key_status'];
  const rows = nodes.filter((node) => ids.some((id) => node.id === `${PACKAGE}:id/${id}`));
  for (const row of rows) console.log(`${row.id.replace(`${PACKAGE}:id/`, '')}=${JSON.stringify(row.text)}`);
  if (!rows.length) console.log('no status node on this screen');
  const logPath = join(state.runDir, state.responder === 'error' ? 'error-responder.log' : 'stub.log');
  let requests = 0;
  if (existsSync(logPath)) {
    const lines = readFileSync(logPath, 'utf8').trim().split(/\r?\n/);
    requests = lines.filter((line) => line.includes('POST') || line.includes('GET')).length;
    console.log(`${relative(REPO, logPath)}: ${requests} requests`);
    for (const line of lines.slice(-8)) console.log(`  ${line}`);
  }
  return (
    `${rows.map((row) => `${row.id.replace(`${PACKAGE}:id/`, '')}=${JSON.stringify(row.text)}`).join(' ') || 'no status node'}; ` +
    `${requests} responder request line(s)`
  );
}

function logcatCommand() {
  const state = needRun();
  const path = join(state.runDir, 'logcat-ReasonedRuntime.txt');
  writeFileSync(path, logcat(state.serial, 'ReasonedRuntime'));
  const summary = `logcat ${relative(REPO, path)}`;
  pass(summary);
  return summary;
}

async function cleanup() {
  const state = readLock();
  if (!state) {
    console.log('nothing to clean: no active run');
    return;
  }
  const report = { cleanedAt: new Date().toISOString(), runDir: relative(REPO, state.runDir), stubPid: state.stubPid };
  if (state.stubPid && processAlive(state.stubPid)) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(state.stubPid), '/T', '/F'], { windowsHide: true });
    else process.kill(state.stubPid, 'SIGTERM');
    report.responderStopped = !processAlive(state.stubPid);
  } else {
    report.responderStopped = 'already stopped';
  }
  if (state.serial && deviceOnline(state.serial)) {
    removeReverse(state.serial, state.port);
    report.reverseRemoved = true;
    adb(state.serial, ['emu', 'kill'], { allowFailure: true });
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (!deviceOnline(state.serial)) break;
      await sleep(1500);
    }
    report.emulatorStopped = !deviceOnline(state.serial);
  } else {
    report.emulatorStopped = 'already stopped';
  }
  report.evidenceFiles = readdirSync(state.runDir).sort();
  writeFileSync(join(state.runDir, 'cleanup.json'), `${JSON.stringify(report, null, 2)}\n`);
  clearLock();
  console.log(JSON.stringify(report, null, 2));
  if (report.responderStopped === false) fail('responder survived cleanup');
  if (report.emulatorStopped === false) fail('emulator survived cleanup');
  return `responder ${report.responderStopped}, emulator ${report.emulatorStopped}; evidence kept in ${relative(REPO, state.runDir)}`;
}

function reportCommand(options) {
  const state = options.run ? { runDir: resolve(REPO, String(options.run)) } : needRun();
  let files = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else {
        files += 1;
        console.log(`${relative(REPO, path)} ${readFileSync(path).length}B`);
      }
    }
  };
  walk(state.runDir);
  return `listed ${files} file(s) in ${relative(REPO, state.runDir)}`;
}

const COMMANDS = {
  launch,
  doctor,
  start: (options) => startOrReset(options, false),
  reset: (options) => startOrReset(options, true),
  dump,
  find,
  tap: tapCommand,
  type: typeCommand,
  wait: waitCommand,
  back: backCommand,
  scroll: scrollCommand,
  shot,
  status: statusCommand,
  logcat: logcatCommand,
  cleanup,
  report: reportCommand,
};

const [command, ...rest] = process.argv.slice(2);
if (!command || !COMMANDS[command]) {
  console.error(`usage: node ${relative(REPO, fileURLToPath(import.meta.url))} <${Object.keys(COMMANDS).join('|')}> [options]`);
  process.exit(2);
}
const { args, options } = flags(rest);
const locked = readLock();
if (command !== 'launch' && locked) runLogDir = locked.runDir;
if (command === 'report' && options.run) {
  const target = resolve(REPO, String(options.run));
  if (existsSync(target)) runLogDir = target;
}
// Redact before the command runs, so a failure that never reaches the field still hides the value.
if (command === 'type' && args[0] && [options.id, options.text, options.desc].some(secretTarget)) {
  secrets.add(String(args[0]));
}
const label = `${command}${rest.length ? ` ${rest.join(' ')}` : ''}`;
Promise.resolve()
  .then(() => COMMANDS[command](options, args))
  .then((result) => {
    logLine(`ok ${redact(label)}${result ? ` :: ${redact(result)}` : ''}`);
  })
  .catch((error) => {
    const message = String(error.message ?? error).replace(/\r?\n/g, ' | ');
    logLine(`fail exit=1 ${redact(label)} :: ${redact(message)}`);
    console.error(`FAIL ${redact(error.message ?? error)}`);
    process.exit(1);
  });
