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
import { createReadStream, createWriteStream, existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const root = new URL('..', import.meta.url).pathname;
const shots = process.env.E2E_SHOTS_DIR ?? join(root, 'e2e-shots');
mkdirSync(shots, { recursive: true });

const children = [];
let staticServer = null;
function bg(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  children.push(child);
  return child;
}
function cleanup(code) {
  try {
    staticServer?.close();
  } catch {
    /* already closed */
  }
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

/**
 * The functions emulator ACCEPTS CONNECTIONS on 5001 well before it has
 * registered any function: until then every call 404s with "Function ... does
 * not exist". A 404 carries no CORS headers, so in the browser that surfaces as
 * a misleading "blocked by CORS policy" error and the app shows a bare
 * "internal" — which looks like a broken callable rather than a race.
 * Wait for a known callable to actually EXIST, not merely for the port to answer.
 */
function waitForFunctionRegistered(name, timeoutMs = 180000) {
  const url = `http://127.0.0.1:5001/demo-sabeel/us-central1/${name}`;
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      const req = http.request(url, { method: 'OPTIONS' }, (res) => {
        res.resume();
        if (res.statusCode !== 404) resolve();
        else if (Date.now() > deadline) reject(new Error(`timeout: ${name} never registered`));
        else setTimeout(tick, 1000);
      });
      req.on('error', () => {
        if (Date.now() > deadline) reject(new Error(`timeout: ${name} never registered`));
        else setTimeout(tick, 1000);
      });
      req.end();
    };
    tick();
  });
}

async function main() {
  // 1. Build functions + export the web bundle in emulator mode.
  console.log('▸ building functions and web bundle (emulator mode)…');
  execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
  // --clear: EXPO_PUBLIC_* vars are inlined at bundle time and Metro's cache can
  // serve a bundle built under DIFFERENT env (e.g. a prod export) — never trust it.
  execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist-web', '--clear'], {
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
  // A previous run that was killed leaves emulators squatting on these ports;
  // the next run then talks to a half-dead one (see free-emulator-ports.sh).
  execFileSync('bash', [join(root, 'scripts/free-emulator-ports.sh')], { stdio: 'inherit' });

  console.log('▸ starting Firebase emulators…');
  const emu = bg(
    'firebase',
    ['emulators:start', '--project', 'demo-sabeel', '--only', 'auth,firestore,functions'],
    { env, detached: true },
  );
  // Full emulator output goes to a log TRUNCATED PER RUN. It used to be
  // appended/left behind, so debugging a failure meant reading a log from days
  // earlier and drawing confident conclusions from it.
  const emuLogPath = join(shots, 'emulator.log');
  const emuLog = createWriteStream(emuLogPath, { flags: 'w' });
  // Surface emulator trouble (e.g. a function param prompt that would hang a
  // headless run) instead of silently timing out later.
  const emuWatch = (d) => {
    const s = d.toString();
    emuLog.write(s);
    if (/error|Error|Enter a string value|throw|internal/i.test(s)) process.stderr.write(s);
  };
  emu.stderr.on('data', emuWatch);
  emu.stdout.on('data', emuWatch);
  await waitFor('http://127.0.0.1:9099', 'auth emulator');
  await waitFor('http://127.0.0.1:8080', 'firestore emulator');
  await waitFor('http://127.0.0.1:5001', 'functions emulator', 120000);
  // Port-open is not function-ready; see waitForFunctionRegistered.
  await waitForFunctionRegistered('setUserAccess');
  console.log('  (functions registered)');

  // 3. Static server for the exported bundle (SPA fallback to index.html).
  const dist = join(root, 'app', 'dist-web');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  staticServer = http.createServer((req, res) => {
    const path = req.url.split('?')[0];
    let file = join(dist, path);
    if (path === '/' || !existsSync(file)) file = join(dist, 'index.html');
    res.setHeader('content-type', types[extname(file)] ?? 'application/octet-stream');
    createReadStream(file).pipe(res);
  });
  // Ephemeral port: avoids colliding with a prior run's lingering server.
  await new Promise((r) => staticServer.listen(0, '127.0.0.1', r));
  const baseUrl = `http://127.0.0.1:${staticServer.address().port}`;

  // 4. Drive it.
  console.log('▸ launching Chrome…');
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox'],
  });

  const consoleErrors = [];
  // Every non-2xx response from the functions emulator, WITH ITS BODY. A
  // callable failure reaches the UI as a bare "internal" and, if the function
  // is missing entirely, as a browser CORS complaint — neither says what
  // happened server-side. Capturing the raw response here is the difference
  // between reading the answer and hand-writing a repro script to find it.
  const callableFailures = [];
  const pages = new Map();
  async function newPage(label) {
    const ctx = await browser.newContext({
      viewport: { width: 420, height: 860 },
      acceptDownloads: true,
    });
    const page = await ctx.newPage();
    pages.set(label, page);
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(`[${label}] ${m.text()}`);
      if (m.type() === 'warning' && /listener|session poll/.test(m.text()))
        console.log(`  (warn) [${label}] ${m.text()}`);
    });
    page.on('response', async (resp) => {
      if (!/:5001\//.test(resp.url()) || resp.status() < 400) return;
      let body = '';
      try {
        body = (await resp.text()).slice(0, 400);
      } catch {
        /* body already discarded */
      }
      callableFailures.push(`[${label}] ${resp.status()} ${resp.url()}\n    ${body}`);
    });
    page.on('requestfailed', (req) => {
      if (!/:5001\//.test(req.url())) return;
      callableFailures.push(
        `[${label}] REQUEST FAILED ${req.url()}\n    ${req.failure()?.errorText ?? ''}` +
          '\n    (a 404 from the functions emulator carries no CORS headers, so the' +
          '\n     browser reports this as a CORS error — check function registration)',
      );
    });
    await page.goto(baseUrl + '/');
    return page;
  }
  // On any failure, dump what every page was showing AND why the server said no.
  process.on('unhandledRejection', () => {});
  globalThis.dumpDiagnostics = () => {
    if (callableFailures.length) {
      console.error('\n--- failed calls to the functions emulator ---');
      console.error(callableFailures.join('\n'));
    }
    if (consoleErrors.length) {
      console.error('\n--- browser console errors ---');
      console.error(consoleErrors.slice(-15).join('\n'));
    }
    console.error(`\n--- emulator log: ${join(shots, 'emulator.log')} (this run) ---`);
  };
  globalThis.dumpPages = async () => {
    for (const [label, p] of pages) {
      await p
        .screenshot({ path: join(shots, `fail-${label}.png`), animations: 'disabled' })
        .catch(() => {}).catch(() => {});
    }
  };
  async function devSignIn(page, email) {
    await page.getByPlaceholder('email').fill(email);
    await page.getByText('Dev: sign in', { exact: true }).click();
  }

  console.log('▸ admin signs in → must land on the pending gate…');
  const admin = await newPage('admin');
  // Capture the sign-in screen itself (ivory chrome) before signing in — the
  // screen that once diverged from the sibling app on brand chrome.
  await admin.getByText('Time Tracker', { exact: true }).waitFor();
  await admin.screenshot({ path: join(shots, '0-signin.png'), animations: 'disabled', timeout: 8000 }).catch(() => {});
  await devSignIn(admin, 'admin@oursabeel.com');
  await admin.getByText('waiting for an administrator', { exact: false }).waitFor();
  await admin.screenshot({ path: join(shots, '1-admin-pending.png'), animations: 'disabled', timeout: 8000 }).catch(() => {});

  console.log('▸ grant-admin bootstrap → page must un-gate LIVE (claims refresh)…');
  execFileSync('node', ['scripts/grant-admin.mjs', 'admin@oursabeel.com'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    },
  });
  await admin.getByText('Salaam,', { exact: false }).waitFor({ timeout: 30000 });
  await admin.screenshot({ path: join(shots, '2-admin-home.png'), animations: 'disabled', timeout: 8000 }).catch(() => {});

  console.log('▸ a volunteer signs in on their own device → pending gate…');
  const vol = await newPage('volunteer');
  await devSignIn(vol, 'volunteer@oursabeel.com');
  await vol.getByText('waiting for an administrator', { exact: false }).waitFor();

  console.log('▸ admin opens Manage users and sees the volunteer name+email…');
  await admin.getByText('Manage users').click();
  await admin.getByText('volunteer@oursabeel.com').waitFor();
  await admin.screenshot({ path: join(shots, '3-users-pending.png'), animations: 'disabled', timeout: 8000 }).catch(() => {});

  console.log('▸ admin taps Approve → volunteer page must flip to Home live…');
  await admin.getByText('Approve', { exact: true }).click();
  // The session poll force-refreshes the token every few seconds, so the
  // volunteer un-gates on its own within ~one poll interval of approval.
  await vol.getByText('Salaam,', { exact: false }).waitFor({ timeout: 30000 });
  await vol.screenshot({ path: join(shots, '4-volunteer-home.png'), animations: 'disabled', timeout: 8000 }).catch(() => {});
  await admin.screenshot({ path: join(shots, '5-users-after.png'), animations: 'disabled', timeout: 8000 }).catch(() => {});

  // Volunteer must NOT see the admin button.
  const manageCount = await vol.getByText('Manage users').count();
  if (manageCount !== 0) throw new Error('volunteer sees the admin Manage users button');

  console.log('▸ Phase 2: manager creates, archives, restores activities…');
  // Fresh page, same context: auth persists (IndexedDB), lands on Home.
  const admin2 = await admin.context().newPage();
  pages.set('admin2', admin2);
  await admin2.goto(baseUrl + '/');
  await admin2.getByText('Salaam,', { exact: false }).waitFor();
  await admin2.getByText('Activities', { exact: true }).click();

  async function addActivity(name) {
    const input = admin2.getByPlaceholder('New activity name');
    await input.fill(name);
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
  await addActivity('Tutoring');
  await addActivity('Food Drive');
  await admin2.getByText('Archive', { exact: true }).first().click();
  await admin2.getByText('Restore', { exact: true }).waitFor();
  await admin2.screenshot({ path: join(shots, '6-activities.png'), animations: 'disabled', timeout: 8000 }).catch(() => {});

  // Members don't get the manager entry point (Home's Activities button).
  const actCount = await vol.getByText('Activities', { exact: true }).count();
  if (actCount !== 0) throw new Error('member sees the manager Activities button');

  // The activity/approver pickers are searchable modals now: click the field,
  // then the item inside the modal (modals render last in the DOM → .last()).
  async function pickFromModal(page, fieldText, itemText) {
    await page.getByText(fieldText, { exact: false }).last().click();
    await page.getByPlaceholder('Search…').waitFor();
    await page.getByText(itemText, { exact: false }).last().click();
  }

  console.log('▸ Phase 3: volunteer clocks in, clocks out, adds manual hours…');
  // Tutoring is the only active activity (Food Drive was archived above).
  await pickFromModal(vol, 'Pick an activity', 'Tutoring');
  await vol.getByText('Clock in', { exact: true }).click();
  await vol.getByText('CLOCKED IN').waitFor();
  await vol.screenshot({ path: join(shots, '7-clocked-in.png'), animations: 'disabled', timeout: 8000 }).catch(() => {});

  await vol.getByText('Clock out', { exact: true }).click();
  await vol.getByText('What are you working on?').waitFor();
  // The 1-minute floor on clock sessions must show up in today's total.
  await vol.getByText('Today: 1m').waitFor();

  await vol.getByText('Add hours manually').click();
  await pickFromModal(vol, 'Pick an activity', 'Tutoring');
  const times = vol.locator('input');
  await times.nth(1).fill('09:00'); // from  (nth(0) is the date)
  await times.nth(2).fill('10:30'); // to
  await vol.getByText('What did you work on?', { exact: false }).waitFor();
  await vol.locator('textarea').fill('Math tutoring with the kids');
  // The filled form, pre-save — this is the manual's add-hours illustration.
  await vol.screenshot({ path: join(shots, '8a-add-hours.png'), animations: 'disabled', timeout: 8000 }).catch(() => {});
  await vol.getByText('Save hours', { exact: true }).click();
  await vol.getByText('Today: 1h 31m').waitFor({ timeout: 15000 });
  await vol.screenshot({ path: join(shots, '8-after-manual.png'), animations: 'disabled', timeout: 8000 }).catch(() => {});

  console.log('▸ Phase 4: period timesheet — edit an entry, delete an entry…');
  await vol.getByText('My timesheet', { exact: true }).click();
  await vol.getByText('Week total: 1h 31m', { exact: true }).waitFor();
  await vol.screenshot({ path: join(shots, '9-timesheet.png'), animations: 'disabled', timeout: 8000 }).catch(() => {});

  // Edit the manual entry (found by its note) to end at 11:00 → total 2h 01m.
  await vol.getByText('Math tutoring with the kids').click();
  await vol.locator('input').nth(2).fill('11:00');
  await vol.getByText('Save changes', { exact: true }).click();
  await vol.getByText('Week total: 2h 01m', { exact: true }).waitFor();

  // Delete the 1-minute clock entry → total 2h 00m.
  await vol.getByText('1m', { exact: true }).last().click();
  await vol.getByText('Delete entry', { exact: true }).click();
  await vol.getByText('Week total: 2h 00m', { exact: true }).waitFor();
  await vol.screenshot({ path: join(shots, '10-timesheet-period.png'), animations: 'disabled', timeout: 8000 }).catch(() => {});

  console.log('▸ overlap guard: conflicting entries are flagged and block submission…');
  // 10:00–10:45 overlaps the existing 09:00–11:00 entry → both rows flagged.
  await vol.goto(baseUrl + '/');
  await vol.getByText('Salaam,', { exact: false }).waitFor({ timeout: 45000 });
  await vol.getByText('Add hours manually').click();
  await pickFromModal(vol, 'Pick an activity', 'Tutoring');
  const ovIn = vol.locator('input');
  await ovIn.nth(1).fill('10:00');
  await ovIn.nth(2).fill('10:45');
  await vol.getByText('Save hours', { exact: true }).click();
  await vol.getByText('My timesheet', { exact: true }).click();
  const flagged = vol.getByText('Overlaps another entry', { exact: true });
  await flagged.first().waitFor();
  if ((await flagged.count()) !== 2) throw new Error('expected both overlapping rows flagged');
  await vol.getByText('fix the highlighted times', { exact: false }).waitFor();
  await vol.screenshot({ path: join(shots, '10b-overlap.png'), animations: 'disabled', timeout: 8000 }).catch(() => {});
  // A butt-joint edit (start at the other entry's end) clears the conflict.
  // Select the row by its unique times — both rows carry the same conflict label.
  await vol.getByText('10:00–10:45', { exact: false }).click();
  await vol.locator('input').nth(1).fill('11:00');
  await vol.locator('input').nth(2).fill('11:45');
  await vol.getByText('Save changes', { exact: true }).click();
  await vol.getByText('Week total: 2h 45m', { exact: true }).waitFor();
  if ((await vol.getByText('Overlaps another entry', { exact: true }).count()) !== 0)
    throw new Error('overlap flag should clear after the fix');
  // Put the total back where later phases expect it: delete the extra entry.
  await vol.getByText('45m', { exact: true }).last().click();
  await vol.getByText('Delete entry', { exact: true }).click();
  await vol.getByText('Week total: 2h 00m', { exact: true }).waitFor();

  console.log('▸ stale-listener guard: switching weeks must clear rows even on a slow network…');
  // Localhost snapshots arrive in ~ms, which is exactly why this bug class
  // (docs/POSTMORTEM-2026-07-16-stale-week.md) escaped the e2e: on a real phone
  // the new week's snapshot lags and the old week's rows lingered on screen.
  // Simulate the lag by stalling all Firestore emulator traffic; the UI must
  // clear the previous week's entries IMMEDIATELY (reset-on-input-change),
  // without waiting for data.
  const shared = await import('@sabeel/shared');
  const todayKey = shared.dayKeyFor(Date.now(), shared.deviceTimeZone());
  const otherWeek = shared
    .periodsOfMonth(todayKey)
    .find((p) => p.fromKey !== shared.periodKeyFor(todayKey));
  const stall = async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue().catch(() => {});
  };
  await vol.context().route('http://127.0.0.1:8080/**', stall);
  await vol.getByText(shared.periodLabel(otherWeek), { exact: false }).first().click();
  // Old rows must vanish at once — long before the stalled snapshot can land.
  await vol.getByText('No hours in this week.').waitFor({ timeout: 1500 });
  if ((await vol.getByText('Math tutoring with the kids').count()) !== 0)
    throw new Error("stale entries visible under a different week's timesheet");
  await vol.context().unroute('http://127.0.0.1:8080/**');
  await vol.getByText('Jump to current week', { exact: true }).click();
  await vol.getByText('Math tutoring with the kids').waitFor({ timeout: 15000 });

  console.log('▸ Phase 7: volunteer picks an approver and submits the week…');
  // Submit is gated until an approver is chosen (rules require the stamp).
  await vol.getByText('Pick your timesheet approver', { exact: false }).waitFor();
  await vol.goto(baseUrl + '/');
  await vol.getByText('Salaam,', { exact: false }).waitFor({ timeout: 45000 });
  await pickFromModal(vol, 'Choose who approves your hours', 'Admin');
  // The field echoes the selection once the profile listener catches up — wait
  // for it so Submit isn't clicked while still disabled.
  await vol.getByText('Admin', { exact: true }).first().waitFor();
  await vol.getByText('My timesheet', { exact: true }).click();
  await vol.getByText('Submit timesheet', { exact: true }).click();
  await vol.getByText('Submitted', { exact: true }).first().waitFor();
  await vol.screenshot({ path: join(shots, '11-submitted.png'), animations: 'disabled', timeout: 8000 }).catch(() => {});

  console.log('▸ Phase 7: approver rejects with a reason → volunteer sees it live…');
  const mgr = admin;
  await mgr.goto(baseUrl + '/');
  await mgr.getByText('Salaam,', { exact: false }).waitFor({ timeout: 45000 });
  await mgr.getByText('Approvals (1)', { exact: true }).click();
  await mgr.getByText('Volunteer', { exact: true }).last().click();
  await mgr.getByText('Total: 2h 00m', { exact: false }).waitFor();
  await mgr.getByPlaceholder('What needs fixing?').fill('Tuesday hours belong to Food Drive.');
  await mgr.getByText('Reject timesheet', { exact: true }).click();
  await mgr.getByText('Nothing waiting for approval', { exact: false }).waitFor();

  // Volunteer home shows the rejection banner live; the reason shows on the sheet.
  await vol.goto(baseUrl + '/');
  await vol.getByText('A timesheet was rejected', { exact: false }).waitFor({ timeout: 30000 });
  // Banner → Needs-attention list (reason inline) → tap the row → the week view.
  await vol.getByText('A timesheet was rejected', { exact: false }).click();
  await vol.getByText('to fix and resubmit', { exact: false }).waitFor();
  await vol.getByText('Tuesday hours belong to Food Drive.', { exact: false }).click();
  await vol.getByText('Fix the entries below', { exact: false }).waitFor();
  await vol.screenshot({ path: join(shots, '12-rejected.png'), animations: 'disabled', timeout: 8000 }).catch(() => {});

  console.log('▸ Phase 7: volunteer resubmits; approver adds hours on behalf + approves…');
  await vol.getByText('Resubmit timesheet', { exact: true }).click();
  await vol.getByText('Submitted', { exact: true }).first().waitFor();

  await mgr.goto(baseUrl + '/');
  await mgr.getByText('Salaam,', { exact: false }).waitFor({ timeout: 45000 });
  await mgr.getByText('Approvals (1)', { exact: true }).click();
  await mgr.getByText('Volunteer', { exact: true }).last().click();
  // Add a 1h entry on the volunteer's behalf (approver correction path).
  await mgr.getByText('Add entry for Volunteer', { exact: true }).click();
  await mgr.getByText('Adding hours for Volunteer', { exact: false }).waitFor();
  await pickFromModal(mgr, 'Pick an activity', 'Tutoring');
  const mgrTimes = mgr.locator('input');
  await mgrTimes.nth(1).fill('14:00');
  await mgrTimes.nth(2).fill('15:00');
  await mgr.getByText('Save hours', { exact: true }).click();
  // Back on the review screen the live total includes the added hour.
  await mgr.getByText('Total: 3h 00m', { exact: false }).waitFor({ timeout: 15000 });
  await mgr.getByText('Approve timesheet', { exact: true }).click();
  await mgr.getByText('Nothing waiting for approval', { exact: false }).waitFor();
  await mgr.screenshot({ path: join(shots, '13-approved-queue-empty.png'), timeout: 8000 }).catch(() => {});

  console.log('▸ Phase 7: approved week is locked for the volunteer…');
  await vol.goto(baseUrl + '/');
  await vol.getByText('Salaam,', { exact: false }).waitFor({ timeout: 45000 });
  await vol.getByText('Approved', { exact: true }).first().waitFor({ timeout: 30000 });
  // The clock-in card is replaced by the lock notice.
  await vol.getByText("This week's timesheet is approved", { exact: false }).waitFor();
  await vol.getByText('My timesheet', { exact: true }).click();
  await vol.getByText('this week is locked', { exact: false }).waitFor();
  const editCount = await vol.getByText('Submit timesheet', { exact: true }).count();
  if (editCount !== 0) throw new Error('approved sheet still offers Submit');
  await vol.screenshot({ path: join(shots, '14-approved-locked.png'), animations: 'disabled', timeout: 8000 }).catch(() => {});

  console.log('▸ Phase 5: reports count APPROVED hours; CSV has real emails…');
  await mgr.goto(baseUrl + '/');
  await mgr.getByText('Salaam,', { exact: false }).waitFor({ timeout: 45000 });
  await mgr.getByText('Reports', { exact: true }).click();
  // 'all' period, everyone, official view → the volunteer's approved 3h.
  await mgr.getByText('all', { exact: true }).click();
  await mgr.getByText('3h 00m', { exact: true }).first().waitFor({ timeout: 15000 });
  await mgr.screenshot({ path: join(shots, '15-reports.png'), timeout: 8000 }).catch(async (e) => {
    console.log('  (shot15 page-shot failed: ' + e.message.split('\n')[0] + ' — trying element shot)');
    await mgr.locator('body').screenshot({ path: join(shots, '15-reports.png'), timeout: 8000 }).catch((e2) => console.log('  (shot15 element shot failed too: ' + e2.message.split('\n')[0] + ')'));
  });

  // CSV download: capture the browser download and assert its contents.
  const [dl] = await Promise.all([
    mgr.waitForEvent('download'),
    mgr.getByText('Export CSV', { exact: true }).click(),
  ]);
  const dlPath = join(shots, 'export.csv');
  await dl.saveAs(dlPath);
  const csv = readFileSync(dlPath, 'utf8');
  if (!/Person,Email,Activity,Date,Start,End/.test(csv))
    throw new Error('CSV missing header: ' + csv.slice(0, 80));
  if (!/Volunteer/.test(csv)) throw new Error('CSV missing the volunteer row');
  if (!/volunteer@oursabeel\.com/.test(csv)) throw new Error('CSV missing the volunteer email');

  console.log('▸ Phase 5b: Drive sync button degrades gracefully when unconfigured…');
  // Still on Reports here — test the sync button before navigating away.
  await mgr.getByText('Sync to Google Drive now').click();
  await mgr.getByText('isn’t connected yet', { exact: false }).waitFor({ timeout: 15000 });

  // Lifetime statement for the volunteer. "Volunteer" appears both as a Person
  // filter chip (earlier) and as the tappable By-person row (later) — .last()
  // is the row that navigates to the statement.
  await mgr.getByText('Volunteer', { exact: true }).last().click();
  await mgr.getByText('LIFETIME APPROVED HOURS').last().waitFor();
  await mgr.getByText('3h 00m', { exact: true }).last().waitFor();
  await mgr.screenshot({ path: join(shots, '16-person-detail.png'), animations: 'disabled', timeout: 8000 }).catch(() => {});

  console.log('▸ notification settings: reminder toggle flips and persists…');
  await vol.goto(baseUrl + '/');
  await vol.getByText('Salaam,', { exact: false }).waitFor({ timeout: 45000 });
  await vol.getByText('Notification settings', { exact: true }).click();
  await vol.getByText('Weekly submit reminder').waitFor();
  // Members see three switches; the reminder is last. RN-web renders them as
  // checkbox inputs — checked is a DOM *property*, so read it via evaluate.
  const reminderState = () =>
    vol.evaluate(() => {
      // eslint-disable-next-line no-undef
      const sws = document.querySelectorAll('[role="switch"]');
      const el = sws[sws.length - 1];
      return el ? !!el.checked : null;
    });
  if ((await reminderState()) !== true) throw new Error('reminder pref should default ON');
  await vol.locator('[role="switch"]').last().click();
  // Reload → the pref must come back OFF from Firestore, not local state.
  await vol.goto(baseUrl + '/');
  await vol.getByText('Salaam,', { exact: false }).waitFor({ timeout: 45000 });
  await vol.getByText('Notification settings', { exact: true }).click();
  await vol.getByText('Weekly submit reminder').waitFor();
  await vol.waitForFunction(
     
    () => {
      // eslint-disable-next-line no-undef
      const sws = document.querySelectorAll('[role="switch"]');
      return sws.length > 0 && sws[sws.length - 1].checked === false;
    },
    undefined,
    { timeout: 10000 },
  );
  await vol.screenshot({ path: join(shots, '17-notification-settings.png'), animations: 'disabled', timeout: 8000 }).catch(() => {});

  await browser.close();
  staticServer.close();

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
  globalThis.dumpDiagnostics?.();
  await globalThis.dumpPages?.();
  cleanup(1);
});
