const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(value: string | undefined): value is string {
  return typeof value === 'string' && TIME_RE.test(value.trim());
}

/** "HH:mm" -> minutes since midnight. */
export function toMin(value: string): number {
  const m = TIME_RE.exec(value.trim());
  if (!m) throw new Error(`Geçersiz saat: ${value}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Minutes since midnight -> "HH:mm" (clamped to the same day). */
export function fromMin(total: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(total)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function roundUp(minutes: number, step: number): number {
  return Math.ceil(minutes / step) * step;
}

export function nowMin(date: Date = new Date()): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** Normalises inputs like "7", "7.30", "730" or "07:30" to "HH:mm"; null if not a time. */
export function normalizeTime(input: string): string | null {
  const s = input.trim().replace('.', ':');
  let h: number;
  let m: number;
  if (/^\d{1,2}$/.test(s)) {
    h = Number(s);
    m = 0;
  } else if (/^\d{3,4}$/.test(s)) {
    h = Number(s.slice(0, -2));
    m = Number(s.slice(-2));
  } else if (/^\d{1,2}:\d{2}$/.test(s)) {
    [h, m] = s.split(':').map(Number);
  } else {
    return null;
  }
  if (h > 23 || m > 59) return null;
  return fromMin(h * 60 + m);
}
