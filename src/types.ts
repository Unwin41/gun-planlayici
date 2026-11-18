export const CATEGORIES = [
  'ders',
  'odev',
  'sinav',
  'spor',
  'okuma',
  'kisisel',
  'diger',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  ders: 'Ders',
  odev: 'Ödev',
  sinav: 'Sınav',
  spor: 'Spor',
  okuma: 'Okuma',
  kisisel: 'Kişisel',
  diger: 'Diğer',
};

export const REASONS = [
  'zaman_yetmedi',
  'yorgundum',
  'motivasyon_yoktu',
  'telefon_dikkat',
  'plansiz_is_cikti',
  'gorev_zordu',
  'diger',
] as const;
export type Reason = (typeof REASONS)[number];

export const REASON_LABELS: Record<Reason, string> = {
  zaman_yetmedi: 'Zaman yetmedi',
  yorgundum: 'Yorgundum',
  motivasyon_yoktu: 'Motivasyonum yoktu',
  telefon_dikkat: 'Telefon / dikkatim dağıldı',
  plansiz_is_cikti: 'Plansız bir iş çıktı',
  gorev_zordu: 'Görev çok zordu',
  diger: 'Başka bir sebep',
};

export type Followed = 'yes' | 'partly' | 'no';
export type PlanSource = 'ai' | 'rules' | 'manual';

export interface Task {
  id: string;
  /** Shown in the checklist, e.g. "Matematik (1/2)". */
  title: string;
  /** Original task name without part suffixes; used to group blocks of one job. */
  baseTitle: string;
  /** "HH:mm"; manual tasks may have no time. */
  start?: string;
  end?: string;
  category: Category;
  done: boolean;
  /** How many times this job has been carried over from a previous day. */
  carryCount: number;
  /** Fixed-time item the student gave (e.g. training at 17:00). */
  fixed?: boolean;
  /** Flexible buffer slot; not a real job, never carried over. */
  flex?: boolean;
}

export interface CheckIn {
  followed: Followed;
  /** Keyed by Task.baseTitle. */
  reasons: Record<string, Reason>;
  note?: string;
  at: string;
}

export interface DayPlan {
  /** "YYYY-MM-DD" (local). */
  date: string;
  tasks: Task[];
  source: PlanSource;
  coachNote?: string;
  checkin?: CheckIn;
}

/** School year 1–12, or a graduate preparing for the university exam. */
export const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 'mezun'] as const;
export type Grade = (typeof GRADES)[number];

export function gradeLabel(grade: Grade): string {
  return grade === 'mezun' ? 'Mezun' : `${grade}. sınıf`;
}

export interface Settings {
  onboarded: boolean;
  /** Asked before first use; drives per-question time estimates. Missing on old installs. */
  grade?: Grade;
  wakeTime: string;
  sleepTime: string;
  checkinTime: string;
  /** School hours on weekdays ("HH:mm"); both missing = the student does not go to school. */
  schoolStart?: string;
  schoolEnd?: string;
  aiEnabled: boolean;
}

/** A time range nothing may be planned in, e.g. school. */
export interface TimeRange {
  start: string;
  end: string;
}

/** A job that was not finished and moves to the next plan. */
export interface CarryOverTask {
  title: string;
  category: Category;
  durationMin: number;
  carryCount: number;
  reason?: Reason;
  /** Kept only when re-planning the same day, so fixed-time items stay put. */
  fixedStart?: string;
}

export interface RecentStats {
  /** 0..1 over the last days that had a plan. */
  completionRate: number;
  topReasons: Reason[];
}

export interface PlanInput {
  date: string;
  /** Free text the student typed for new jobs; may be empty. */
  userText: string;
  wakeTime: string;
  sleepTime: string;
  /** Earliest time a new block may start ("HH:mm"). */
  startFrom: string;
  /** School hours on the plan day (weekdays only); nothing else is planned there. */
  school?: TimeRange;
  carryOver: CarryOverTask[];
  recentStats?: RecentStats;
  /** Student's grade, used to estimate how long "100 soru Türkçe" takes. */
  grade?: Grade;
}

export interface PlanResult {
  tasks: Task[];
  coachNote: string;
  unscheduled: string[];
  source: PlanSource;
}
