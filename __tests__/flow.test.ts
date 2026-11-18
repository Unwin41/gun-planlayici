import { describe, expect, it } from '@jest/globals';

import { buildCarryOver, mainReason, missedCheckinDate, nextPlanDate, planningDate, recentStats, startFromFor, streak, unfinishedGroups } from '@/chat/flow';
import type { DayPlan, Task } from '@/types';
import { normalizeTime } from '@/utils/time';

const task = (title: string, done: boolean, extra: Partial<Task> = {}): Task => ({
  id: `${title}-${Math.random()}`,
  title,
  baseTitle: title,
  start: '09:00',
  end: '09:45',
  category: 'ders',
  done,
  carryCount: 0,
  ...extra,
});

const day = (date: string, tasks: Task[], extra: Partial<DayPlan> = {}): DayPlan => ({ date, tasks, source: 'rules', ...extra });

describe('unfinishedGroups / buildCarryOver', () => {
  it('merges blocks of the same job and skips done and flex tasks', () => {
    const d = day('2026-11-17', [
      task('Matematik (1/2)', false, { baseTitle: 'Matematik', start: '09:00', end: '09:40' }),
      task('Matematik (2/2)', false, { baseTitle: 'Matematik', start: '09:50', end: '10:30', carryCount: 1 }),
      task('Kitap', true),
      task('Esnek', false, { flex: true }),
    ]);
    const groups = unfinishedGroups(d);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ baseTitle: 'Matematik', remainingMin: 80, carryCount: 1 });

    expect(buildCarryOver(d, { Matematik: 'yorgundum' })).toEqual([
      { title: 'Matematik', category: 'ders', durationMin: 80, carryCount: 2, reason: 'yorgundum' },
    ]);
  });
});

describe('dates', () => {
  it('plans the next day, never in the past', () => {
    expect(nextPlanDate('2026-11-17', '2026-11-17')).toBe('2026-11-18');
    expect(nextPlanDate('2026-11-16', '2026-11-17')).toBe('2026-11-17');
    expect(nextPlanDate('2026-11-10', '2026-11-17')).toBe('2026-11-17');
  });

  it('starts today from now (rounded up) and other days from wake time', () => {
    const now = new Date(2026, 10, 17, 14, 7);
    expect(startFromFor('2026-11-17', '2026-11-17', '07:30', now)).toBe('14:15');
    expect(startFromFor('2026-11-18', '2026-11-17', '07:30', now)).toBe('07:30');
    expect(startFromFor('2026-11-17', '2026-11-17', '07:30', new Date(2026, 10, 17, 6, 0))).toBe('07:30');
  });

  it('plans tomorrow when today is almost over', () => {
    const at = (h: number, m = 0) => new Date(2026, 10, 17, h, m);
    expect(planningDate('2026-11-17', '07:30', '23:00', at(14))).toBe('2026-11-17');
    expect(planningDate('2026-11-17', '07:30', '23:00', at(21, 15))).toBe('2026-11-17'); // 21:15–22:30 left
    expect(planningDate('2026-11-17', '07:30', '23:00', at(21, 45))).toBe('2026-11-18');
    expect(planningDate('2026-11-17', '07:30', '23:00', at(23, 5))).toBe('2026-11-18');
    expect(planningDate('2026-11-17', '07:30', '23:00', at(6))).toBe('2026-11-17'); // before waking up
    expect(planningDate('2026-11-17', '08:00', '01:00', at(22))).toBe('2026-11-17'); // bedtime after midnight
  });

  it('finds a missed check-in from yesterday only', () => {
    const days = { '2026-11-16': day('2026-11-16', [task('A', false)]) };
    expect(missedCheckinDate(days, '2026-11-17')).toBe('2026-11-16');
    const checked = { '2026-11-16': day('2026-11-16', [task('A', false)], { checkin: { followed: 'no', reasons: {}, at: '' } }) };
    expect(missedCheckinDate(checked, '2026-11-17')).toBeNull();
  });
});

describe('stats', () => {
  const days = {
    '2026-11-14': day('2026-11-14', [task('A', true), task('B', true)]),
    '2026-11-15': day('2026-11-15', [task('A', true), task('B', true), task('C', true), task('D', true), task('E', false)]),
    '2026-11-16': day('2026-11-16', [task('A', false), task('B', true)], {
      checkin: { followed: 'partly', reasons: { A: 'telefon_dikkat' }, at: '' },
    }),
  };

  it('computes completion and top reasons', () => {
    const s = recentStats(days, '2026-11-17')!;
    expect(s.completionRate).toBeCloseTo((1 + 0.8 + 0.5) / 3);
    expect(s.topReasons).toEqual(['telefon_dikkat']);
  });

  it('counts the streak of good days', () => {
    // An unfinished "today" (16th, 50%) does not break the streak of the days before it.
    expect(streak(days, '2026-11-16')).toBe(2);
    expect(streak(days, '2026-11-15')).toBe(2);
    // Once that bad day is yesterday, the streak is broken.
    expect(streak(days, '2026-11-17')).toBe(0);
  });

  it('picks the most common reason', () => {
    expect(mainReason({ a: 'yorgundum', b: 'zaman_yetmedi', c: 'yorgundum' })).toBe('yorgundum');
    expect(mainReason({})).toBeNull();
  });
});

describe('normalizeTime', () => {
  it('accepts common inputs', () => {
    expect(normalizeTime('7')).toBe('07:00');
    expect(normalizeTime('7.30')).toBe('07:30');
    expect(normalizeTime('2130')).toBe('21:30');
    expect(normalizeTime('25:00')).toBeNull();
    expect(normalizeTime('abc')).toBeNull();
  });
});
