import { describe, expect, it } from '@jest/globals';

import { partTitle, schedule, shareCount, splitDuration, type Job, type ScheduleOptions } from '@/planner/schedule';
import { toMin } from '@/utils/time';

const opts: ScheduleOptions = {
  wakeTime: '08:00',
  sleepTime: '23:00',
  startFrom: '08:00',
  maxBlock: 50,
  gap: 10,
  endBuffer: 30,
  loadFactor: 0.9,
  flexSlot: false,
};

const job = (title: string, durationMin: number, extra: Partial<Job> = {}): Job => ({
  title,
  baseTitle: title,
  category: 'ders',
  durationMin,
  carryCount: 0,
  ...extra,
});

function assertNoOverlap(tasks: { start?: string; end?: string }[]) {
  const sorted = [...tasks].sort((a, b) => toMin(a.start!) - toMin(b.start!));
  for (let i = 1; i < sorted.length; i++) {
    expect(toMin(sorted[i].start!)).toBeGreaterThanOrEqual(toMin(sorted[i - 1].end!));
  }
}

describe('splitDuration', () => {
  it('keeps short jobs whole and balances long ones', () => {
    expect(splitDuration(45, 50)).toEqual([45]);
    expect(splitDuration(120, 50)).toEqual([40, 40, 40]);
    expect(splitDuration(90, 25).reduce((a, b) => a + b, 0)).toBe(90);
  });
});

describe('partTitle / shareCount', () => {
  it('splits a count in proportion to block lengths', () => {
    expect(shareCount(100, [50, 50, 50])).toEqual([34, 33, 33]);
    expect(shareCount(12, [50, 25])).toEqual([8, 4]);
    expect(partTitle('12 sayfa matematik', [50, 25], 1)).toBe('4 sayfa matematik (2/2)');
    expect(partTitle('Matematik', [40, 40], 0)).toBe('Matematik (1/2)');
  });
});

describe('schedule', () => {
  it('keeps fixed jobs at their time and flows others around them', () => {
    const { tasks, unscheduled } = schedule(
      [job('Antrenman', 60, { fixedStart: '08:30', category: 'spor' }), job('Matematik', 45), job('Fizik', 45)],
      opts,
    );
    expect(unscheduled).toEqual([]);
    const training = tasks.find((t) => t.title === 'Antrenman')!;
    expect(training).toMatchObject({ start: '08:30', end: '09:30', fixed: true });
    assertNoOverlap(tasks);
    // Matematik does not fit before 08:30 (needs 45 min), so it starts after training + gap.
    expect(tasks.find((t) => t.title === 'Matematik')!.start).toBe('09:40');
  });

  it('keeps a long job as one task with its breaks inside', () => {
    const { tasks, innerBreaks } = schedule([job('Matematik', 100)], opts);
    expect(tasks).toMatchObject([{ title: 'Matematik', start: '08:00', end: '09:50' }]); // 2 × 50 + 10 break
    expect(innerBreaks).toBe(true);
  });

  it('splits long jobs into numbered blocks when asked', () => {
    const { tasks } = schedule([job('Matematik', 100)], { ...opts, splitLong: true });
    expect(tasks.map((t) => t.title)).toEqual(['Matematik (1/2)', 'Matematik (2/2)']);
    expect(tasks.every((t) => t.baseTitle === 'Matematik')).toBe(true);
    expect(toMin(tasks[1].start!) - toMin(tasks[0].end!)).toBe(10);
  });

  it('shares a question count out over the blocks instead of repeating it', () => {
    const { tasks } = schedule([job('Türkçe 100 soru', 150)], { ...opts, splitLong: true });
    expect(tasks.map((t) => t.title)).toEqual(['Türkçe 34 soru (1/3)', 'Türkçe 33 soru (2/3)', 'Türkçe 33 soru (3/3)']);
    expect(tasks.every((t) => t.baseTitle === 'Türkçe 100 soru')).toBe(true);
  });

  it('falls back to blocks when the whole job does not fit in one gap', () => {
    // 08:00–09:00 then a fixed item; 100 min of work (110 with the break) cannot sit in one gap before 10:00.
    const { tasks } = schedule(
      [job('Ders', 60, { fixedStart: '09:00', category: 'kisisel' }), job('Matematik', 100)],
      { ...opts, sleepTime: '11:30', endBuffer: 0 },
    );
    expect(tasks.filter((t) => t.baseTitle === 'Matematik').map((t) => t.title)).toEqual(['Matematik (1/2)', 'Matematik (2/2)']);
    assertNoOverlap(tasks);
  });

  it('starts flexible jobs no earlier than flexFrom', () => {
    const { tasks } = schedule([job('A', 30), job('Koşu', 30, { fixedStart: '08:00', category: 'spor' })], { ...opts, flexFrom: '16:30' });
    expect(tasks.find((t) => t.title === 'A')!.start).toBe('16:30');
    expect(tasks.find((t) => t.title === 'Koşu')!.start).toBe('08:00');
  });

  it('never splits sports, even with short focus blocks', () => {
    const { tasks } = schedule([job('Antrenman', 90, { category: 'spor', maxBlock: 25 })], { ...opts, maxBlock: 25 });
    expect(tasks).toMatchObject([{ title: 'Antrenman', start: '08:00', end: '09:30' }]);
  });

  it('never plans past bedtime minus the buffer and reports what did not fit', () => {
    // 21:00–21:45 fits; B would end 22:40, past 23:00 minus the 30-min buffer.
    const { tasks, unscheduled } = schedule([job('A', 45), job('B', 45)], { ...opts, startFrom: '21:00' });
    expect(tasks.map((t) => t.title)).toEqual(['A']);
    expect(unscheduled).toEqual(['B']);
    expect(toMin(tasks[0].end!)).toBeLessThanOrEqual(toMin('22:30'));
  });

  it('drops fixed jobs whose time has already passed', () => {
    const { tasks, unscheduled } = schedule([job('Dershane', 60, { fixedStart: '09:00' })], { ...opts, startFrom: '12:00' });
    expect(tasks).toEqual([]);
    expect(unscheduled).toEqual(['Dershane']);
  });

  it('adds a flexible slot when asked', () => {
    const { tasks } = schedule([job('A', 30), job('B', 30)], { ...opts, flexSlot: true });
    expect(tasks.filter((t) => t.flex)).toHaveLength(1);
    assertNoOverlap(tasks);
  });

  it('respects the load factor', () => {
    // 08:00–22:30 = 870 free minutes; 0.1 load allows 87 minutes.
    const { tasks, unscheduled } = schedule([job('A', 45), job('B', 45)], { ...opts, loadFactor: 0.1 });
    expect(tasks).toHaveLength(1);
    expect(unscheduled).toEqual(['B']);
  });
});
