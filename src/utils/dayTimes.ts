import type { Settings } from '@/types';

import { normalizeTime, toMin } from './time';

/** What the student typed in the "Günün saatleri" form. */
export interface DayTimesForm {
  wake: string;
  sleep: string;
  checkin: string;
  goesToSchool: boolean;
  schoolStart: string;
  schoolEnd: string;
}

export type DayTimes = Pick<Settings, 'wakeTime' | 'sleepTime' | 'checkinTime' | 'schoolStart' | 'schoolEnd'>;

export const DEFAULT_SCHOOL = { start: '08:30', end: '15:30' } as const;

export function dayTimesForm(settings: Settings): DayTimesForm {
  return {
    wake: settings.wakeTime,
    sleep: settings.sleepTime,
    checkin: settings.checkinTime,
    goesToSchool: settings.schoolStart !== undefined,
    schoolStart: settings.schoolStart ?? DEFAULT_SCHOOL.start,
    schoolEnd: settings.schoolEnd ?? DEFAULT_SCHOOL.end,
  };
}

/** Normalises and checks the form; returns settings to save or a message for the student. */
export function readDayTimes(form: DayTimesForm): { ok: true; value: DayTimes } | { ok: false; error: string } {
  const wakeTime = normalizeTime(form.wake);
  const sleepTime = normalizeTime(form.sleep);
  const checkinTime = normalizeTime(form.checkin);
  if (!wakeTime || !sleepTime || !checkinTime) return { ok: false, error: 'Saatleri 07:30 gibi yaz.' };

  if (!form.goesToSchool) return { ok: true, value: { wakeTime, sleepTime, checkinTime, schoolStart: undefined, schoolEnd: undefined } };

  const schoolStart = normalizeTime(form.schoolStart);
  const schoolEnd = normalizeTime(form.schoolEnd);
  if (!schoolStart || !schoolEnd) return { ok: false, error: 'Okul saatlerini 08:30 gibi yaz.' };
  if (toMin(schoolEnd) <= toMin(schoolStart)) return { ok: false, error: 'Okul çıkış saati, giriş saatinden sonra olmalı.' };
  if (toMin(schoolStart) < toMin(wakeTime)) return { ok: false, error: 'Okul, uyanma saatinden önce başlayamaz.' };
  return { ok: true, value: { wakeTime, sleepTime, checkinTime, schoolStart, schoolEnd } };
}
