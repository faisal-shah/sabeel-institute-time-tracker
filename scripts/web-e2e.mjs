#!/usr/bin/env node
// Phase 1 closed-loop e2e: drives the real exported web bundle in headless Chrome
// against live Firebase emulators. Proves the full auth story end to end:
//   dev Google-credential sign-in → forced-pending profile → gate screen →
//   grant-admin bootstrap → live claims refresh un-gates without reload →
//   in-app approval of a second user flips THEIR page live too.
//
//   node scripts/web-e2e.mjs            (from the repo root)
//
// Prereqs: system Google Chrome, JDK 21 for emulators (same as test-emulator.sh).
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import http from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const root = new URL('..', import.meta.url).pathname;
const shots = process.env.E2E_SHOTS_DIR ?? join(root, 'e2e-shots');
mkdirSync(shots, { recursive: true });

const children = [];
function bg(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  children.push(child);
  return child;
}
function cleanup(code) {
  for (const c of children) {
    try {
      process.kill(-c.pid, 'SIGTERM');
    } catch {
      try {
        c.kill('SIGTERM');
      } catch {
        /* gone */
      }
    }
  }
  process.exit(code);
}
process.on('SIGINT', () => cleanup(130));

function waitFor(url, label, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() > deadline) reject(new Error(`timeout waiting for ${label}`));
        else setTimeout(tick, 500);
      });
    };
    tick();
  });
}

async function main() {
  // 1. Build functions + export the web bundle in emulator mode.
  console.log('▸ building functions and web bundle (emulator mode)…');
  execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
  execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist-web'], {
    cwd: join(root, 'app'),
    stdio: 'inherit',
    env: { ...process.env, EXPO_PUBLIC_USE_EMULATORS: '1' },
  });

  // 2. Emulators (JDK 21 shim like scripts/test-emulator.sh).
  const env = { ...process.env };
  const jdk = env.ST_JDK21_HOME ?? `${env.HOME}/opt/jdk-21`;
  if (existsSync(jdk)) {
    env.JAVA_HOME = jdk;
    env.PATH = `${jdk}/bin:${env.PATH}`;
  }
  console.log('▸ starting Firebase emulators…');
  const emu = bg(
    'firebase',
    ['emulators:start', '--project', 'demo-sabeel', '--only', 'auth,firestore,functions'],
    { env, detached: true },
  );
  emu.stderr.on('data', (d) => process.stderr.write(d));
  await waitFor('http://127.0.0.1:9099', 'auth emulator');
  await waitFor('http://127.0.0.1:8080', 'firestore emulator');
  await waitFor('http://127.0.0.1:5001', 'functions emulator', 120000);

  // 3. Static server for the exported bundle (SPA fallback to index.html).
  const dist = join(root, 'app', 'dist-web');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  const server = http.createServer((req, res) => {
    const path = req.url.split('?')[0];
    let file = join(dist, path);
    if (path === '/' || !existsSync(file)) file = join(dist, 'index.html');
    res.setHeader('content-type', types[extname(file)] ?? 'application/octet-stream');
    createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(8123, r));

  // 4. Drive it.
  console.log('▸ launching Chrome…');
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox'],
  });

  const consoleErrors = [];
  const pages = new Map();
  async function newPage(label) {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
    const page = await ctx.newPage();
    pages.set(label, page);
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(`[${label}] ${m.text()}`);
      if (m.type() === 'warning' && /listener/.test(m.text()))
        console.log(`  (listener warning) [${label}] ${m.text()}`);
    });
    await page.goto('http://127.0.0.1:8123/');
    return page;
  }
  // On any failure, dump what every page was showing.
  process.on('unhandledRejection', () => {});
  globalThis.dumpPages = async () => {
    for (const [label, p] of pages) {
      await p
        .screenshot({ path: join(shots, `fail-${label}.png`) })
        .catch(() => {});
    }
  };
  async function devSignIn(page, email) {
    await page.getByPlaceholder('email').fill(email);
    await page.getByText('Dev: sign in', { exact: true }).click();
  }

  console.log('▸ admin signs in → must land on the pending gate…');
  const admin = await newPage('admin');
  await devSignIn(admin, 'admin@example.com');
  await admin.getByText('waiting for an administrator', { exact: false }).waitFor();
  await admin.screenshot({ path: join(shots, '1-admin-pending.png') });

  console.log('▸ grant-admin bootstrap → page must un-gate LIVE (claims refresh)…');
  execFileSync('node', ['scripts/grant-admin.mjs', 'admin@example.com'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    },
  });
  await admin.getByText('Salaam,', { exact: false }).waitFor({ timeout: 30000 });
  await admin.screenshot({ path: join(shots, '2-admin-home.png') });

  console.log('▸ a volunteer signs in on their own device → pending gate…');
  const vol = await newPage('volunteer');
  await devSignIn(vol, 'volunteer@example.com');
  await vol.getByText('waiting for an administrator', { exact: false }).waitFor();

  console.log('▸ admin opens Manage users and sees the volunteer name+email…');
  await admin.getByText('Manage users').click();
  await admin.getByText('volunteer@example.com').waitFor();
  await admin.screenshot({ path: join(shots, '3-users-pending.png') });

  console.log('▸ admin taps Approve → volunteer page must flip to Home live…');
  await admin.getByText('Approve', { exact: true }).click();
  await vol.getByText('Salaam,', { exact: false }).waitFor({ timeout: 30000 });
  await vol.screenshot({ path: join(shots, '4-volunteer-home.png') });
  await admin.screenshot({ path: join(shots, '5-users-after.png') });

  // Volunteer must NOT see the admin button.
  const manageCount = await vol.getByText('Manage users').count();
  if (manageCount !== 0) throw new Error('volunteer sees the admin Manage users button');

  console.log('▸ Phase 2: manager creates, archives, restores activities…');
  // Fresh page, same context: auth persists (IndexedDB), lands on Home.
  const admin2 = await admin.context().newPage();
  pages.set('admin2', admin2);
  await admin2.goto('http://127.0.0.1:8123/');
  await admin2.getByText('Salaam,', { exact: false }).waitFor();
  await admin2.getByText('Projects & events').click();

  async function addActivity(name, type) {
    const input = admin2.getByPlaceholder('New project or event name');
    await input.fill(name);
    await admin2.getByText(type, { exact: true }).click();
    await admin2.getByText('Add', { exact: true }).click();
    // Successful create clears the input; an error would leave it filled.
    // (Runs in the browser, where document exists — eslint sees only node here.)
    await admin2.waitForFunction(
      // eslint-disable-next-line no-undef
      () => document.querySelector('input')?.value === '',
      undefined,
      { timeout: 10000 },
    );
    // .last(): the stack navigator keeps Home mounted (hidden) underneath, and
    // its picker chip for the new activity also matches; the visible Activities
    // screen is the most recently mounted, so it sits last in the DOM.
    await admin2.getByText(name, { exact: true }).last().waitFor();
  }
  await addActivity('Tutoring', 'project');
  await addActivity('Food Drive', 'event');
  await admin2.getByText('Archive', { exact: true }).first().click();
  await admin2.getByText('Restore', { exact: true }).waitFor();
  await admin2.screenshot({ path: join(shots, '6-activities.png') });

  // Members don't get the manager entry point.
  const actCount = await vol.getByText('Projects & events').count();
  if (actCount !== 0) throw new Error('member sees the manager Projects & events button');

  console.log('▸ Phase 3: volunteer clocks in, clocks out, adds manual hours…');
  // Tutoring is the only active activity (Food Drive was archived above).
  await vol.getByText('Tutoring', { exact: true }).first().click();
  await vol.getByText('Clock in', { exact: true }).click();
  await vol.getByText('CLOCKED IN').waitFor();
  await vol.screenshot({ path: join(shots, '7-clocked-in.png') });

  await vol.getByText('Clock out', { exact: true }).click();
  await vol.getByText('What are you working on?').waitFor();
  // The 1-minute floor on clock sessions must show up in today's total.
  await vol.getByText('Today: 1m').waitFor();

  await vol.getByText('Add hours manually').click();
  // .last(): ManualEntry mounts on top while Home (with its own chip) stays in the DOM.
  await vol.getByText('Tutoring', { exact: true }).last().click();
  const times = vol.locator('input');
  await times.nth(1).fill('09:00'); // from  (nth(0) is the date)
  await times.nth(2).fill('10:30'); // to
  await vol.getByText('What did you work on?', { exact: false }).waitFor();
  await vol.locator('textarea').fill('Math tutoring with the kids');
  await vol.getByText('Save hours', { exact: true }).click();
  await vol.getByText('Today: 1h 31m').waitFor({ timeout: 15000 });
  await vol.screenshot({ path: join(shots, '8-after-manual.png') });

  console.log('▸ Phase 4: timesheet day view, edit an entry, delete an entry…');
  await vol.getByText('My timesheet').click();
  await vol.getByText('1h 31m', { exact: true }).first().waitFor();
  await vol.screenshot({ path: join(shots, '9-timesheet.png') });

  // Edit the manual entry (found by its note) to end at 11:00 → total 2h 01m.
  await vol.getByText('Math tutoring with the kids').click();
  await vol.locator('input').nth(2).fill('11:00');
  await vol.getByText('Save changes', { exact: true }).click();
  await vol.getByText('2h 01m', { exact: true }).first().waitFor();

  // Delete the 1-minute clock entry → total 2h 00m.
  await vol.getByText('1m', { exact: true }).last().click();
  await vol.getByText('Delete entry', { exact: true }).click();
  await vol.getByText('2h 00m', { exact: true }).first().waitFor();

  // Week view still shows the same total.
  await vol.getByText('week', { exact: true }).click();
  await vol.getByText('2h 00m', { exact: true }).first().waitFor();
  await vol.screenshot({ path: join(shots, '10-timesheet-week.png') });

  await browser.close();
  server.close();

  const realErrors = consoleErrors.filter((e) => !/WebChannelConnection|transport errored/.test(e));
  if (realErrors.length) {
    console.error('console errors:\n' + realErrors.join('\n'));
    throw new Error('console errors during e2e');
  }
  console.log(`✔ Phase 1 e2e passed — screenshots in ${shots}`);
  cleanup(0);
}

main().catch(async (e) => {
  console.error(e);
  await globalThis.dumpPages?.();
  cleanup(1);
});
