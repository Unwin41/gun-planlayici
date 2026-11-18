import type { Settings } from '@/types';

/**
 * Claude model used for plan generation. Swap to 'claude-haiku-5-5' for a much
 * cheaper (and faster) option; everything else stays the same.
 */
export const AI_MODEL = 'claude-opus-5-5';

/** Set to a proxy URL later if the app is distributed with a shared key held server-side. */
export const AI_BASE_URL: string | undefined = undefined;

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  wakeTime: '07:30',
  sleepTime: '23:00',
  checkinTime: '21:00',
  aiEnabled: true,
};

/** Default length (minutes) when the student gives no duration. */
export const DEFAULT_DURATIONS = {
  ders: 45,
  odev: 45,
  sinav: 60,
  spor: 60,
  okuma: 30,
  kisisel: 30,
  diger: 30,
} as const;
