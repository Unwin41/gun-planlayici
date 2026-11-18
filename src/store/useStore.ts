import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ChatMessage, Step } from '@/chat/steps';
import { DEFAULT_SETTINGS } from '@/config';
import { guessCategory, trUpperFirst } from '@/planner/parse';
import type { CheckIn, DayPlan, PlanResult, Settings, Task } from '@/types';
import { newId } from '@/utils/id';
import { toMin } from '@/utils/time';

const MAX_MESSAGES = 80;

interface State {
  settings: Settings;
  days: Record<string, DayPlan>;
  messages: ChatMessage[];
  step: Step;
  /** A plan request is running (not persisted). */
  busy: boolean;

  updateSettings: (patch: Partial<Settings>) => void;
  savePlan: (date: string, result: PlanResult) => void;
  toggleTask: (date: string, id: string) => void;
  markDone: (date: string, ids: string[]) => void;
  addTask: (date: string, title: string) => void;
  removeTask: (date: string, id: string) => void;
  saveCheckin: (date: string, checkin: CheckIn) => void;
  addMessage: (from: ChatMessage['from'], text: string) => void;
  setStep: (step: Step) => void;
  setBusy: (busy: boolean) => void;
  resetAll: () => void;
}

function sortTasks(tasks: Task[]): Task[] {
  const key = (t: Task) => (t.start ? toMin(t.start) : 24 * 60);
  return [...tasks].sort((a, b) => key(a) - key(b));
}

function updateDay(days: Record<string, DayPlan>, date: string, fn: (day: DayPlan) => DayPlan): Record<string, DayPlan> {
  const day = days[date];
  if (!day) return days;
  return { ...days, [date]: fn(day) };
}

export const useStore = create<State>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      days: {},
      messages: [],
      step: { kind: 'idle' },
      busy: false,

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      savePlan: (date, result) =>
        set((s) => {
          // Re-planning a day keeps what was already ticked off.
          const keptDone = (s.days[date]?.tasks ?? []).filter((t) => t.done && !t.flex);
          return {
            days: {
              ...s.days,
              [date]: {
                date,
                tasks: sortTasks([...keptDone, ...result.tasks]),
                source: result.source,
                coachNote: result.coachNote,
              },
            },
          };
        }),

      toggleTask: (date, id) =>
        set((s) => ({
          days: updateDay(s.days, date, (d) => ({
            ...d,
            tasks: d.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
          })),
        })),

      markDone: (date, ids) =>
        set((s) => ({
          days: updateDay(s.days, date, (d) => ({
            ...d,
            tasks: d.tasks.map((t) => (ids.includes(t.id) ? { ...t, done: true } : t)),
          })),
        })),

      addTask: (date, rawTitle) =>
        set((s) => {
          const title = trUpperFirst(rawTitle.trim());
          if (!title) return s;
          const task: Task = {
            id: newId(),
            title,
            baseTitle: title,
            category: guessCategory(title),
            done: false,
            carryCount: 0,
          };
          const day = s.days[date] ?? { date, tasks: [], source: 'manual' as const };
          return { days: { ...s.days, [date]: { ...day, tasks: sortTasks([...day.tasks, task]) } } };
        }),

      removeTask: (date, id) =>
        set((s) => ({
          days: updateDay(s.days, date, (d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id) })),
        })),

      saveCheckin: (date, checkin) =>
        set((s) => ({ days: updateDay(s.days, date, (d) => ({ ...d, checkin })) })),

      addMessage: (from, text) =>
        set((s) => ({
          messages: [...s.messages, { id: newId(), from, text, at: new Date().toISOString() }].slice(-MAX_MESSAGES),
        })),

      setStep: (step) => set({ step }),
      setBusy: (busy) => set({ busy }),

      resetAll: () => set({ settings: DEFAULT_SETTINGS, days: {}, messages: [], step: { kind: 'idle' }, busy: false }),
    }),
    {
      name: 'gun-planlayici-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ settings, days, messages, step }) => ({ settings, days, messages, step }),
    },
  ),
);
