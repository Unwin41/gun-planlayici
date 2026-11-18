import { DEFAULT_DURATIONS } from '@/config';
import type { CarryOverTask, Category, DayPlan, Reason, RecentStats, Settings, TimeRange } from '@/types';
import { addDays, isWeekday } from '@/utils/date';
import { fromMin, isValidTime, nowMin, roundUp, toMin } from '@/utils/time';

export interface UnfinishedGroup {
  baseTitle: string;
  category: Category;
  remainingMin: number;
  carryCount: number;
  taskIds: string[];
  /** Start time if the job was a fixed-time item. */
  fixedStart?: string;
}

function taskMinutes(start?: string, end?: string, category: Category = 'diger'): number {
  if (isValidTime(start) && isValidTime(end)) {
    const len = toMin(end) - toMin(start);
    if (len > 0) return len;
  }
  return DEFAULT_DURATIONS[category];
}

/** Unchecked real jobs of a day, with blocks of the same job merged. */
export function unfinishedGroups(day: DayPlan | undefined): UnfinishedGroup[] {
  if (!day) return [];
  const groups = new Map<string, UnfinishedGroup>();
  for (const t of day.tasks) {
    if (t.done || t.flex) continue;
    const g = groups.get(t.baseTitle);
    const minutes = taskMinutes(t.start, t.end, t.category);
    if (g) {
      g.remainingMin += minutes;
      g.carryCount = Math.max(g.carryCount, t.carryCount);
      g.taskIds.push(t.id);
    } else {
      groups.set(t.baseTitle, {
        baseTitle: t.baseTitle,
        category: t.category,
        remainingMin: minutes,
        carryCount: t.carryCount,
        taskIds: [t.id],
        ...(t.fixed && t.start ? { fixedStart: t.start } : {}),
      });
    }
  }
  return [...groups.values()];
}

export function buildCarryOver(day: DayPlan | undefined, reasons: Record<string, Reason>): CarryOverTask[] {
  return unfinishedGroups(day).map((g) => ({
    title: g.baseTitle,
    category: g.category,
    durationMin: g.remainingMin,
    carryCount: g.carryCount + 1,
    reason: reasons[g.baseTitle],
  }));
}

export function completion(day: DayPlan | undefined): { done: number; total: number; rate: number } {
  const real = (day?.tasks ?? []).filter((t) => !t.flex);
  const done = real.filter((t) => t.done).length;
  return { done, total: real.length, rate: real.length ? done / real.length : 0 };
}

/** Completion rate and most common blockers over the `n` days before `beforeDate`. */
export function recentStats(days: Record<string, DayPlan>, beforeDate: string, n = 7): RecentStats | undefined {
  const rates: number[] = [];
  const reasonCount = new Map<Reason, number>();
  for (let i = 1; i <= n; i++) {
    const day = days[addDays(beforeDate, -i)];
    if (!day || day.tasks.length === 0) continue;
    rates.push(completion(day).rate);
    for (const r of Object.values(day.checkin?.reasons ?? {})) {
      reasonCount.set(r, (reasonCount.get(r) ?? 0) + 1);
    }
  }
  if (rates.length === 0) return undefined;
  const topReasons = [...reasonCount.entries()]
    .filter(([r]) => r !== 'diger')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([r]) => r);
  return { completionRate: rates.reduce((a, b) => a + b, 0) / rates.length, topReasons };
}

/**
 * Consecutive good days (≥80% done) ending today or yesterday. Today only counts
 * once it is good, so an unfinished morning does not break the streak.
 */
export function streak(days: Record<string, DayPlan>, today: string): number {
  const good = (key: string) => {
    const c = completion(days[key]);
    return c.total > 0 && c.rate >= 0.8;
  };
  let key = good(today) ? today : addDays(today, -1);
  let count = 0;
  while (good(key)) {
    count++;
    key = addDays(key, -1);
  }
  return count;
}

/** The day a check-in's follow-up plan is for: the next day, but never in the past. */
export function nextPlanDate(checkinDate: string, today: string): string {
  const next = addDays(checkinDate, 1);
  return next < today ? today : next;
}

/** Minutes before bedtime that are never planned (matches the scheduler's default buffer). */
const BED_BUFFER = 30;
/** Below this many plannable minutes left today, planning moves to tomorrow. */
const MIN_LEFT_TODAY = 60;

/**
 * Which day a new plan should be for: today, unless the day is (almost) over —
 * e.g. a student opening the app at 23:00 gets tomorrow's plan instead of an empty one.
 */
export function planningDate(today: string, wakeTime: string, sleepTime: string, now: Date = new Date()): string {
  const wake = toMin(wakeTime);
  let sleep = toMin(sleepTime);
  if (sleep <= wake) sleep = 24 * 60 - 1;
  const from = Math.max(wake, roundUp(nowMin(now), 15));
  return sleep - BED_BUFFER - from < MIN_LEFT_TODAY ? addDays(today, 1) : today;
}

/** Earliest start for a plan: now (rounded up to 15 min) if planning today, else wake time. */
export function startFromFor(target: string, today: string, wakeTime: string, now: Date = new Date()): string {
  if (target !== today) return wakeTime;
  return fromMin(Math.max(toMin(wakeTime), roundUp(nowMin(now), 15)));
}

/** School hours to keep free on `date`: only on weekdays and only if the student set them. */
export function schoolFor(date: string, settings: Pick<Settings, 'schoolStart' | 'schoolEnd'>): TimeRange | undefined {
  const { schoolStart, schoolEnd } = settings;
  if (!isValidTime(schoolStart) || !isValidTime(schoolEnd) || toMin(schoolEnd) <= toMin(schoolStart)) return undefined;
  return isWeekday(date) ? { start: schoolStart, end: schoolEnd } : undefined;
}

/** Yesterday's plan if it had jobs and was never checked in. */
export function missedCheckinDate(days: Record<string, DayPlan>, today: string): string | null {
  const y = addDays(today, -1);
  const day = days[y];
  return day && day.tasks.some((t) => !t.flex) && !day.checkin ? y : null;
}

/** Most frequent reason in a check-in, for the empathetic reply. */
export function mainReason(reasons: Record<string, Reason>): Reason | null {
  const count = new Map<Reason, number>();
  for (const r of Object.values(reasons)) count.set(r, (count.get(r) ?? 0) + 1);
  let best: Reason | null = null;
  let max = 0;
  for (const [r, c] of count) {
    if (c > max) {
      best = r;
      max = c;
    }
  }
  return best;
}

export const REASON_REPLIES: Record<Reason, string> = {
  zaman_yetmedi: 'Anladım, zaman yetmedi. Yarın günü daha az dolduracağım ve aralara tampon koyacağım.',
  yorgundum: 'Yorulmak çok normal. Zor işleri güne erken koyacağım ve akşamı hafif bırakacağım.',
  motivasyon_yoktu: 'Motivasyon her gün aynı olmaz. Yarın küçük bir başlangıç adımıyla başlayalım.',
  telefon_dikkat: 'Dikkat dağılması çok yaygın. Yarın 25 dakikalık kısa odak blokları deneyelim.',
  plansiz_is_cikti: 'Plansız işler olur. Yarın plana esnek bir zaman ekleyeceğim.',
  gorev_zordu: 'Zor görevleri küçük parçalara bölünce başlamak kolaylaşır. Yarın öyle yapacağım.',
  diger: 'Paylaştığın için teşekkürler. Yarın için planı buna göre ayarlayalım.',
};
