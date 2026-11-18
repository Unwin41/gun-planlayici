import type { CarryOverTask, Task, TimeRange } from '@/types';
import { newId } from '@/utils/id';
import { fromMin, isValidTime, toMin } from '@/utils/time';

import type { AiPlan } from './schema';
import { trLower, stripPartSuffix } from './parse';
import { dayWindow, FLEX_TITLE } from './schedule';

export interface SanitizeOptions {
  wakeTime: string;
  sleepTime: string;
  startFrom: string;
  carryOver: CarryOverTask[];
  /** School hours; flexible blocks inside them move to after school. */
  school?: TimeRange;
}

export interface SanitizeResult {
  tasks: Task[];
  /** Titles that had to be removed (bad time, outside the day, no room). */
  dropped: string[];
}

/**
 * Makes model output safe to store: valid "HH:mm", inside wake–sleep, sorted,
 * no overlaps (later blocks are pushed back; if that breaks bedtime they are dropped).
 */
export function sanitizeAiTasks(raw: AiPlan['tasks'], opts: SanitizeOptions): SanitizeResult {
  const window = dayWindow(opts.wakeTime, opts.sleepTime);
  const earliest = Math.max(window.start, isValidTime(opts.startFrom) ? toMin(opts.startFrom) : window.start);
  const dropped: string[] = [];
  const carryByTitle = new Map(opts.carryOver.map((c) => [trLower(c.title), c.carryCount]));
  const school =
    opts.school && isValidTime(opts.school.start) && isValidTime(opts.school.end)
      ? { start: toMin(opts.school.start), end: toMin(opts.school.end) }
      : null;

  const candidates = raw
    .map((t) => ({ ...t, title: t.title.trim() }))
    .filter((t) => {
      const ok = t.title.length > 0 && isValidTime(t.start) && isValidTime(t.end) && toMin(t.end) > toMin(t.start);
      if (!ok && t.title) dropped.push(t.title);
      return ok;
    })
    // Move flexible blocks out of school before sorting, so they cannot push fixed items later in the day.
    .map((t) => {
      if (!school || t.fixed) return t;
      const start = toMin(t.start);
      const end = toMin(t.end);
      if (!(start < school.end && school.start < end)) return t;
      return { ...t, start: fromMin(school.end), end: fromMin(school.end + end - start) };
    })
    .sort((a, b) => toMin(a.start) - toMin(b.start));

  const tasks: Task[] = [];
  let prevEnd = -1;
  for (const t of candidates) {
    let start = toMin(t.start);
    let end = toMin(t.end);
    const len = end - start;
    if (start < earliest) {
      if (t.fixed) {
        dropped.push(t.title);
        continue;
      }
      start = earliest;
      end = start + len;
    }
    if (start < prevEnd) {
      start = prevEnd;
      end = start + len;
    }
    if (school && !t.fixed && start < school.end && school.start < end) {
      start = Math.max(school.end, prevEnd);
      end = start + len;
    }
    if (end > window.end) {
      dropped.push(t.title);
      continue;
    }
    const baseTitle = stripPartSuffix(t.title);
    const isFlex = trLower(baseTitle).startsWith(trLower('Esnek zaman'));
    tasks.push({
      id: newId(),
      title: t.title,
      baseTitle: isFlex ? FLEX_TITLE : baseTitle,
      start: fromMin(start),
      end: fromMin(end),
      category: t.category,
      done: false,
      carryCount: carryByTitle.get(trLower(baseTitle)) ?? 0,
      ...(t.fixed ? { fixed: true } : {}),
      ...(isFlex ? { flex: true } : {}),
    });
    prevEnd = end;
  }
  return { tasks, dropped };
}
