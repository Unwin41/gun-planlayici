/**
 * Time estimates for question-solving jobs ("100 soru Türkçe", "matematikten 40 soru").
 * Minutes per question depend on the subject and the school level, and include a
 * little time for checking answers — real practice, not exam pace.
 */
import { gradeLabel, type Grade } from '@/types';

export type Subject =
  | 'turkce'
  | 'edebiyat'
  | 'matematik'
  | 'geometri'
  | 'fizik'
  | 'kimya'
  | 'biyoloji'
  | 'fen'
  | 'tarih'
  | 'cografya'
  | 'inkilap'
  | 'sosyal'
  | 'felsefe'
  | 'din'
  | 'ingilizce'
  | 'genel';

export type Level = 'ilkokul' | 'ortaokul' | 'lise';

export const SUBJECT_LABELS: Record<Subject, string> = {
  turkce: 'Türkçe',
  edebiyat: 'Edebiyat',
  matematik: 'Matematik',
  geometri: 'Geometri',
  fizik: 'Fizik',
  kimya: 'Kimya',
  biyoloji: 'Biyoloji',
  fen: 'Fen',
  tarih: 'Tarih',
  cografya: 'Coğrafya',
  inkilap: 'İnkılap Tarihi',
  sosyal: 'Sosyal',
  felsefe: 'Felsefe',
  din: 'Din Kültürü',
  ingilizce: 'İngilizce',
  genel: 'Soru',
};

/**
 * Minutes per question. Anchors: LGS gives ~1.5 dk/soru for the verbal part and
 * 2 dk for maths/science; TYT is ~1 dk for Türkçe and ~1.5–2 dk for maths.
 */
const RATES: Record<Level, Record<Subject, number>> = {
  ilkokul: {
    turkce: 1.5, edebiyat: 1.5, matematik: 2, geometri: 2, fizik: 1.75, kimya: 1.75, biyoloji: 1.5, fen: 1.5,
    tarih: 1.25, cografya: 1.25, inkilap: 1.25, sosyal: 1.25, felsefe: 1.25, din: 1, ingilizce: 1.25, genel: 1.5,
  },
  ortaokul: {
    turkce: 1.5, edebiyat: 1.5, matematik: 2, geometri: 2, fizik: 1.75, kimya: 1.75, biyoloji: 1.5, fen: 1.75,
    tarih: 1.25, cografya: 1.25, inkilap: 1.25, sosyal: 1.25, felsefe: 1.25, din: 1, ingilizce: 1.25, genel: 1.5,
  },
  lise: {
    turkce: 1.1, edebiyat: 1.25, matematik: 2, geometri: 2.25, fizik: 2, kimya: 1.75, biyoloji: 1.25, fen: 1.5,
    tarih: 0.9, cografya: 1, inkilap: 0.9, sosyal: 0.9, felsefe: 0.9, din: 0.75, ingilizce: 1, genel: 1.25,
  },
};

/** Used when the grade is unknown (old installs before the grade question). */
const DEFAULT_LEVEL: Level = 'ortaokul';
const MAX_ESTIMATE = 8 * 60;

export function levelOf(grade: Grade | undefined): Level {
  if (grade === undefined) return DEFAULT_LEVEL;
  if (grade === 'mezun' || grade >= 9) return 'lise';
  return grade >= 5 ? 'ortaokul' : 'ilkokul';
}

const L = 'a-zçğıöşüâîû';
/** Stems may take any suffix ("türkçeden", "matematikten"). */
const stems = (...words: string[]) => new RegExp(`(?:^|[^${L}])(?:${words.join('|')})`);
/** Short words must stand alone or take one of the given suffixes ("mat", "mattan"). */
const exact = (...words: string[]) => new RegExp(`(?:^|[^${L}])(?:${words.join('|')})(?![${L}])`);

/** Checked in order: the more specific subject first. */
const SUBJECT_PATTERNS: [Subject, RegExp][] = [
  ['geometri', stems('geometri')],
  ['matematik', stems('matematik', 'problem')],
  ['matematik', exact('mat', "mat'?tan", "mat'?ten")],
  ['inkilap', stems('inkılap', 'inkilap', 'atatürkçülük')],
  ['edebiyat', stems('edebiyat')],
  ['turkce', stems('türkçe', 'paragraf', 'dil ?bilgisi', 'dilbilgisi')],
  ['fizik', stems('fizik')],
  ['kimya', stems('kimya')],
  ['biyoloji', stems('biyoloji')],
  ['fen', stems('fen bilim')],
  ['fen', exact('fen', "fen'?den", "fen'?e", "fen'?de")],
  ['tarih', stems('tarih')],
  ['cografya', stems('coğrafya', 'cografya')],
  ['sosyal', stems('sosyal')],
  ['felsefe', stems('felsefe', 'psikoloji', 'sosyoloji', 'mantık')],
  ['din', stems('din kültür')],
  ['din', exact('din', "din'?den")],
  ['ingilizce', stems('ingilizce', 'yabancı dil', 'english')],
];

export function detectSubject(lowerText: string): Subject {
  for (const [subject, re] of SUBJECT_PATTERNS) if (re.test(lowerText)) return subject;
  return 'genel';
}

const QUESTION_RE = /(\d{1,4})\s*(?:tane\s+|adet\s+)?soru/;

/** "100 soru Türkçe" -> 100. Expects Turkish-lowercased text. */
export function extractQuestionCount(lowerText: string): number | undefined {
  const m = QUESTION_RE.exec(lowerText);
  const n = m ? Number(m[1]) : 0;
  return n > 0 ? n : undefined;
}

export function minutesPerQuestion(subject: Subject, grade: Grade | undefined): number {
  return RATES[levelOf(grade)][subject];
}

/** Total minutes for `count` questions, rounded up to 5 (at least 10, at most 8 hours). */
export function estimateQuestionMinutes(count: number, subject: Subject, grade: Grade | undefined): number {
  // Round away float noise first (100 × 1.1 = 110.00000000000001 must stay 110).
  const raw = Math.round(count * minutesPerQuestion(subject, grade) * 100) / 100;
  return Math.min(MAX_ESTIMATE, Math.max(10, Math.ceil(raw / 5) * 5));
}

const PAGE_RE = /(\d{1,4})\s*(?:tane\s+|adet\s+)?sayfa/;

/** "12 sayfa matematik" -> 12. Expects Turkish-lowercased text. */
export function extractPageCount(lowerText: string): number | undefined {
  const m = PAGE_RE.exec(lowerText);
  const n = m ? Number(m[1]) : 0;
  return n > 0 ? n : undefined;
}

/** Minutes per page of a book (reading, not studying). */
const READING_RATES: Record<Level, number> = { ilkokul: 3, ortaokul: 2, lise: 1.5 };
/** A workbook / test-book page holds roughly this many questions' worth of work. */
const QUESTIONS_PER_PAGE = 3;

export function minutesPerPage(subject: Subject, grade: Grade | undefined, reading: boolean): number {
  return reading ? READING_RATES[levelOf(grade)] : minutesPerQuestion(subject, grade) * QUESTIONS_PER_PAGE;
}

/** Total minutes for `count` pages, rounded like question estimates. */
export function estimatePageMinutes(count: number, subject: Subject, grade: Grade | undefined, reading: boolean): number {
  const raw = Math.round(count * minutesPerPage(subject, grade, reading) * 100) / 100;
  return Math.min(MAX_ESTIMATE, Math.max(10, Math.ceil(raw / 5) * 5));
}

/** "10. sınıf" / "Mezun" / "sınıf bilinmiyor" for coach messages and the AI prompt. */
export function gradeText(grade: Grade | undefined): string {
  return grade === undefined ? 'sınıf bilinmiyor' : gradeLabel(grade);
}
