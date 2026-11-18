import type { PlanOutcome } from '@/planner';
import type { CarryOverTask, Followed, Reason } from '@/types';

/** Where the guided conversation currently is. */
export type Step =
  | { kind: 'idle' }
  | { kind: 'askTasks'; date: string; carryOver: CarryOverTask[] }
  | { kind: 'review'; date: string; carryOver: CarryOverTask[]; userText: string; draft: PlanOutcome }
  | { kind: 'checkinFollowed'; date: string }
  | { kind: 'checkinConfirm'; date: string }
  | { kind: 'checkinReason'; date: string; followed: Followed; queue: string[]; reasons: Record<string, Reason>; note?: string }
  | { kind: 'askTomorrow'; date: string; carryOver: CarryOverTask[] };

export interface ChatMessage {
  id: string;
  from: 'bot' | 'user';
  text: string;
  at: string;
}
