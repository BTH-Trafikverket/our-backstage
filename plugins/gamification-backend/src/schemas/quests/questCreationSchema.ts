import { z } from 'zod';

export const COMPLETION_POLICIES = ['ONE_TIME', 'REPEATABLE'] as const;
export type CompletionPolicy = (typeof COMPLETION_POLICIES)[number];
export const QUEST_SUBJECT_TYPES = ['user', 'team'] as const;
export type QuestSubjectType = (typeof QUEST_SUBJECT_TYPES)[number];

export const questCreationSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  /**
   * How many completions are required before XP is awarded.
   * For ONE_TIME quests this represents the total completions allowed (e.g. 3 means
   * the quest can be completed up to 3 times, then is permanently done for that user).
   */
  target_count: z.number().int().positive().default(1),
  xp_reward: z.number().int().positive(),
  subject_type: z.enum(QUEST_SUBJECT_TYPES).default('user'),
  completion_policy: z.enum(COMPLETION_POLICIES).default('REPEATABLE'),
  /** Only meaningful for REPEATABLE quests – number of days before re-completion is allowed. */
  cooldown_days: z.number().int().positive().nullable().optional(),
});

export type QuestCreationInput = z.infer<typeof questCreationSchema>;
