import type { Category, Task, TimeRange } from '@/types';
import { newId } from '@/utils/id';
import { fromMin, roundUp, toMin } from '@/utils/time';

export interface Job {
  title: string;
  baseTitle: string;
  category: Category;
  durationMin: number;
  carryCount: number;
  fixedStart?: string;
  /** Overrides the global max block length (e.g. split hard jobs into small pieces). */
  maxBlock?: number;
}

export interface ScheduleOptions {
  wakeTime: string;
  sleepTime: string;
  startFrom: string;
  /** Longest single block in minutes; longer jobs are split. */
  maxBlock: number;
  /** Gap (break) after each block, minutes. */
  gap: number;
  /** Minutes before bedtime kept free. */
  endBuffer: number;
  /** Share of free time that may be filled (0..1). */
  loadFactor: number;
  /** Reserve one 30-min flexible slot for unplanned things. */
  flexSlot: boolean;
  /** Ranges kept free (e.g. school). Fixed-time jobs the student gave may still sit inside them. */
  blocked?: TimeRange[];
  /**
   * Flexible jobs start no earlier than this ("HH:mm"), e.g. after school plus a rest.
   * Fixed-time jobs are not affected.
   */
  flexFrom?: string;
  /**
   * Split every job longer than maxBlock into separate numbered tasks (short focus blocks).
   * Otherwise a long job stays one task and its breaks are counted inside its time span;
   * it is only split when it does not fit in one piece or the job sets its own maxBlock.
   */
  splitLong?: boolean;
}

export const FLEX_TITLE = 'Esnek zaman (plansız işler için)';
const FLEX_MIN = 30;

interface Interval {
  start: number;
  end: number;
}

export interface ScheduleResult {
  tasks: Task[];
  unscheduled: string[];
  /** True if some single task's time span includes breaks (a long job kept whole). */
  innerBreaks: boolean;
}

const COUNT_RE = /(\d+)(\s*(?:tane\s+|adet\s+)?(?:soru|sayfa))/i;

/** Splits `total` into whole numbers proportional to `weights` (largest remainder). */
export function shareCount(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((w) => (total * w) / sum);
  const parts = exact.map(Math.floor);
  let rest = total - parts.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; rest > 0; k++, rest--) parts[order[k % order.length].i]++;
  return parts;
}

/**
 * Title of block `index` of a split job. A count in the title is shared out, so
 * "Türkçe 100 soru" in three blocks reads "Türkçe 34 soru (1/3)", not 100 three times.
 */
export function partTitle(title: string, blocks: number[], index: number): string {
  const suffix = ` (${index + 1}/${blocks.length})`;
  const m = COUNT_RE.exec(title);
  const total = m ? Number(m[1]) : 0;
  if (!m || total < blocks.length) return title + suffix;
  const share = shareCount(total, blocks)[index];
  return title.slice(0, m.index) + share + m[2] + title.slice(m.index + m[0].length) + suffix;
}

/** Splits a duration into balanced blocks no longer than maxBlock (multiples of 5). */
export function splitDuration(total: number, maxBlock: number): number[] {
  if (total <= maxBlock) return [total];
  const n = Math.ceil(total / maxBlock);
  const base = Math.floor(total / n / 5) * 5;
  const blocks = Array.from({ length: n }, () => base);
  let rest = total - base * n;
  for (let i = 0; rest > 0; i = (i + 1) % n) {
    const add = Math.min(5, rest);
    blocks[i] += add;
    rest -= add;
  }
  return blocks;
}

export function dayWindow(wakeTime: string, sleepTime: string): Interval {
  const start = toMin(wakeTime);
  let end = toMin(sleepTime);
  if (end <= start) end = 24 * 60 - 1; // bedtime after midnight: plan until end of day
  return { start, end };
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Minutes of [from, to) covered by the intervals, counting overlaps once. */
function coveredMinutes(intervals: Interval[], from: number, to: number): number {
  const parts = intervals
    .map((b) => ({ start: Math.max(b.start, from), end: Math.min(b.end, to) }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);
  let total = 0;
  let reach = from;
  for (const p of parts) {
    if (p.end <= reach) continue;
    total += p.end - Math.max(p.start, reach);
    reach = p.end;
  }
  return total;
}

function findSlot(from: number, len: number, busy: Interval[], dayEnd: number, gap: number): number | null {
  let t = from;
  for (let guard = 0; guard < 200; guard++) {
    if (t + len > dayEnd) return null;
    const hit = busy.find((b) => overlaps({ start: t, end: t + len }, b));
    if (!hit) return t;
    t = hit.end + gap;
  }
  return null;
}

/**
 * Places fixed-time jobs at their times, then fills flexible jobs (in the given order)
 * into free time with breaks. Jobs that do not fit go to `unscheduled`.
 */
export function schedule(jobs: Job[], opts: ScheduleOptions): ScheduleResult {
  const window = dayWindow(opts.wakeTime, opts.sleepTime);
  const dayStart = Math.max(window.start, roundUp(toMin(opts.startFrom), 5));
  const dayEnd = window.end - opts.endBuffer;

  const tasks: Task[] = [];
  const busy: Interval[] = [];
  const unscheduled: string[] = [];

  const makeTask = (job: Job, title: string, start: number, end: number, extra: Partial<Task> = {}): Task => ({
    id: newId(),
    title,
    baseTitle: job.baseTitle,
    start: fromMin(start),
    end: fromMin(end),
    category: job.category,
    done: false,
    carryCount: job.carryCount,
    ...extra,
  });

  // 1) Fixed-time jobs stay where the student put them (only if still ahead and inside the day).
  const fixed = jobs.filter((j) => j.fixedStart).sort((a, b) => toMin(a.fixedStart!) - toMin(b.fixedStart!));
  for (const job of fixed) {
    let start = toMin(job.fixedStart!);
    const prev = busy[busy.length - 1];
    if (prev && start < prev.end) start = prev.end;
    const end = start + job.durationMin;
    if (start < dayStart || end > window.end) {
      unscheduled.push(job.title);
      continue;
    }
    busy.push({ start, end });
    tasks.push(makeTask(job, job.title, start, end, { fixed: true }));
  }

  // 2) Blocked ranges (school) are off limits for everything that follows.
  for (const b of opts.blocked ?? []) {
    const start = toMin(b.start);
    const end = toMin(b.end);
    if (end > start) busy.push({ start, end });
  }

  // 3) Flexible jobs fill the free time.
  const flexible = jobs.filter((j) => !j.fixedStart);
  const flexStart = Math.max(dayStart, opts.flexFrom ? toMin(opts.flexFrom) : 0);
  const freeMin = Math.max(0, dayEnd - flexStart - coveredMinutes(busy, flexStart, dayEnd));
  let budget = Math.floor(freeMin * opts.loadFactor);
  let cursor = flexStart;
  let innerBreaks = false;
  const flexAt = opts.flexSlot && flexible.length > 0 ? Math.floor(flexible.length / 2) : -1;

  flexible.forEach((job, index) => {
    if (index === flexAt) {
      const at = findSlot(cursor, FLEX_MIN, busy, dayEnd, opts.gap);
      if (at !== null) {
        busy.push({ start: at, end: at + FLEX_MIN });
        tasks.push(
          makeTask({ ...job, baseTitle: FLEX_TITLE, category: 'diger', carryCount: 0 }, FLEX_TITLE, at, at + FLEX_MIN, { flex: true }),
        );
        cursor = at + FLEX_MIN + opts.gap;
        budget -= FLEX_MIN;
      }
    }

    // Focus-block limits are for studying; a training session is never cut in half.
    const maxBlock = job.category === 'spor' ? job.durationMin : (job.maxBlock ?? opts.maxBlock);
    const blocks = splitDuration(job.durationMin, maxBlock);

    // One job = one task: breaks between focus blocks are counted inside the span.
    if (blocks.length > 1 && !opts.splitLong && job.maxBlock === undefined) {
      const span = job.durationMin + (blocks.length - 1) * opts.gap;
      const at = span <= budget ? findSlot(cursor, span, busy, dayEnd, opts.gap) : null;
      if (at !== null) {
        busy.push({ start: at, end: at + span });
        tasks.push(makeTask(job, job.title, at, at + span));
        cursor = at + span + opts.gap;
        budget -= span;
        innerBreaks = true;
        return;
      }
      // Does not fit in one piece (e.g. a fixed item in the way): fall back to separate blocks.
    }

    for (let i = 0; i < blocks.length; i++) {
      const len = blocks[i];
      const at = len <= budget ? findSlot(cursor, len, busy, dayEnd, opts.gap) : null;
      if (at === null) {
        unscheduled.push(blocks.length > 1 && i > 0 ? `${job.title} (kalan ${blocks.slice(i).reduce((a, b) => a + b, 0)} dk)` : job.title);
        return;
      }
      const title = blocks.length > 1 ? partTitle(job.title, blocks, i) : job.title;
      busy.push({ start: at, end: at + len });
      tasks.push(makeTask(job, title, at, at + len));
      cursor = at + len + opts.gap;
      budget -= len;
    }
  });

  tasks.sort((a, b) => toMin(a.start!) - toMin(b.start!));
  return { tasks, unscheduled, innerBreaks };
}
