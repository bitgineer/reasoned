// Device primitives for verify-reasoned: adb calls, emulator boot, UI hierarchy parsing.
// Every call targets an explicit serial. Nothing here guesses or kills by process name.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const SDK = process.env.REASONED_ANDROID_SDK ?? 'C:/Users/Jack/AppData/Local/Android/Sdk';
export const ADB = process.env.REASONED_ADB ?? join(SDK, 'platform-tools', 'adb.exe');
export const EMULATOR = process.env.REASONED_EMULATOR ?? join(SDK, 'emulator', 'emulator.exe');
export const PACKAGE = 'com.kkgosu.reasoned.debug';
export const ACTIVITY = `${PACKAGE}/com.kkgosu.reasoned.MainActivity`;

export function requireTools() {
  for (const path of [ADB, EMULATOR]) {
    if (!existsSync(path)) throw new Error(`Missing Android tool: ${path}`);
  }
}

/** One adb call, synchronous, never through a shell. */
export function adb(serial, args, { timeout = 60_000, allowFailure = false } = {}) {
  const target = serial ? ['-s', serial, ...args] : args;
  const result = spawnSync(ADB, target, { encoding: 'utf8', timeout, windowsHide: true });
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`adb ${target.join(' ')} failed (${result.status}): ${out}`);
  }
  return out;
}

export function adbBuffer(serial, args, timeout = 60_000) {
  const target = serial ? ['-s', serial, ...args] : args;
  const result = spawnSync(ADB, target, { timeout, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`adb ${target.join(' ')} failed (${result.status})`);
  return result.stdout;
}

export function devices() {
  const out = adb(null, ['devices'], { allowFailure: true });
  return out
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((row) => row.length === 2)
    .map(([serial, state]) => ({ serial, state }));
}

export function deviceOnline(serial) {
  return devices().some((d) => d.serial === serial && d.state === 'device');
}

export function bootCompleted(serial) {
  const value = adb(serial, ['shell', 'getprop', 'sys.boot_completed'], { allowFailure: true });
  return value.trim() === '1';
}

const UNESCAPE = [
  ['&#10;', '\n'],
  ['&#13;', '\r'],
  ['&lt;', '<'],
  ['&gt;', '>'],
  ['&quot;', '"'],
  ['&apos;', "'"],
  ['&#39;', "'"],
  ['&amp;', '&'],
];

function unescape(value) {
  return UNESCAPE.reduce((text, [from, to]) => text.split(from).join(to), value);
}

/** uiautomator switches to single quotes when a value itself contains a double quote. */
function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}=("([^"]*)"|'([^']*)')`));
  if (!match) return '';
  return unescape(match[2] ?? match[3] ?? '');
}

function bounds(tag) {
  const match = tag.match(/bounds="\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]"/);
  if (!match) return null;
  const [left, top, right, bottom] = match.slice(1).map(Number);
  return { left, top, right, bottom, center: [Math.round((left + right) / 2), Math.round((top + bottom) / 2)] };
}

/** Every node in the current window hierarchy, in document order. */
export function dumpNodes(serial, { retries = 3 } = {}) {
  let last = '';
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const remote = '/sdcard/verify-reasoned-ui.xml';
    last = adb(serial, ['shell', 'uiautomator', 'dump', remote], { allowFailure: true });
    if (/dumped to/i.test(last)) {
      const xml = adbBuffer(serial, ['exec-out', 'cat', remote]).toString('utf8');
      return { xml, nodes: parseNodes(xml) };
    }
    spawnSync(ADB, ['-s', serial, 'shell', 'sleep', '1'], { windowsHide: true });
  }
  throw new Error(`uiautomator dump never succeeded: ${last}`);
}

export function parseNodes(xml) {
  return [...xml.matchAll(/<node\b[^>]*>/g)].map((match, index) => {
    const tag = match[0];
    return {
      index,
      text: attribute(tag, 'text'),
      id: attribute(tag, 'resource-id'),
      desc: attribute(tag, 'content-desc'),
      className: attribute(tag, 'class'),
      clickable: attribute(tag, 'clickable') === 'true',
      enabled: attribute(tag, 'enabled') === 'true',
      checked: attribute(tag, 'checked') === 'true',
      focused: attribute(tag, 'focused') === 'true',
      scrollable: attribute(tag, 'scrollable') === 'true',
      bounds: bounds(tag),
    };
  });
}

/** First node whose visible text, resource id or content description matches the query. */
export function findNode(nodes, query) {
  const wanted = query.value ?? query.desc;
  const test = (value) => {
    if (!value) return false;
    return query.contains ? value.includes(wanted) : value === wanted;
  };
  const candidates = nodes.filter((node) => {
    if (!node.bounds || node.bounds.right <= node.bounds.left) return false;
    if (query.id) return node.id === query.id || node.id === `${PACKAGE}:id/${query.id}`;
    if (query.desc) return test(node.desc);
    if (node.desc && test(node.desc)) return true;
    return test(node.text);
  });
  return candidates[0] ?? null;
}

export function visibleText(nodes) {
  return nodes
    .filter((node) => node.text && node.bounds)
    .map((node) => ({ text: node.text, id: node.id.replace(`${PACKAGE}:id/`, ''), bounds: node.bounds }));
}

export function tap(serial, point) {
  adb(serial, ['shell', 'input', 'tap', String(point[0]), String(point[1])]);
}

export function swipe(serial, from, to, duration = 300) {
  adb(serial, ['shell', 'input', 'swipe', ...from.map(String), ...to.map(String), String(duration)]);
}

export function key(serial, code) {
  adb(serial, ['shell', 'input', 'keyevent', String(code)]);
}

/** Screen size, so a scroll can be derived instead of hard-coded. */
export function screenSize(serial) {
  const out = adb(serial, ['shell', 'wm', 'size']);
  const matches = [...out.matchAll(/(\d+)x(\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  return matches[matches.length - 1] ?? [1080, 2400];
}

/** `input text` sends spaces as %s and keeps other characters inside device-shell quotes. */
export function typeText(serial, value) {
  if (/[']/.test(value)) throw new Error(`Double-quote the value for adb; a single quote is not supported: ${value}`);
  adb(serial, ['shell', 'input', 'text', `'${value.replace(/ /g, '%s')}'`]);
}

export function forwardReverse(serial, port) {
  adb(serial, ['reverse', `tcp:${port}`, `tcp:${port}`]);
}

export function reverseList(serial) {
  return adb(serial, ['reverse', '--list'], { allowFailure: true });
}

export function removeReverse(serial, port) {
  return adb(serial, ['reverse', `--remove`, `tcp:${port}`], { allowFailure: true });
}

export function appPid(serial) {
  const out = adb(serial, ['shell', 'pidof', PACKAGE], { allowFailure: true });
  return out.trim().split(/\s+/).filter(Boolean)[0] ?? '';
}

export function install(serial, apk) {
  const out = adb(serial, ['install', '-r', apk], { timeout: 300_000 });
  if (!/Success/i.test(out)) throw new Error(`Install failed: ${out}`);
  return out;
}

export function installedVersion(serial) {
  const out = adb(serial, ['shell', 'dumpsys', 'package', PACKAGE], { allowFailure: true });
  return out.match(/versionName=(\S+)/)?.[1] ?? '';
}

export function clearAppData(serial) {
  const out = adb(serial, ['shell', 'pm', 'clear', PACKAGE], { allowFailure: true });
  if (!/Success/i.test(out)) throw new Error(`pm clear failed: ${out}`);
}

export function startApp(serial) {
  adb(serial, ['shell', 'am', 'start', '-n', ACTIVITY]);
}

export function logcat(serial, tag) {
  return adb(serial, ['logcat', '-d', '-s', tag], { allowFailure: true, timeout: 120_000 });
}

export function screenshot(serial, path) {
  mkdirSync(dirname(path), { recursive: true });
  const png = adbBuffer(serial, ['exec-out', 'screencap', '-p']);
  if (png.length < 8 || png[0] !== 0x89 || png.subarray(1, 4).toString() !== 'PNG') {
    throw new Error(`screencap returned ${png.length} bytes that are not a PNG`);
  }
  writeFileSync(path, png);
  return png.length;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Boot one named AVD headless on a fixed port so the serial is known before it starts. */
export async function bootEmulator({ avd, port, logPath, timeoutMs = 300_000 }) {
  mkdirSync(dirname(logPath), { recursive: true });
  const args = [
    '-avd', avd,
    '-port', String(port),
    '-no-window',
    '-no-audio',
    '-no-boot-anim',
    '-gpu', 'swiftshader_indirect',
    '-no-snapshot-load',
    '-no-snapshot-save',
  ];
  const log = openSync(logPath, 'w');
  const child = spawn(EMULATOR, args, { detached: true, stdio: ['ignore', log, log], windowsHide: true });
  child.unref();
  const serial = `emulator-${port}`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (deviceOnline(serial) && bootCompleted(serial)) return { serial, logPath };
    await sleep(3000);
  }
  throw new Error(`Emulator ${avd} did not reach sys.boot_completed=1 within ${timeoutMs}ms. See ${logPath}`);
}

/** Named evidence file or a numbered dump when no label is given. */
export function nextDumpPath(runDir, label, counter) {
  const name = `${String(counter).padStart(3, '0')}${label ? `-${label}` : ''}.xml`;
  return join(runDir, 'ui', name);
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
