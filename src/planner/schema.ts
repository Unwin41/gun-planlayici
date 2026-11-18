import { z } from 'zod';

import { CATEGORIES } from '@/types';

/** Shape Claude must return. Time format is checked afterwards in validate.ts. */
export const PlanSchema = z.object({
  tasks: z.array(
    z.object({
      title: z.string().describe('Kısa Türkçe görev adı, ör. "Matematik ödevi (1/2)"'),
      start: z.string().describe('Başlangıç, 24 saat "HH:mm"'),
      end: z.string().describe('Bitiş, 24 saat "HH:mm"'),
      category: z.enum(CATEGORIES),
      fixed: z.boolean().describe('Öğrencinin verdiği sabit saatli iş mi'),
    }),
  ),
  unscheduled: z.array(z.string()).describe('Güne sığmayan işler'),
  coachNote: z.string().describe('Öğrenciye 2-4 cümlelik, destekleyici Türkçe not'),
});

export type AiPlan = z.infer<typeof PlanSchema>;
