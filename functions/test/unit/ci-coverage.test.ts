import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Every browser suite on disk is actually RUN by CI.
 *
 * A suite that is never invoked is not coverage, it is a file — and the totals
 * never move, because they were never counted. `scripts/screens-e2e.mjs` is 100+
 * assertions across five viewport widths and it is worth exactly nothing the
 * first week nobody runs it.
 *
 * CI lists its browser step by name (it needs its own emulator run and its own
 * browser install), so the list cannot be globbed and has to be kept in step by
 * hand. This is what keeps it honest.
 *
 * It lives in `functions/test/unit` because that is the only workspace here with
 * a test runner wired up; it asserts about repo files, not about functions. The
 * emulator suites need no equivalent guard — `test:integration` runs
 * `--dir test/integration`, so a new file there is picked up by the glob rather
 * than by a list somebody has to remember.
 */
const REPO = resolve(import.meta.dirname, '../../..');

/**
 * Suites CI does not run, with the reason. Everything else must have a step.
 *
 * `web-e2e.mjs` drives the entire product lifecycle — sign-up, approval, clock
 * in/out, submit, reject, resubmit, approve, report, CSV — and needs its own
 * emulator run and its own web export on top of the sweep's. Nothing *blocks* it
 * from CI any more (it moved onto Playwright's bundled Chromium with the rest of
 * `scripts/lib/e2e-stack.mjs`, so it no longer needs a system browser); keeping
 * it out is a wall-clock decision. It is run by hand instead — before pushing,
 * and after any rules change (`docs/PRODUCTION-REVIEW.md`). If it ever gets a CI
 * step, the test below fails and this entry must be deleted.
 */
const LOCAL_ONLY = new Set(['web-e2e.mjs']);

const suitesOnDisk = () =>
  readdirSync(resolve(REPO, 'scripts')).filter((f) => f.endsWith('-e2e.mjs'));
const ci = () => readFileSync(resolve(REPO, '.github/workflows/ci.yml'), 'utf8');

/**
 * The workflow with its COMMENTS STRIPPED.
 *
 * The first version of this searched the whole file, and the comment above the
 * sweep's step names the script — so deleting `run: npm run test:screens`
 * outright left this test green, which is precisely the hole it exists to close.
 * A step is a command, not a mention of one.
 */
const ciCommands = () =>
  ci()
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');

describe('CI browser-suite coverage', () => {
  it('runs every scripts/*-e2e.mjs suite', () => {
    const onDisk = suitesOnDisk();
    // Guard the guard: if the glob ever matches nothing, "all of them are in CI"
    // is trivially true and this test would pass while proving nothing.
    expect(onDisk.length).toBeGreaterThan(0);

    const workflow = ciCommands();
    const missing = onDisk
      .filter((f) => !LOCAL_ONLY.has(f))
      .filter((f) => !workflow.includes(`scripts/${f}`) && !workflow.includes(npmScriptFor(f)));
    expect(missing, `e2e suites on disk but not run by CI: ${missing.join(', ')}`).toEqual([]);
  });

  /**
   * The exemption is itself checked, because an allowlist nobody verifies is how
   * "temporarily local-only" becomes permanent.
   */
  it('keeps the local-only list honest', () => {
    const onDisk = new Set(suitesOnDisk());
    const workflow = ciCommands();
    for (const f of LOCAL_ONLY) {
      expect(onDisk.has(f), `${f} is listed local-only but no longer exists`).toBe(true);
      expect(
        workflow.includes(`scripts/${f}`) || workflow.includes(npmScriptFor(f)),
        `${f} is now run by CI — delete it from LOCAL_ONLY`,
      ).toBe(false);
    }
  });

  /**
   * CI must also INSTALL the browser it is about to drive. Without this the
   * sweep step fails on every run with "Executable doesn't exist", which reads
   * like a broken suite rather than a missing setup step.
   */
  it('installs the browser the sweep needs', () => {
    expect(ciCommands()).toMatch(/playwright install[^\n]*chromium/);
  });
});

/**
 * A suite may be wired into CI by its path or by the npm script that wraps it —
 * matching only the path would call `npm run test:screens` "not in CI".
 */
function npmScriptFor(file: string): string {
  const pkg = JSON.parse(readFileSync(resolve(REPO, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  const hit = Object.entries(pkg.scripts).find(([, cmd]) => cmd.includes(`scripts/${file}`));
  return hit ? `npm run ${hit[0]}` : `scripts/${file}`;
}
