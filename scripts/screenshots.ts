import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Scenes, windowColorsOf } from '@favo/client/scenes';
import { $ } from 'bun';

const GhosttyApp = '/Applications/Ghostty.app';
const GhosttyBinary = 'MacOS/ghostty';
const Tools = 'scripts/screenshot-tools.swift';
const ImageWidth = 2240;
const ImageHeight = 1572;
const FocusAttempts = 5;
const PollMs = 100;
const ReadyTimeoutMs = 15_000;
const WindowSettleMs = 1_000;
const StandardConfig = [
  '--config-default-files=false',
  '--font-family=FiraCode Nerd Font Mono Med',
  '--font-size=14',
  '--adjust-cell-height=20%',
  '--window-width=128',
  '--window-height=36',
  '--window-padding-x=8',
  '--window-padding-y=4',
  '--window-save-state=never',
  '--confirm-close-surface=false',
  '--quit-after-last-window-closed=true',
  '--shell-integration=none',
  '--cursor-opacity=0',
  '--title=favo',
];

async function waitFor<T>(what: string, read: () => Promise<T | undefined> | T | undefined) {
  const deadline = Date.now() + ReadyTimeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value) return value;
    await Bun.sleep(PollMs);
  }
  throw new Error(`Timed out waiting for ${what}.`);
}

async function ghosttyPidOf(readyFile: string) {
  const pid = await $`pgrep -f ${`${GhosttyBinary} .*${readyFile}`}`.nothrow().text();
  return pid.trim() || undefined;
}

async function windowIdOf(pid: string) {
  const id = await $`swift ${Tools} window-id ${pid}`.text();
  return id.trim() || undefined;
}

async function hasFocusedChrome(shot: string) {
  const check = await $`swift ${Tools} has-focused-chrome ${shot}`.nothrow().quiet();
  return check.exitCode === 0;
}

function assertImageSize(file: string) {
  const png = readFileSync(file);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width === ImageWidth && height === ImageHeight) return;
  throw new Error(
    `${file} is ${width}x${height}, not ${ImageWidth}x${ImageHeight}. Is the display Retina, and is FiraCode Nerd Font installed?`
  );
}

async function isSameImage(file: string, shot: string) {
  if (!existsSync(file)) return false;
  const comparison = await $`swift ${Tools} is-same ${file} ${shot}`.nothrow().quiet();
  return comparison.exitCode === 0;
}

async function capture(name: string, shot: string, readyFile: string) {
  const scene = Scenes[name];
  if (!scene) throw new Error(`No scene called ${name}. Scenes: ${Object.keys(Scenes).join(', ')}`);
  const colors = windowColorsOf(scene);
  rmSync(readyFile, { force: true });
  const launch = Bun.spawn(
    [
      'open',
      '-n',
      '-a',
      GhosttyApp,
      '--args',
      ...StandardConfig,
      `--background=${colors.background}`,
      `--foreground=${colors.text}`,
      `--working-directory=${process.cwd()}`,
      `--command=${process.execPath} apps/client/src/dev.tsx ${name} ${readyFile}`,
    ],
    { stdout: 'ignore', stderr: 'ignore' }
  );
  await launch.exited;
  const pid = await waitFor(`the ${name} Ghostty`, () => ghosttyPidOf(readyFile));
  try {
    await waitFor(`${name} to reach its screen`, () => existsSync(readyFile));
    const windowId = await waitFor(`the ${name} window`, () => windowIdOf(pid));
    await Bun.sleep(WindowSettleMs);
    await $`screencapture -l ${windowId} -o -x ${shot}`;
  } finally {
    process.kill(Number(pid));
    await waitFor(`the ${name} Ghostty to close`, async () => !(await ghosttyPidOf(readyFile)));
  }
}

async function shoot(name: string, outputFolder: string, workFolder: string) {
  const shot = join(workFolder, `${name}.png`);
  const readyFile = join(workFolder, `${name}.ready`);
  let isFocused = false;
  for (let attempt = 0; attempt < FocusAttempts && !isFocused; attempt++) {
    await capture(name, shot, readyFile);
    assertImageSize(shot);
    isFocused = await hasFocusedChrome(shot);
  }
  if (!isFocused) throw new Error(`${name} never had focus. Leave the keyboard and mouse alone during the run.`);
  const file = join(outputFolder, `${name}.png`);
  if (await isSameImage(file, shot)) {
    console.log(`unchanged ${file}`);
    return;
  }
  copyFileSync(shot, file);
  console.log(`changed   ${file}`);
}

const outputFolder = process.env.FAVO_SCREENSHOTS_DIR ?? 'docs/assets';
const requested = process.argv.slice(2);
const names = requested.length > 0 ? requested : Object.keys(Scenes);
const workFolder = mkdtempSync(join(tmpdir(), 'favo-screenshots-'));
mkdirSync(outputFolder, { recursive: true });
try {
  for (const name of names) await shoot(name, outputFolder, workFolder);
} finally {
  rmSync(workFolder, { recursive: true });
}
