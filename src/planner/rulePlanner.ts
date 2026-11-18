import { DEFAULT_DURATIONS } from '@/config';
import type { Grade, PlanInput, PlanResult, Reason, TimeRange } from '@/types';
import { fromMin, toMin } from '@/utils/time';

import { detectSubject, estimatePageMinutes, estimateQuestionMinutes, gradeText, type Subject } from './estimate';
import { isHard, parseTasksText, trLower, type ParsedItem } from './parse';
import { schedule, type Job, type ScheduleOptions } from './schedule';

/** Planning flags derived from why yesterday's jobs were missed. */
export function reasonFlags(input: PlanInput): Set<Reason> {
  const flags = new Set<Reason>();
  for (const c of input.carryOver) if (c.reason) flags.add(c.reason);
  return flags;
}

/** Minutes after school kept free for getting home, eating and resting. */
export const AFTER_SCHOOL_REST = 60;

export function buildOptions(input: PlanInput, flags: Set<Reason>): ScheduleOptions {
  return {
    wakeTime: input.wakeTime,
    sleepTime: input.sleepTime,
    startFrom: input.startFrom,
    maxBlock: flags.has('telefon_dikkat') ? 25 : 50,
    gap: flags.has('zaman_yetmedi') || flags.has('yorgundum') ? 15 : 10,
    endBuffer: flags.has('yorgundum') ? 90 : 30,
    loadFactor: flags.has('zaman_yetmedi') ? 0.7 : 0.9,
    flexSlot: flags.has('plansiz_is_cikti'),
    blocked: input.school ? [input.school] : [],
    // School day: no studying squeezed in before school, and a rest after it.
    flexFrom: input.school ? fromMin(toMin(input.school.end) + AFTER_SCHOOL_REST) : undefined,
    // Short focus blocks only when the student struggled to focus; otherwise one job = one task.
    splitLong: flags.has('telefon_dikkat'),
  };
}

/** Turns carried-over jobs into schedulable jobs, applying per-job reason rules. */
export function carryOverJobs(input: PlanInput): Job[] {
  const jobs: Job[] = [];
  for (const c of input.carryOver) {
    const base: Job = {
      title: c.title,
      baseTitle: c.title,
      category: c.category,
      durationMin: c.durationMin,
      carryCount: c.carryCount,
      fixedStart: c.fixedStart,
    };
    if (c.fixedStart) {
      jobs.push(base);
      continue;
    }
    // Carried over twice or "too hard": smaller pieces.
    if (c.reason === 'gorev_zordu' || c.carryCount >= 2) base.maxBlock = 25;

    if (c.reason === 'motivasyon_yoktu' && c.durationMin > 20) {
      jobs.push({ ...base, title: `${c.title} (ilk 15 dk)`, durationMin: 15 });
      jobs.push({ ...base, title: `${c.title} (devam)`, durationMin: c.durationMin - 15 });
    } else {
      jobs.push(base);
    }
  }
  // Hard jobs first so they land earlier in the day.
  return jobs.sort((a, b) => Number(isHard(b.category)) - Number(isHard(a.category)));
}

export interface CountEstimate {
  title: string;
  minutes: number;
}

/** Minutes for "100 soru Türkçe" / "12 sayfa matematik"; undefined when no count was given. */
function countMinutes(item: ParsedItem, grade: PlanInput['grade']): number | undefined {
  const subject = item.subject ?? 'genel';
  if (item.questionCount) return estimateQuestionMinutes(item.questionCount, subject, grade);
  if (item.pageCount) return estimatePageMinutes(item.pageCount, subject, grade, item.category === 'okuma');
  return undefined;
}

/** Durations for question/page jobs the student gave no explicit time for. */
export function countEstimates(input: Pick<PlanInput, 'userText' | 'grade'>): CountEstimate[] {
  return parseTasksText(input.userText)
    .filter((item) => item.durationMin === undefined)
    .map((item) => ({ title: item.title, minutes: countMinutes(item, input.grade) }))
    .filter((e): e is CountEstimate => e.minutes !== undefined);
}

function itemDuration(item: ParsedItem, grade: PlanInput['grade']): number {
  if (item.durationMin !== undefined) return item.durationMin; // the student's own time always wins
  return countMinutes(item, grade) ?? DEFAULT_DURATIONS[item.category];
}

/** Subjects that take the most concentration; they go first while the student is fresh. */
const HEAVY_SUBJECTS = new Set<Subject>(['matematik', 'geometri', 'fizik', 'kimya', 'fen']);

/** 2 = heavy subject study, 1 = other study, 0 = the rest. */
function weight(job: Job): number {
  if (!isHard(job.category)) return 0;
  return HEAVY_SUBJECTS.has(detectSubject(trLower(job.title))) ? 2 : 1;
}

export function newJobs(input: PlanInput): Job[] {
  const items = parseTasksText(input.userText);
  const jobs = items.map<Job>((item) => ({
    title: item.title,
    baseTitle: item.title,
    category: item.category,
    durationMin: itemDuration(item, input.grade),
    carryCount: 0,
    fixedStart: item.fixedStart,
  }));
  const fixed = jobs.filter((j) => j.fixedStart);
  const flexible = jobs.filter((j) => !j.fixedStart);
  // Stable sort: maths/science first, then other study, then the rest, each in the order written.
  flexible.sort((a, b) => weight(b) - weight(a));
  return [...fixed, ...flexible];
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} saat ${m} dk`;
  if (h) return `${h} saat`;
  return `${m} dk`;
}

/** "Soru/sayfa sayısına göre süre ayırdım (10. sınıf): Türkçe 100 soru ≈ 1 saat 50 dk." */
export function estimateNote(estimates: CountEstimate[], grade: Grade | undefined): string | null {
  if (estimates.length === 0) return null;
  const list = estimates.map((e) => `${e.title} ≈ ${formatDuration(e.minutes)}`).join(', ');
  const line = `Soru/sayfa sayısına göre süre ayırdım (${gradeText(grade)}): ${list}. Farklı sürüyorsa süreyi de yazabilirsin, ör. "100 soru Türkçe 2 saat".`;
  return grade === undefined ? `${line} Sınıfını Ayarlar'dan seçersen tahminler daha isabetli olur.` : line;
}

export function coachNote(
  flags: Set<Reason>,
  result: {
    taskCount: number;
    totalMin: number;
    unscheduled: string[];
    splitHard: boolean;
    innerBreaks?: boolean;
    estimateLine?: string | null;
    school?: TimeRange;
  },
): string {
  if (result.taskCount === 0) {
    return result.unscheduled.length
      ? `Bugüne hiçbir iş sığmadı (${result.unscheduled.join(', ')}). Saatleri ya da uyku saatini kontrol edelim mi?`
      : 'Planlanacak bir iş bulamadım. Yapman gerekenleri virgülle ayırarak yazabilirsin.';
  }
  const lines = [`Planın hazır: ${result.taskCount} iş, toplam yaklaşık ${formatDuration(result.totalMin)}. İşlerin arasında kısa molalar var.`];
  if (result.innerBreaks) lines.push('Uzun işleri tek parça bıraktım. Her 50 dakikada 10 dakika mola ver, molalar süreye dahil.');
  if (result.school) {
    lines.push(
      `Okul saatlerini (${result.school.start}–${result.school.end}) boş bıraktım. Okuldan önce iş koymadım, okuldan sonra da dinlenmen için ${AFTER_SCHOOL_REST} dakika ayırdım.`,
    );
  }
  if (result.estimateLine) lines.push(result.estimateLine);
  if (flags.has('zaman_yetmedi')) lines.push('Dün zaman yetmemişti; günü fazla doldurmadım ve işlerin arasına tampon koydum.');
  if (flags.has('yorgundum')) lines.push('Yorgun olduğunu söylemiştin: zor işleri öne aldım, yatmadan önceki saati boş bıraktım.');
  if (flags.has('motivasyon_yoktu')) lines.push('Başlamak zor gelirse diye 15 dakikalık bir başlangıç adımı koydum. Başladıktan sonrası kolaylaşır.');
  if (flags.has('telefon_dikkat')) lines.push('Odak blokları 25 dakika. Bu sürede telefonunu başka bir odaya bırakmayı dene.');
  if (flags.has('plansiz_is_cikti')) lines.push('Plansız işler için 30 dakikalık esnek bir zaman bıraktım.');
  if (result.splitHard) lines.push('Zor gelen ya da birkaç gündür ertelenen işleri küçük parçalara böldüm.');
  if (result.unscheduled.length) {
    lines.push(`Bunlar sığmadı: ${result.unscheduled.join(', ')}. Önemliyse başka bir işi çıkarıp yerine koyabilirsin.`);
  }
  return lines.join('\n');
}

/** Offline planner: no network, deterministic. */
export function createRulePlan(input: PlanInput): PlanResult {
  const flags = reasonFlags(input);
  const carried = carryOverJobs(input);
  const fresh = newJobs(input);
  const jobs = [...fresh.filter((j) => j.fixedStart), ...carried, ...fresh.filter((j) => !j.fixedStart)];

  const { tasks, unscheduled, innerBreaks } = schedule(jobs, buildOptions(input, flags));
  const totalMin = tasks.reduce((sum, t) => sum + (toMin(t.end!) - toMin(t.start!)), 0);

  return {
    tasks,
    unscheduled,
    source: 'rules',
    coachNote: coachNote(flags, {
      taskCount: tasks.length,
      totalMin,
      unscheduled,
      splitHard: carried.some((j) => j.maxBlock !== undefined),
      innerBreaks,
      estimateLine: estimateNote(countEstimates(input), input.grade),
      school: input.school,
    }),
  };
}
