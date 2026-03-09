import { z } from 'zod';

export const COMPLETION_POLICIES = ['ONE_TIME', 'REPEATABLE'] as const;
export type CompletionPolicy = (typeof COMPLETION_POLICIES)[number];

export const questCreationSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  /**
   * interval is only required for REPEATABLE quests.
   * For ONE_TIME quests it is forced to 1 by the service.
   */
  interval: z.number().int().positive().default(1),
  xp_reward: z.number().int().positive(),
  entityRef: z.string().optional(),
  completion_policy: z.enum(COMPLETION_POLICIES).default('REPEATABLE'),
  /** Only meaningful for REPEATABLE quests – number of days before re-completion is allowed. */
  cooldown_days: z.number().int().positive().nullable().optional(),
});

export type QuestCreationInput = z.infer<typeof questCreationSchema>;
