import type { PlanInput, PlanResult } from '@/types';

import { AiPlannerError, createAiPlan } from './aiPlanner';
import { createRulePlan } from './rulePlanner';

export interface PlannerOptions {
  aiEnabled: boolean;
  apiKey: string | null;
}

export interface PlanOutcome extends PlanResult {
  /** Set when AI was wanted but the offline planner had to step in. */
  fallbackReason?: string;
}

/**
 * Hybrid planner: Claude when AI is on and a key exists, otherwise (or on any
 * AI failure) the deterministic offline planner. Never throws.
 */
export async function makePlan(input: PlanInput, opts: PlannerOptions): Promise<PlanOutcome> {
  if (opts.aiEnabled && opts.apiKey) {
    try {
      return await createAiPlan(input, opts.apiKey);
    } catch (error) {
      const reason = error instanceof AiPlannerError ? error.message : 'Yapay zekaya ulaşılamadı.';
      return { ...createRulePlan(input), fallbackReason: reason };
    }
  }
  return createRulePlan(input);
}
