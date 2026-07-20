#!/usr/bin/env node
/**
 * Cut an Android release: bump every version file, re-render the manual,
 * build both APK variants, verify the build on the AVD, publish to GitHub.
 *
 *   node scripts/release.mjs 1.0.0-beta.12 --notes notes.md
 *   node scripts/release.mjs 1.0.0-beta.12 --notes notes.md --dry-run
 *   node scripts/release.mjs --verify-only          # boot-check current APKs
 *
 * Encodes the rules this project keeps re-learning by hand:
 *
 *  - **Distribution is ALWAYS a GitHub release.** Never attach an APK to chat.
 *  - **Both variants, every time.** arm64 for real phones (~36MB); universal
 *    because arm64-only crashes on an x86_64 emulator with "Unexpected CPU
 *    variant" — which is exactly what verification runs on.
 *  - **Verify the PRODUCTION build on the AVD before publishing.** The check
 *    that matters is the ABSENCE of the dev sign-in row: an emulator-mode
 *    bundle looks identical otherwise, and Metro will happily serve a cached
 *    bundle built under different EXPO_PUBLIC_* env.
 *  - **versionCode must increase** or the install silently refuses to upgrade.
 *  - The version lives in FOUR places that drifted apart before this existed
 *    (app.json was stranded at beta.7 while builds said beta.11).
 */
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const DRY = flag('--dry-run');
const VERIFY_ONLY = flag('--verify-only');
const version = args.find((a) => /^\d+\.\d+\.\d+/.test(a));

const GRADLE = join(root, 'app/android/app/build.gradle');
const APP_JSON = join(root, 'app/app.json');
const MANUAL_MD = join(root, 'docs/USER-MANUAL.md');
const RENDER_PY = join(root, 'docs/render-manual.py');
const OUT_DIR = process.env.RELEASE_OUT_DIR ?? join(root, 'build-artifacts');

const sh = (cmd, cwd = root) =>
  execSync(cmd, { cwd, stdio: 'inherit', env: process.env });
const shOut = (cmd, cwd = root) =>
  execSync(cmd, { cwd, encoding: 'utf8', env: process.env }).trim();

function currentVersion() {
  const m = readFileSync(GRADLE, 'utf8').match(/versionName\s+"([^"]+)"/);
  return m?.[1] ?? null;
}
function currentCode() {
  const m = readFileSync(GRADLE, 'utf8').match(/versionCode\s+(\d+)/);
  return m ? Number(m[1]) : 0;
}

function bumpVersion(v) {
  const code = currentCode() + 1;
  let g = readFileSync(GRADLE, 'utf8');
  g = g.replace(/versionCode\s+\d+/, `versionCode ${code}`);
  g = g.replace(/versionName\s+"[^"]+"/, `versionName "${v}"`);
  writeFileSync(GRADLE, g);

  // app.json drifts silently — nothing builds from it on Android, so nobody
  // notices until the web build reports a version nobody recognises.
  const aj = JSON.parse(readFileSync(APP_JSON, 'utf8'));
  aj.expo.version = v;
  writeFileSync(APP_JSON, JSON.stringify(aj, null, 2) + '\n');

  writeFileSync(
    MANUAL_MD,
    readFileSync(MANUAL_MD, 'utf8').replace(
      /\*For app version [^ ]+ ·/,
      `*For app version ${v} ·`,
    ),
  );
  writeFileSync(
    RENDER_PY,
    readFileSync(RENDER_PY, 'utf8').replace(
      /App version [^ ]+ &nbsp;/,
      `App version ${v} &nbsp;`,
    ),
  );
  console.log(`▸ version → ${v} (versionCode ${code}) in gradle, app.json, manual, renderer`);
  return code;
}

function renderManual() {
  console.log('▸ rendering USER-MANUAL.pdf');
  sh('python3 render-manual.py', join(root, 'docs'));
}

function buildApks(v) {
  mkdirSync(OUT_DIR, { recursive: true });
  const gradleDir = join(root, 'app/android');
  const built = {};
  for (const [variant, extra] of [
    ['universal', ''],
    ['arm64', '-PreactNativeArchitectures=arm64-v8a'],
  ]) {
    console.log(`▸ building ${variant} APK…`);
    sh(`./gradlew assembleRelease -q ${extra}`, gradleDir);
    const src = join(gradleDir, 'app/build/outputs/apk/release/app-release.apk');
    const dst = join(OUT_DIR, `sabeel-time-tracker-${v}-${variant}.apk`);
    sh(`cp ${src} ${dst}`);
    built[variant] = dst;
  }
  return built;
}

/** Boot the universal APK on the AVD and prove it is a PRODUCTION bundle. */
function verifyOnAvd(v, apk) {
  console.log('▸ verifying on the AVD (production-mode check)…');
  const devices = shOut('adb devices').split('\n').slice(1).filter((l) => l.includes('device'));
  if (devices.length === 0) {
    console.log('  no device — starting headless emulator');
    execSync(`nohup ${join(root, 'scripts/emulator.sh')} headless >/dev/null 2>&1 &`, {
      cwd: root,
      env: process.env,
    });
    sh('adb wait-for-device');
    execSync(
      'timeout 240 bash -c \'until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d "\\r")" = "1" ]; do sleep 3; done\'',
      { stdio: 'inherit' },
    );
  }
  sh(`adb install -r ${apk}`);
  const pkg = 'com.sabeelinstitute.timetracker';
  sh(`adb shell monkey -p ${pkg} 1`);
  execSync('sleep 12');

  const reportedVersion = shOut(
    `adb shell dumpsys package ${pkg} | grep versionName | head -1`,
  ).split('=')[1];
  if (reportedVersion !== v) {
    throw new Error(`installed versionName ${reportedVersion} != ${v} (stale build?)`);
  }
  if (!shOut(`adb shell pidof ${pkg} || true`)) {
    throw new Error('app is not running after launch — it crashed on boot');
  }

  // The decisive production check: an emulator-mode bundle renders a dev
  // sign-in row. Its ABSENCE is what proves the right bundle shipped.
  execSync('adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true');
  const ui = shOut('adb shell cat /sdcard/ui.xml 2>/dev/null || true');
  if (/Dev: sign in/i.test(ui)) {
    throw new Error('DEV SIGN-IN ROW PRESENT — this is an emulator-mode bundle, do not publish');
  }
  if (ui && !/Sign in with Google/i.test(ui)) {
    console.warn('  (warning: could not confirm the sign-in screen; check the screenshot)');
  }
  mkdirSync(OUT_DIR, { recursive: true });
  sh(`adb exec-out screencap -p > ${join(OUT_DIR, `verify-${v}.png`)}`);
  console.log(`  ✔ ${v} boots, production bundle confirmed`);
}

function publish(v, built, notesFile) {
  const notes = notesFile ? readFileSync(notesFile, 'utf8') : `Release ${v}.`;
  const notesPath = join(OUT_DIR, `notes-${v}.md`);
  writeFileSync(notesPath, notes);
  const assets = [built.arm64, built.universal, join(root, 'docs/USER-MANUAL.pdf')].join(' ');
  console.log('▸ publishing GitHub release (the ONLY distribution channel)');
  sh(`gh release create v${v} --title "v${v}" --notes-file ${notesPath} ${assets}`);
}

// ---------------------------------------------------------------------------
if (VERIFY_ONLY) {
  const v = currentVersion();
  verifyOnAvd(v, join(OUT_DIR, `sabeel-time-tracker-${v}-universal.apk`));
  process.exit(0);
}

if (!version) {
  console.error('usage: node scripts/release.mjs <version> [--notes FILE] [--dry-run]');
  console.error('       node scripts/release.mjs --verify-only');
  process.exit(2);
}
if (shOut('git status --porcelain')) {
  console.error('working tree is dirty — commit first so the release is reproducible');
  process.exit(1);
}
if (shOut(`git tag -l v${version}`)) {
  console.error(`tag v${version} already exists`);
  process.exit(1);
}

const code = bumpVersion(version);
renderManual();
if (DRY) {
  console.log(`\n[dry-run] stopping before build/verify/publish. versionCode would be ${code}.`);
  console.log('[dry-run] revert with: git checkout -- app docs');
  process.exit(0);
}
const built = buildApks(version);
verifyOnAvd(version, built.universal);
const notesFile = opt('--notes');
if (!existsSync(notesFile ?? '')) {
  console.error('\nBuilt and verified, but --notes FILE is required to publish.');
  console.error(`APKs are in ${OUT_DIR}; re-run with --notes once written.`);
  process.exit(1);
}
publish(version, built, notesFile);
console.log(`\n✔ v${version} released. Commit the version bump.`);
