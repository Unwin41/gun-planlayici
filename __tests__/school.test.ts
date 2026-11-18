import { describe, expect, it } from '@jest/globals';

import { schoolFor } from '@/chat/flow';
import { buildUserMessage, SYSTEM_PROMPT } from '@/planner/prompts';
import { createRulePlan } from '@/planner/rulePlanner';
import { schedule, type ScheduleOptions } from '@/planner/schedule';
import { sanitizeAiTasks } from '@/planner/validate';
import type { PlanInput } from '@/types';
import { readDayTimes, type DayTimesForm } from '@/utils/dayTimes';
import { toMin } from '@/utils/time';

const SCHOOL = { start: '08:30', end: '15:30' };
const inSchool = (t: { start?: string; end?: string }) => toMin(t.start!) < toMin(SCHOOL.end) && toMin(SCHOOL.start) < toMin(t.end!);

describe('schoolFor', () => {
  const settings = { schoolStart: '08:30', schoolEnd: '15:30' };
  it('applies on weekdays only', () => {
    expect(schoolFor('2026-11-18', settings)).toEqual(SCHOOL); // Wednesday
    expect(schoolFor('2026-11-21', settings)).toBeUndefined(); // Saturday
    expect(schoolFor('2026-11-22', settings)).toBeUndefined(); // Sunday
  });
  it('is off when not set or invalid', () => {
    expect(schoolFor('2026-11-18', {})).toBeUndefined();
    expect(schoolFor('2026-11-18', { schoolStart: '15:00', schoolEnd: '08:00' })).toBeUndefined();
  });
});

describe('schedule with school', () => {
  const opts: ScheduleOptions = {
    wakeTime: '07:00',
    sleepTime: '23:00',
    startFrom: '07:00',
    maxBlock: 50,
    gap: 10,
    endBuffer: 30,
    loadFactor: 0.9,
    flexSlot: false,
    blocked: [SCHOOL],
  };
  const job = (title: string, durationMin: number) => ({ title, baseTitle: title, category: 'ders' as const, durationMin, carryCount: 0 });

  it('never puts flexible jobs inside school hours', () => {
    const { tasks, unscheduled } = schedule([job('Matematik', 120), job('Türkçe', 45), job('Fizik', 45)], opts);
    expect(unscheduled).toEqual([]);
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.some(inSchool)).toBe(false);
  });

  it('keeps a fixed-time job the student gave, even during school', () => {
    const { tasks } = schedule([{ ...job('Doktor', 30), fixedStart: '10:00' }], opts);
    expect(tasks[0]).toMatchObject({ start: '10:00', fixed: true });
  });
});

describe('rule plan with school', () => {
  const input: PlanInput = {
    date: '2026-11-18',
    userText: 'matematik ödevi, 2 saat fizik',
    wakeTime: '07:00',
    sleepTime: '23:00',
    startFrom: '07:00',
    carryOver: [],
    school: SCHOOL,
  };

  it('plans around school and says so', () => {
    const plan = createRulePlan(input);
    expect(plan.tasks.some(inSchool)).toBe(false);
    expect(plan.coachNote).toMatch(/Okul saatlerini \(08:30–15:30\) boş bıraktım/);
  });

  it('plans nothing before school and leaves an hour of rest after it', () => {
    const plan = createRulePlan(input);
    for (const t of plan.tasks) expect(toMin(t.start!)).toBeGreaterThanOrEqual(toMin('16:30'));
  });

  it('student report: "100 soru türkçe , 12 sayfa matematik" for a 7th grader', () => {
    const plan = createRulePlan({ ...input, grade: 7, userText: '100 soru türkçe , 12 sayfa matematik' });
    // One task per job, maths first, nothing before school, rest after it.
    expect(plan.tasks.map((t) => t.title)).toEqual(['12 sayfa matematik', 'Türkçe 100 soru']);
    expect(plan.tasks[0].start).toBe('16:30');
    expect(plan.unscheduled).toEqual([]);
    expect(plan.coachNote).toMatch(/2 iş/);
  });

  it('tells the AI to keep one task per job and to share counts when splitting', () => {
    expect(SYSTEM_PROMPT).toMatch(/TEK görev/);
    expect(SYSTEM_PROMPT).toMatch(/Türkçe 34 soru \(1\/3\)/);
    expect(SYSTEM_PROMPT).toMatch(/okuldan önce/);
  });

  it('tells the AI about school hours', () => {
    expect(buildUserMessage(input)).toMatch(/Okul saatleri: 08:30–15:30/);
    expect(buildUserMessage({ ...input, school: undefined })).not.toMatch(/Okul saatleri/);
  });
});

describe('sanitizeAiTasks with school', () => {
  const opts = { wakeTime: '07:00', sleepTime: '23:00', startFrom: '07:00', carryOver: [], school: SCHOOL };

  it('moves flexible blocks out of school hours and keeps fixed ones', () => {
    const { tasks } = sanitizeAiTasks(
      [
        { title: 'Kitap', start: '07:00', end: '07:30', category: 'okuma', fixed: false },
        { title: 'Matematik', start: '09:00', end: '09:45', category: 'ders', fixed: false },
        { title: 'Türkçe', start: '15:00', end: '15:45', category: 'ders', fixed: false },
        { title: 'Doktor', start: '11:00', end: '11:30', category: 'kisisel', fixed: true },
      ],
      opts,
    );
    const byTitle = Object.fromEntries(tasks.map((t) => [t.title, t]));
    expect(byTitle.Kitap).toMatchObject({ start: '07:00', end: '07:30' });
    expect(byTitle.Doktor).toMatchObject({ start: '11:00' });
    expect(inSchool(byTitle.Matematik)).toBe(false);
    expect(inSchool(byTitle['Türkçe'])).toBe(false);
    expect(toMin(byTitle['Türkçe'].start!)).toBeGreaterThanOrEqual(toMin(byTitle.Matematik.end!));
  });
});

describe('readDayTimes', () => {
  const form: DayTimesForm = {
    wake: '7',
    sleep: '23.00',
    checkin: '2100',
    goesToSchool: true,
    schoolStart: '8.30',
    schoolEnd: '15:30',
  };

  it('normalises all times', () => {
    expect(readDayTimes(form)).toEqual({
      ok: true,
      value: { wakeTime: '07:00', sleepTime: '23:00', checkinTime: '21:00', schoolStart: '08:30', schoolEnd: '15:30' },
    });
  });

  it('clears school hours when the student does not go to school', () => {
    const r = readDayTimes({ ...form, goesToSchool: false, schoolStart: 'x' });
    expect(r).toMatchObject({ ok: true, value: { schoolStart: undefined, schoolEnd: undefined } });
  });

  it('rejects bad school hours', () => {
    expect(readDayTimes({ ...form, schoolStart: 'sabah' }).ok).toBe(false);
    expect(readDayTimes({ ...form, schoolStart: '15:30', schoolEnd: '08:30' }).ok).toBe(false);
    expect(readDayTimes({ ...form, wake: '09:00' }).ok).toBe(false);
  });
});
