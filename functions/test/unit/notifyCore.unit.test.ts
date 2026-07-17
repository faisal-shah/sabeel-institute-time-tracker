import { describe, expect, it } from 'vitest';
import {
  inReminderWindow,
  localClock,
  prefOn,
  reminderEligible,
  reminderPeriod,
  texts,
} from '../../src/notifyCore';

describe('prefOn', () => {
  it('missing prefs or missing key mean ON; explicit false means OFF', () => {
    expect(prefOn(undefined, 'reminder')).toBe(true);
    expect(prefOn({}, 'reminder')).toBe(true);
    expect(prefOn({ reminder: false }, 'reminder')).toBe(false);
    expect(prefOn({ reminder: false }, 'rejected')).toBe(true);
  });
});

describe('reminder window (Tuesday 10:00 local)', () => {
  // 2026-07-14 is a Tuesday. 14:30 UTC = 10:30 in New York (EDT, UTC-4).
  const tueUtc = Date.UTC(2026, 6, 14, 14, 30);
  it('hits in the timezone where it is Tuesday 10am', () => {
    expect(localClock(tueUtc, 'America/New_York')).toEqual({ weekday: 2, hour: 10 });
    expect(inReminderWindow(tueUtc, 'America/New_York')).toBe(true);
  });
  it('misses elsewhere at the same instant', () => {
    expect(inReminderWindow(tueUtc, 'Asia/Singapore')).toBe(false); // 22:30 Tue
    expect(inReminderWindow(tueUtc, 'UTC')).toBe(false); // 14:30 Tue
  });
  it('Singapore gets its own window at Tuesday 10am local (02:00 UTC)', () => {
    expect(inReminderWindow(Date.UTC(2026, 6, 14, 2, 15), 'Asia/Singapore')).toBe(true);
  });
});

describe('reminderPeriod', () => {
  it('is the period before the one containing today', () => {
    // Tue 2026-07-14 sits in the 07-12..07-18 period; previous is 07-05..07-11.
    expect(reminderPeriod('2026-07-14')).toEqual({ fromKey: '2026-07-05', toKey: '2026-07-11' });
  });
  it('crosses month boundaries through the clipped weeks', () => {
    // 2026-07-01 (Wed) is in the clipped 07-01..07-04 period; previous is June's
    // final clipped period 06-28..06-30.
    expect(reminderPeriod('2026-07-01')).toEqual({ fromKey: '2026-06-28', toKey: '2026-06-30' });
  });
});

describe('reminderEligible', () => {
  it('submitted/approved sheets are done', () => {
    expect(reminderEligible('submitted', true)).toBe(false);
    expect(reminderEligible('approved', true)).toBe(false);
  });
  it('rejected always needs attention', () => {
    expect(reminderEligible('rejected', false)).toBe(true);
  });
  it('no sheet: only nag when hours were logged', () => {
    expect(reminderEligible(null, true)).toBe(true);
    expect(reminderEligible(null, false)).toBe(false);
  });
});

describe('texts', () => {
  it('reject body carries the reason; submitted flags resubmits', () => {
    const range = { fromKey: '2026-07-05', toKey: '2026-07-11' };
    expect(texts.rejected(range, 'Missing Friday hours').body).toContain('Missing Friday hours');
    expect(texts.submitted('Alice', range, true).title).toBe('Timesheet resubmitted');
    expect(texts.submitted('Alice', range, false).title).toBe('Timesheet submitted');
  });
});
