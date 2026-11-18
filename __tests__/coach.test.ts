/**
 * End-to-end conversation in offline (rules) mode:
 * plan today -> tick some -> end of day -> reasons -> tomorrow's adapted plan.
 */
import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

import * as coach from '@/chat/coach';
import { useStore } from '@/store/useStore';

const S = () => useStore.getState();
const lastBot = () => [...S().messages].reverse().find((m) => m.from === 'bot')!.text;

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(2026, 10, 17, 8, 0), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  S().resetAll();
  S().updateSettings({ onboarded: true, aiEnabled: false, wakeTime: '08:00', sleepTime: '23:00', checkinTime: '21:00' });
});

afterEach(() => {
  jest.useRealTimers();
});

it('runs the full day loop', async () => {
  coach.greet();
  expect(S().step).toMatchObject({ kind: 'askTasks', date: '2026-11-17' });

  await coach.submitText("matematik ödevi, kitap oku, saat 5'te antrenman");
  expect(S().step.kind).toBe('review');
  coach.confirmPlan();

  const today = S().days['2026-11-17'];
  expect(today.tasks.map((t) => t.title)).toEqual(['Matematik ödevi', 'Kitap oku', 'Antrenman']);
  expect(S().step.kind).toBe('idle');

  // Student ticks off reading and training, not math.
  for (const t of today.tasks.filter((t) => t.title !== 'Matematik ödevi')) S().toggleTask('2026-11-17', t.id);

  // Evening.
  jest.setSystemTime(new Date(2026, 10, 17, 21, 5));
  coach.greet();
  expect(S().step).toMatchObject({ kind: 'checkinFollowed', date: '2026-11-17' });

  coach.answerFollowed('partly');
  expect(lastBot()).toBe('«Matematik ödevi» için seni ne engelledi?');

  coach.answerReason('motivasyon_yoktu');
  expect(S().days['2026-11-17'].checkin).toMatchObject({ followed: 'partly', reasons: { 'Matematik ödevi': 'motivasyon_yoktu' } });
  expect(S().step).toMatchObject({ kind: 'askTomorrow', date: '2026-11-18' });
  expect(lastBot()).toMatch(/Yarım kalanları \(Matematik ödevi\)/);

  await coach.submitText('1 saat fizik');
  expect(S().step.kind).toBe('review');
  coach.confirmPlan();

  const tomorrow = S().days['2026-11-18'];
  // Carried job first, adapted with a 15-minute starter step.
  expect(tomorrow.tasks[0]).toMatchObject({ title: 'Matematik ödevi (ilk 15 dk)', start: '08:00', end: '08:15', carryCount: 1 });
  expect(tomorrow.tasks.some((t) => t.baseTitle === 'Fizik')).toBe(true);
});

it('asks about yesterday first when the check-in was skipped', async () => {
  coach.greet();
  await coach.submitText('kitap oku');
  coach.confirmPlan();

  // Next morning, no check-in happened.
  jest.setSystemTime(new Date(2026, 10, 18, 9, 0));
  coach.greet();
  expect(S().step).toMatchObject({ kind: 'checkinFollowed', date: '2026-11-17' });

  coach.answerFollowed('yes');
  expect(S().step.kind).toBe('checkinConfirm');
  coach.answerConfirm(true);
  expect(S().days['2026-11-17'].checkin?.followed).toBe('yes');
  // Follow-up plan is for today, not "tomorrow".
  expect(S().step).toMatchObject({ kind: 'askTomorrow', date: '2026-11-18', carryOver: [] });
});

it('re-planning today keeps done tasks and fixed times', async () => {
  coach.greet();
  await coach.submitText("kitap oku, saat 5'te antrenman");
  coach.confirmPlan();
  const book = S().days['2026-11-17'].tasks.find((t) => t.title === 'Kitap oku')!;
  S().toggleTask('2026-11-17', book.id);

  jest.setSystemTime(new Date(2026, 10, 17, 12, 0));
  await coach.submitText('matematik'); // typed while idle = add to today
  expect(S().step.kind).toBe('review');
  coach.confirmPlan();

  const tasks = S().days['2026-11-17'].tasks;
  expect(tasks.find((t) => t.title === 'Antrenman')).toMatchObject({ start: '17:00', fixed: true });
  expect(tasks.find((t) => t.title === 'Kitap oku')).toMatchObject({ done: true });
  expect(tasks.find((t) => t.title === 'Matematik')!.start).toBe('12:00');
  expect(tasks.filter((t) => t.title === 'Antrenman')).toHaveLength(1);
});

it('late at night with no plan, the coach offers to plan tomorrow', () => {
  jest.setSystemTime(new Date(2026, 10, 17, 23, 5));
  coach.greet();
  expect(S().step).toMatchObject({ kind: 'askTasks', date: '2026-11-18' });
  expect(lastBot()).toMatch(/^Bugün için geç oldu, yarını planlayalım\. Yarın neler/);
});

it('"Aslında yaptım" ticks the job and the day counts as followed', () => {
  S().savePlan('2026-11-17', {
    source: 'rules',
    coachNote: '',
    unscheduled: [],
    tasks: [{ id: 't1', title: 'Tarih', baseTitle: 'Tarih', start: '09:00', end: '09:45', category: 'ders', done: false, carryCount: 0 }],
  });
  coach.startCheckin('2026-11-17');
  coach.answerFollowed('no');
  coach.answerReason('done');
  expect(S().days['2026-11-17'].tasks[0].done).toBe(true);
  expect(S().days['2026-11-17'].checkin?.followed).toBe('yes');
});
