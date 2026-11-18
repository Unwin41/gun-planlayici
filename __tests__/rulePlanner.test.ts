import { describe, expect, it } from '@jest/globals';

import { createRulePlan } from '@/planner/rulePlanner';
import type { PlanInput } from '@/types';
import { toMin } from '@/utils/time';

const base: PlanInput = {
  date: '2026-11-18',
  userText: '',
  wakeTime: '08:00',
  sleepTime: '23:00',
  startFrom: '08:00',
  carryOver: [],
};

describe('createRulePlan', () => {
  it('plans free text and puts study before the rest', () => {
    const plan = createRulePlan({ ...base, userText: "kitap oku, matematik ödevi, saat 5'te antrenman" });
    expect(plan.source).toBe('rules');
    const titles = plan.tasks.map((t) => t.title);
    expect(titles.indexOf('Matematik ödevi')).toBeLessThan(titles.indexOf('Kitap oku'));
    expect(plan.tasks.find((t) => t.title === 'Antrenman')).toMatchObject({ start: '17:00', fixed: true });
    expect(plan.coachNote).toMatch(/Planın hazır/);
  });

  it('puts carried-over jobs first and keeps their carry count', () => {
    const plan = createRulePlan({
      ...base,
      userText: 'kitap oku',
      carryOver: [{ title: 'Fizik', category: 'ders', durationMin: 45, carryCount: 1, reason: 'zaman_yetmedi' }],
    });
    expect(plan.tasks[0]).toMatchObject({ title: 'Fizik', carryCount: 1 });
  });

  it('yorgundum: keeps the last 90 minutes before bed free', () => {
    const plan = createRulePlan({
      ...base,
      startFrom: '19:00',
      userText: '3 saat tarih',
      carryOver: [{ title: 'Fizik', category: 'ders', durationMin: 30, carryCount: 1, reason: 'yorgundum' }],
    });
    for (const t of plan.tasks) expect(toMin(t.end!)).toBeLessThanOrEqual(toMin('21:30'));
    expect(plan.coachNote).toMatch(/Yorgun/);
  });

  it('motivasyon_yoktu: starts with a 15-minute starter step', () => {
    const plan = createRulePlan({
      ...base,
      carryOver: [{ title: 'Kimya', category: 'ders', durationMin: 45, carryCount: 1, reason: 'motivasyon_yoktu' }],
    });
    expect(plan.tasks[0].title).toBe('Kimya (ilk 15 dk)');
    expect(toMin(plan.tasks[0].end!) - toMin(plan.tasks[0].start!)).toBe(15);
    expect(plan.tasks.every((t) => t.baseTitle === 'Kimya')).toBe(true);
  });

  it('telefon_dikkat: no block longer than 25 minutes', () => {
    const plan = createRulePlan({
      ...base,
      userText: '2 saat matematik',
      carryOver: [{ title: 'Fizik', category: 'ders', durationMin: 60, carryCount: 1, reason: 'telefon_dikkat' }],
    });
    for (const t of plan.tasks) expect(toMin(t.end!) - toMin(t.start!)).toBeLessThanOrEqual(25);
  });

  it('gorev_zordu or carried twice: split into small pieces', () => {
    const plan = createRulePlan({
      ...base,
      carryOver: [{ title: 'Geometri', category: 'ders', durationMin: 50, carryCount: 2 }],
    });
    expect(plan.tasks.length).toBeGreaterThanOrEqual(2);
    expect(plan.coachNote).toMatch(/küçük parçalara/);
  });

  it('plansiz_is_cikti: reserves a flexible slot', () => {
    const plan = createRulePlan({
      ...base,
      userText: 'matematik, kitap oku',
      carryOver: [{ title: 'Fizik', category: 'ders', durationMin: 45, carryCount: 1, reason: 'plansiz_is_cikti' }],
    });
    expect(plan.tasks.some((t) => t.flex)).toBe(true);
  });

  it('explains when nothing could be planned', () => {
    expect(createRulePlan(base).coachNote).toMatch(/bulamadım/);
  });
});
