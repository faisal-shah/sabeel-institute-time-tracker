import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The four places this checkout states its emulator ports all agree.
 *
 * Three Sabeel repos share this machine, and every one of them used to pin the
 * same ports — so whichever suite started second SIGTERMed the other's
 * Firestore, and both sessions spent real time diagnosing symptoms that belonged
 * to the other process. Each checkout now owns a disjoint block.
 *
 * The ports cannot live in one file. Four consumers need four representations:
 *
 *   firebase.json               JSON   what the emulators actually bind
 *   app/src/env.ts              TS     inlined into the client bundle
 *   scripts/lib/ports.mjs       ESM    read by scripts/*.mjs
 *   free-emulator-ports.sh      shell  the kill list
 *
 * So the goal is not one copy, it is four copies that cannot drift. A mismatch
 * is otherwise silent until something connects to a port nobody is serving —
 * or, far worse, to a port a SIBLING REPO is serving, which reads and writes
 * happily and passes.
 *
 * Lives in `functions/test/unit` because that workspace is the only one here
 * with a test runner wired up; it asserts about repo files, not about functions.
 * Same reasoning as `ci-coverage.test.ts` next door.
 */
const REPO = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');

/** `firebase.json` — what the emulator suite binds. */
function portsFromFirebaseJson(): Record<string, number> {
  const emulators = JSON.parse(read('firebase.json')).emulators as Record<
    string,
    { port?: number; websocketPort?: number }
  >;
  const out: Record<string, number> = {};
  for (const [service, cfg] of Object.entries(emulators)) {
    if (cfg && typeof cfg.port === 'number') out[service] = cfg.port;
    if (cfg && typeof cfg.websocketPort === 'number') {
      out.firestoreWebsocket = cfg.websocketPort;
    }
  }
  return out;
}

/**
 * The client's copy. Parsed rather than imported: `app/src/env.ts` imports
 * `react-native`, which will not load under the functions workspace's vitest.
 */
function portsFromClient(): Record<string, number> {
  const src = read('app/src/env.ts');
  const block = src.match(/EMULATOR_PORTS\s*=\s*\{([^}]*)\}/)?.[1];
  if (!block) throw new Error('EMULATOR_PORTS not found in app/src/env.ts');
  return Object.fromEntries(
    [...block.matchAll(/(\w+)\s*:\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]),
  );
}

/** The scripts' copy. */
async function portsFromScripts(): Promise<Record<string, number>> {
  const mod = await import(resolve(REPO, 'scripts/lib/ports.mjs'));
  return mod.EMULATOR_PORTS as Record<string, number>;
}

/** The shell kill list — a flat set of numbers, not a service map. */
function portsFromShell(): number[] {
  const line = read('scripts/free-emulator-ports.sh').match(/^PORTS=\(([^)]*)\)/m)?.[1];
  if (!line) throw new Error('PORTS=(…) not found in scripts/free-emulator-ports.sh');
  return line.trim().split(/\s+/).map(Number);
}

/**
 * This checkout's block. Bases are 100 apart, one per repo on the machine.
 *
 * 61000+ because the ephemeral range here is 32768–60999
 * (`/proc/sys/net/ipv4/ip_local_port_range`) so nothing above it is handed out
 * at random, and Firebase's own defaults top out at 9499
 * (`firebase-tools/lib/emulator/constants.js`) so the block collides with
 * nothing the CLI would choose for itself.
 */
const BLOCK_START = 61000;
const BLOCK_END = BLOCK_START + 99;

describe('emulator ports agree across every file that states them', () => {
  it('every port is inside this checkout’s block', async () => {
    const scripts = await portsFromScripts();
    expect(Object.keys(scripts).length).toBeGreaterThan(0);

    for (const [service, port] of Object.entries(scripts)) {
      expect(
        port >= BLOCK_START && port <= BLOCK_END,
        `${service}=${port} is outside ${BLOCK_START}-${BLOCK_END} — that is another checkout's territory`,
      ).toBe(true);
    }

    // Distinct, or two services quietly share one listener.
    const values = Object.values(scripts);
    expect(new Set(values).size, 'two services claim the same port').toBe(values.length);
  });

  it('firebase.json matches scripts/lib/ports.mjs', async () => {
    const scripts = await portsFromScripts();
    const config = portsFromFirebaseJson();

    // Guard the guard: an empty parse would make every comparison below
    // trivially true, which is the failure mode this whole file exists to stop.
    expect(Object.keys(config).length).toBeGreaterThan(0);
    expect(Object.keys(scripts).length).toBeGreaterThan(0);

    for (const [service, port] of Object.entries(config)) {
      expect(scripts[service], `firebase.json ${service}=${port}`).toBe(port);
    }
  });

  it('the client bundle uses the same ports as the scripts', async () => {
    const scripts = await portsFromScripts();
    const client = portsFromClient();
    expect(Object.keys(client).length).toBeGreaterThan(0);

    for (const [service, port] of Object.entries(client)) {
      expect(scripts[service], `app/src/env.ts ${service}=${port}`).toBe(port);
    }
  });

  it('free-emulator-ports.sh frees exactly the ports this checkout uses', async () => {
    const scripts = await portsFromScripts();
    const shell = portsFromShell();
    expect(shell.length).toBeGreaterThan(0);

    // Every port we bind must be swept…
    for (const [service, port] of Object.entries(scripts)) {
      expect(shell, `${service}=${port} is not in the PORTS array`).toContain(port);
    }
    // …and nothing else, or the sweep reaches into another checkout's block.
    // That is not hypothetical: on 2026-08-27 a port-based sweep killed a
    // sibling repo's running emulator.
    const owned = new Set(Object.values(scripts));
    for (const port of shell) {
      expect(owned.has(port), `PORTS contains ${port}, which this checkout does not own`).toBe(
        true,
      );
    }
  });
});

/**
 * No script still points at a port this checkout gave up.
 *
 * The port move updated firebase.json, the client, ports.mjs and the sweep
 * lists — and in the sibling kanban repo it MISSED `dev.sh`'s readiness waits,
 * which are live code, plus the copy-paste instructions at the top of eleven
 * operator scripts. Nothing caught it, because no suite runs `dev.sh` and a
 * comment cannot fail a test. This is the guard that would have.
 *
 * Matching `host:port` rather than the bare number on purpose: 4000 and 8000
 * also appear as millisecond timeouts, and a check that cries wolf gets deleted.
 */
const ABANDONED_PORTS = [8080, 9099, 5001, 9199, 9150, 4000, 4400, 4500, 8086, 8083];

function scriptFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(resolve(REPO, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(resolve(REPO, rel)).isDirectory()) out.push(...scriptFiles(rel));
    else if (/\.(mjs|sh|js|ts)$/.test(entry)) out.push(rel);
  }
  return out;
}

describe('no script points at a port this checkout gave up', () => {
  it('scripts/ mentions no abandoned host:port', () => {
    const files = scriptFiles('scripts');
    expect(files.length, 'found no scripts to scan — the walk is broken').toBeGreaterThan(5);

    const offenders: string[] = [];
    for (const file of files) {
      const text = read(file);
      for (const port of ABANDONED_PORTS) {
        const re = new RegExp(`(127\\.0\\.0\\.1|localhost):${port}\\b`);
        if (re.test(text)) offenders.push(`${file} -> :${port}`);
      }
    }
    expect(offenders, `stale port references:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });
});
