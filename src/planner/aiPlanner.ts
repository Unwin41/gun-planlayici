import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

import { AI_BASE_URL, AI_MODEL } from '@/config';
import type { PlanInput, PlanResult } from '@/types';

import { buildUserMessage, SYSTEM_PROMPT } from './prompts';
import { PlanSchema } from './schema';
import { sanitizeAiTasks } from './validate';

export type AiFailure = 'auth' | 'rate_limit' | 'network' | 'refusal' | 'bad_output' | 'unknown';

export class AiPlannerError extends Error {
  constructor(
    public readonly kind: AiFailure,
    message: string,
  ) {
    super(message);
    this.name = 'AiPlannerError';
  }
}

function toFailure(error: unknown): AiPlannerError {
  if (error instanceof AiPlannerError) return error;
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new AiPlannerError('auth', 'API anahtarı geçersiz ya da yetkisiz.');
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiPlannerError('rate_limit', 'Yapay zeka şu an çok yoğun.');
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiPlannerError('network', 'İnternet bağlantısı yok ya da zaman aşımı oldu.');
  }
  if (error instanceof Anthropic.APIError) {
    return new AiPlannerError('unknown', `Yapay zeka hatası (${error.status ?? '?'}).`);
  }
  return new AiPlannerError('bad_output', 'Yapay zekanın cevabı okunamadı.');
}

/**
 * Plans the day with Claude. The key is the student's own (stored in SecureStore);
 * `dangerouslyAllowBrowser` only matters for the web build and is acceptable here
 * because no shared/developer key ever ships in the app.
 */
export async function createAiPlan(input: PlanInput, apiKey: string): Promise<PlanResult> {
  const client = new Anthropic({
    apiKey,
    baseURL: AI_BASE_URL,
    dangerouslyAllowBrowser: true,
    maxRetries: 1,
    timeout: 60_000,
  });

  try {
    const message = await client.messages.parse({
      model: AI_MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage(input) }],
      // Planning one day is a light task: low effort keeps the wait short.
      output_config: { effort: 'low', format: zodOutputFormat(PlanSchema) },
    });

    if (message.stop_reason === 'refusal') {
      throw new AiPlannerError('refusal', 'Yapay zeka bu isteği yanıtlamadı.');
    }
    const plan = message.parsed_output;
    if (!plan) throw new AiPlannerError('bad_output', 'Yapay zekanın cevabı okunamadı.');

    const { tasks, dropped } = sanitizeAiTasks(plan.tasks, input);
    if (tasks.length === 0 && (input.userText.trim() || input.carryOver.length)) {
      throw new AiPlannerError('bad_output', 'Yapay zeka geçerli bir plan üretemedi.');
    }
    return {
      tasks,
      unscheduled: [...plan.unscheduled, ...dropped],
      coachNote: plan.coachNote.trim(),
      source: 'ai',
    };
  } catch (error) {
    throw toFailure(error);
  }
}
