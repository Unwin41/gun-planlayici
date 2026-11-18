import { describe, expect, it } from '@jest/globals';

import { sanitizeAiTasks } from '@/planner/validate';

const opts = { wakeTime: '08:00', sleepTime: '23:00', startFrom: '08:00', carryOver: [] };

describe('sanitizeAiTasks', () => {
  it('drops bad times and sorts the rest', () => {
    const { tasks, dropped } = sanitizeAiTasks(
      [
        { title: 'B', start: '10:00', end: '10:30', category: 'ders', fixed: false },
        { title: 'Bozuk', start: '25:00', end: '26:00', category: 'ders', fixed: false },
        { title: 'Ters', start: '12:00', end: '11:00', category: 'ders', fixed: false },
        { title: 'A', start: '09:00', end: '09:45', category: 'ders', fixed: false },
      ],
      opts,
    );
    expect(tasks.map((t) => t.title)).toEqual(['A', 'B']);
    expect(dropped).toEqual(['Bozuk', 'Ters']);
  });

  it('pushes overlapping blocks back and drops ones that pass bedtime', () => {
    const { tasks, dropped } = sanitizeAiTasks(
      [
        { title: 'A', start: '22:00', end: '22:40', category: 'ders', fixed: false },
        { title: 'B', start: '22:30', end: '23:10', category: 'ders', fixed: false },
        { title: 'C', start: '09:00', end: '10:00', category: 'ders', fixed: false },
        { title: 'D', start: '09:30', end: '10:00', category: 'ders', fixed: false },
      ],
      opts,
    );
    expect(tasks.map((t) => [t.title, t.start, t.end])).toEqual([
      ['C', '09:00', '10:00'],
      ['D', '10:00', '10:30'],
      ['A', '22:00', '22:40'],
    ]);
    expect(dropped).toEqual(['B']);
  });

  it('moves flexible blocks forward from the past but drops fixed ones', () => {
    const { tasks, dropped } = sanitizeAiTasks(
      [
        { title: 'Esnek', start: '09:00', end: '09:30', category: 'ders', fixed: false },
        { title: 'Kurs', start: '10:00', end: '11:00', category: 'diger', fixed: true },
      ],
      { ...opts, startFrom: '14:00' },
    );
    expect(tasks).toMatchObject([{ title: 'Esnek', start: '14:00', end: '14:30' }]);
    expect(dropped).toEqual(['Kurs']);
  });

  it('restores base titles and carry counts for carried jobs', () => {
    const { tasks } = sanitizeAiTasks(
      [{ title: 'Fizik (1/2)', start: '09:00', end: '09:25', category: 'ders', fixed: false }],
      { ...opts, carryOver: [{ title: 'Fizik', category: 'ders', durationMin: 50, carryCount: 2 }] },
    );
    expect(tasks[0]).toMatchObject({ baseTitle: 'Fizik', carryCount: 2 });
  });
});
