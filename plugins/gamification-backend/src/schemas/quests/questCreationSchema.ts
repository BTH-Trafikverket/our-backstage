import { z } from 'zod';

export const COMPLETION_POLICIES = ['ONE_TIME', 'REPEATABLE'] as const;
export type CompletionPolicy = (typeof COMPLETION_POLICIES)[number];
export const QUEST_SUBJECT_TYPES = ['user', 'team'] as const;
export type QuestSubjectType = (typeof QUEST_SUBJECT_TYPES)[number];
export const questSubjectTypeSchema = z.enum(QUEST_SUBJECT_TYPES);

export const questCreationSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  target_count: z.number().int().positive().default(1),
  xp_reward: z.number().int().nonnegative(),
  subject_type: questSubjectTypeSchema.default('user'),
  completion_policy: z.enum(COMPLETION_POLICIES).default('REPEATABLE'),
  cooldown_days: z.number().int().positive().nullable().optional(),
});

export type QuestCreationInput = z.infer<typeof questCreationSchema>;
