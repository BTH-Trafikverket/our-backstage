import { z } from 'zod';

export const COMPLETION_POLICIES = ['ONE_TIME', 'REPEATABLE'] as const;
export type CompletionPolicy = (typeof COMPLETION_POLICIES)[number];
export const QUEST_SUBJECT_TYPES = ['user', 'team'] as const;
export type QuestSubjectType = (typeof QUEST_SUBJECT_TYPES)[number];

export const questCreationSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().default(''),
    /**
     * interval is only required for REPEATABLE quests.
     * For ONE_TIME quests it is forced to 1 by the service.
     */
    interval: z.number().int().positive().default(1),
    xp_reward: z.number().int().positive(),
    subject_type: z.enum(QUEST_SUBJECT_TYPES).default('user'),
    subject_ref: z.string().min(1).nullable().optional(),
    completion_policy: z.enum(COMPLETION_POLICIES).default('REPEATABLE'),
    /** Only meaningful for REPEATABLE quests – number of days before re-completion is allowed. */
    cooldown_days: z.number().int().positive().nullable().optional(),
  })
  .superRefine((quest, ctx) => {
    if (quest.subject_type === 'team' && !quest.subject_ref) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['subject_ref'],
        message: 'subject_ref is required for team quests',
      });
    }
  });

export type QuestCreationInput = z.infer<typeof questCreationSchema>;
