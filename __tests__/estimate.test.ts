import { describe, expect, it } from '@jest/globals';

import { detectSubject, estimatePageMinutes, estimateQuestionMinutes, extractPageCount, extractQuestionCount, levelOf } from '@/planner/estimate';
import { parseItem } from '@/planner/parse';
import { buildUserMessage } from '@/planner/prompts';
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

const plannedMinutes = (plan: ReturnType<typeof createRulePlan>, baseTitle: string) =>
  plan.tasks.filter((t) => t.baseTitle === baseTitle).reduce((sum, t) => sum + toMin(t.end!) - toMin(t.start!), 0);

describe('question count and subject', () => {
  it('reads the number of questions', () => {
    expect(extractQuestionCount('100 soru türkçe')).toBe(100);
    expect(extractQuestionCount('matematikten 40 tane soru çöz')).toBe(40);
    expect(extractQuestionCount('türkçe ödevi')).toBeUndefined();
  });

  it('detects the subject with Turkish suffixes', () => {
    expect(detectSubject('türkçeden 100 soru')).toBe('turkce');
    expect(detectSubject('40 soru mat')).toBe('matematik');
    expect(detectSubject("fen'den 30 soru")).toBe('fen');
    expect(detectSubject('geometri 20 soru')).toBe('geometri');
    expect(detectSubject('50 soru')).toBe('genel');
  });

  it('maps grades to school levels', () => {
    expect(levelOf(3)).toBe('ilkokul');
    expect(levelOf(8)).toBe('ortaokul');
    expect(levelOf(11)).toBe('lise');
    expect(levelOf('mezun')).toBe('lise');
  });
});

describe('estimateQuestionMinutes', () => {
  it('gives 100 Türkçe questions well over an hour, not 40 minutes', () => {
    expect(estimateQuestionMinutes(100, 'turkce', 10)).toBe(110);
    expect(estimateQuestionMinutes(100, 'turkce', 8)).toBe(150);
    expect(estimateQuestionMinutes(100, 'turkce', 3)).toBe(150);
  });

  it('gives maths more time per question than Türkçe', () => {
    expect(estimateQuestionMinutes(50, 'matematik', 11)).toBeGreaterThan(estimateQuestionMinutes(50, 'turkce', 11));
  });

  it('rounds to 5 minutes and stays inside 10 min – 8 h', () => {
    expect(estimateQuestionMinutes(3, 'din', 12) % 5).toBe(0);
    expect(estimateQuestionMinutes(1, 'din', 12)).toBe(10);
    expect(estimateQuestionMinutes(1000, 'matematik', 12)).toBe(480);
  });
});

describe('parseItem with questions', () => {
  it('rebuilds a clean title', () => {
    expect(parseItem('100 soru Türkçe')).toMatchObject({ title: 'Türkçe 100 soru', questionCount: 100, subject: 'turkce', category: 'ders' });
    expect(parseItem('türkçeden 100 soru çöz')).toMatchObject({ title: 'Türkçe 100 soru' });
  });

  it('keeps extra detail the student wrote', () => {
    expect(parseItem('paragraf kitabından 40 soru')?.title).toBe('Paragraf kitabından 40 soru');
  });
});

describe('page count', () => {
  it('reads the number of pages', () => {
    expect(extractPageCount('12 sayfa matematik')).toBe(12);
    expect(extractPageCount('kitaptan 30 sayfa oku')).toBe(30);
    expect(extractPageCount('matematik ödevi')).toBeUndefined();
    expect(parseItem('12 sayfa matematik')).toMatchObject({ pageCount: 12, subject: 'matematik', category: 'ders' });
  });

  it('gives study pages more time than reading pages', () => {
    expect(estimatePageMinutes(12, 'matematik', 7, false)).toBe(75); // 12 × 6 = 72 -> 75
    expect(estimatePageMinutes(30, 'genel', 7, true)).toBe(60);
  });

  it('plans pages instead of the 45-minute default', () => {
    const plan = createRulePlan({ ...base, grade: 7, userText: '12 sayfa matematik' });
    expect(plannedMinutes(plan, '12 sayfa matematik')).toBeGreaterThan(45);
    expect(plan.coachNote).toMatch(/12 sayfa matematik ≈ 1 saat 15 dk/);
  });
});

describe('planning question jobs', () => {
  it('plans 100 Türkçe questions by grade', () => {
    // One task each; the span includes a 10-minute break every 50 minutes.
    const lise = createRulePlan({ ...base, grade: 10, userText: '100 soru Türkçe' });
    expect(lise.tasks).toHaveLength(1);
    expect(plannedMinutes(lise, 'Türkçe 100 soru')).toBe(110 + 20); // 3 focus blocks -> 2 breaks
    expect(lise.coachNote).toMatch(/10\. sınıf/);
    expect(lise.coachNote).toMatch(/1 saat 50 dk/);

    const ortaokul = createRulePlan({ ...base, grade: 7, userText: '100 soru Türkçe' });
    expect(ortaokul.tasks).toHaveLength(1);
    expect(plannedMinutes(ortaokul, 'Türkçe 100 soru')).toBe(150 + 20);
  });

  it("the student's own duration wins over the estimate", () => {
    const plan = createRulePlan({ ...base, grade: 10, userText: '100 soru Türkçe 1 saat' });
    expect(plannedMinutes(plan, 'Türkçe 100 soru')).toBe(60 + 10);
    expect(plan.coachNote).not.toMatch(/sayısına göre/);
  });

  it('suggests picking a grade when it is unknown', () => {
    expect(createRulePlan({ ...base, userText: '50 soru matematik' }).coachNote).toMatch(/Ayarlar/);
  });

  it('tells the AI the grade and the estimates', () => {
    const msg = buildUserMessage({ ...base, grade: 'mezun', userText: '100 soru Türkçe, kitap oku' });
    expect(msg).toMatch(/sınıfı: Mezun/);
    expect(msg).toMatch(/Türkçe 100 soru: 110 dk/);
  });
});
