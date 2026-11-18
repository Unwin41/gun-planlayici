const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

/** Local calendar date as "YYYY-MM-DD". */
export function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, n: number): string {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** Monday–Friday. */
export function isWeekday(key: string): boolean {
  const day = parseKey(key).getDay();
  return day !== 0 && day !== 6;
}

/** "17 Kasım Salı" */
export function formatDayTr(key: string): string {
  const d = parseKey(key);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${DAYS[d.getDay()]}`;
}

/** "Bugün" / "Yarın" / "Dün" / "17 Kasım Salı" relative to `today`. */
export function relativeDayTr(key: string, today: string = dateKey()): string {
  if (key === today) return 'Bugün';
  if (key === addDays(today, 1)) return 'Yarın';
  if (key === addDays(today, -1)) return 'Dün';
  return formatDayTr(key);
}
