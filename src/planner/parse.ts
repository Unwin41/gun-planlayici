import type { Category } from '@/types';
import { fromMin } from '@/utils/time';

import { detectSubject, extractPageCount, extractQuestionCount, SUBJECT_LABELS, type Subject } from './estimate';

export interface ParsedItem {
  title: string;
  category: Category;
  durationMin?: number;
  fixedStart?: string;
  /** "100 soru Türkçe" -> 100; the planner estimates the duration from it. */
  questionCount?: number;
  /** "12 sayfa matematik" -> 12; used the same way when no question count is given. */
  pageCount?: number;
  subject?: Subject;
}

const LETTER = 'a-zçğıöşüâîû';
const NOT_LETTER = `(?![${LETTER}])`;

/** Turkish-aware lowercase (I -> ı, İ -> i) without relying on Intl locale data. */
export function trLower(s: string): string {
  return s.replace(/I/g, 'ı').replace(/İ/g, 'i').toLowerCase();
}

export function trUpperFirst(s: string): string {
  if (!s) return s;
  const first = s[0] === 'i' ? 'İ' : s[0] === 'ı' ? 'I' : s[0].toUpperCase();
  return first + s.slice(1);
}

/** Removes "(1/2)", "(devam)" and starter-step suffixes added by the scheduler (old and new wording). */
export function stripPartSuffix(title: string): string {
  return title
    .replace(/\s*\(\d+\/\d+\)\s*$/, '')
    .replace(/\s*\(devam\)\s*$/i, '')
    .replace(/\s*\(ilk 15 dk\)\s*$/i, '')
    .replace(/\s*[—–-]\s*15 dk'lık başlangıç\s*$/i, '')
    .trim();
}

const CATEGORY_KEYWORDS: [Category, string[]][] = [
  ['sinav', ['sınav', 'deneme', 'quiz', 'yazılı', 'test çöz', 'soru çöz']],
  ['odev', ['ödev', 'proje', 'rapor', 'sunum']],
  [
    'spor',
    ['spor', 'antrenman', 'idman', 'koşu', 'yürüyüş', 'maç', 'basketbol', 'futbol', 'voleybol', 'yüzme', 'gym', 'fitness', 'pilates', 'yoga'],
  ],
  ['okuma', ['kitap', 'roman', 'oku']],
  [
    'ders',
    ['matematik', 'mat ', 'geometri', 'fizik', 'kimya', 'biyoloji', 'tarih', 'coğrafya', 'edebiyat', 'türkçe', 'ingilizce', 'almanca', 'fransızca', 'felsefe', 'din kültürü', 'ders', 'tekrar', 'çalış', 'konu', 'kelime', 'özet', 'not'],
  ],
  [
    'kisisel',
    ['oda', 'temizlik', 'alışveriş', 'market', 'yemek', 'duş', 'arkadaş', 'aile', 'anne', 'baba', 'kardeş', 'bulaşık', 'çamaşır', 'doktor', 'kurs'],
  ],
];

export function guessCategory(text: string): Category {
  const s = ` ${trLower(text)} `;
  for (const [category, words] of CATEGORY_KEYWORDS) {
    if (words.some((w) => s.includes(w))) return category;
  }
  return 'diger';
}

export function isHard(category: Category): boolean {
  return category === 'sinav' || category === 'ders' || category === 'odev';
}

/** Splits free text into one string per job. */
export function splitItems(text: string): string[] {
  return text
    .split(/\n|,|;|\s+ve\s+|\s*\+\s*|\.\s+/i)
    .map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((s) => s.length > 0);
}

function extractDuration(s: string): { minutes?: number; rest: string } {
  const patterns: [RegExp, (m: RegExpExecArray) => number][] = [
    [/yarım\s*saat/, () => 30],
    [new RegExp(`(\\d+)\\s*buçuk\\s*saat${NOT_LETTER}`), (m) => Number(m[1]) * 60 + 30],
    [/bir\s+saat/, () => 60],
    [new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:saat|sa)${NOT_LETTER}`), (m) => Math.round(Number(m[1].replace(',', '.')) * 60)],
    [new RegExp(`(\\d+)\\s*(?:dakika|dakka|dak|dk)${NOT_LETTER}`), (m) => Number(m[1])],
  ];
  for (const [re, toMinutes] of patterns) {
    const m = re.exec(s);
    if (m) {
      const minutes = toMinutes(m);
      if (minutes > 0 && minutes <= 8 * 60) {
        return { minutes, rest: s.replace(m[0], ' ') };
      }
    }
  }
  return { rest: s };
}

const SUFFIX = `(?:'?\\s*(?:de|da|te|ta|ye|ya|e|a)${NOT_LETTER})?`;

function extractFixedTime(s: string): { start?: string; rest: string } {
  const patterns = [
    new RegExp(`(?:saat\\s*)?(\\d{1,2})[:.](\\d{2})${SUFFIX}`),
    new RegExp(`saat\\s*(\\d{1,2})(?![\\d:.])${SUFFIX}`),
    new RegExp(`(\\d{1,2})\\s*'?\\s*(?:de|da|te|ta)${NOT_LETTER}`),
  ];
  for (const re of patterns) {
    const m = re.exec(s);
    if (!m) continue;
    let h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    if (h > 23 || min > 59) continue;
    const evening = /akşam|öğleden sonra|öğlen|gece/.test(s);
    const morning = /sabah/.test(s);
    if (evening && h < 12) h += 12;
    else if (!morning && h >= 1 && h <= 7) h += 12; // "5'te antrenman" -> 17:00
    return { start: fromMin(h * 60 + min), rest: s.replace(m[0], ' ') };
  }
  return { rest: s };
}

function cleanTitle(s: string): string {
  return s
    .replace(/öğleden sonra|sabah|akşam|öğlen|gece/g, ' ')
    .replace(new RegExp(`(^|\\s)(?:saat|bugün|sonra|için|kadar)${NOT_LETTER}`, 'g'), ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:.'"]+|[\s\-–—:.'"]+$/g, '')
    .trim();
}

/** Words that only say "solve N questions"; if nothing else is left, the title is rebuilt. */
function isQuestionFiller(word: string, subject: Subject): boolean {
  return (
    /^\d+$/.test(word) ||
    /^(?:tane|adet)$/.test(word) ||
    word.startsWith('soru') ||
    word.startsWith('çöz') ||
    detectSubject(word) === subject
  );
}

/** "100 soru türkçe" / "türkçeden 100 soru çöz" -> "Türkçe 100 soru"; anything more specific is kept as typed. */
function questionTitle(title: string, count: number, subject: Subject): string {
  if (subject === 'genel') return title;
  const extra = title.split(/\s+/).filter((w) => !isQuestionFiller(w, subject));
  return extra.length ? title : `${SUBJECT_LABELS[subject]} ${count} soru`;
}

export function parseItem(raw: string): ParsedItem | null {
  const lower = trLower(raw);
  const { minutes, rest: afterDuration } = extractDuration(lower);
  const { start, rest } = extractFixedTime(afterDuration);
  const title = cleanTitle(rest);
  if (title.length < 2) return null;

  const questionCount = extractQuestionCount(title);
  const pageCount = questionCount ? undefined : extractPageCount(title);
  const subject = questionCount || pageCount ? detectSubject(title) : undefined;
  const finalTitle = questionCount && subject ? questionTitle(title, questionCount, subject) : title;
  return {
    title: trUpperFirst(finalTitle),
    category: guessCategory(finalTitle),
    durationMin: minutes,
    fixedStart: start,
    ...(questionCount ? { questionCount, subject } : {}),
    ...(pageCount ? { pageCount, subject } : {}),
  };
}

export function parseTasksText(text: string): ParsedItem[] {
  return splitItems(text)
    .map(parseItem)
    .filter((x): x is ParsedItem => x !== null);
}
