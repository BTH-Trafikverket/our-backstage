import { z } from 'zod';
import {
  linkedQuestConfigSchema,
  COMPLETION_POLICIES,
  QUEST_MODES,
  QUEST_SUBJECT_TYPES,
} from './questCreationSchema';

const optionalNonEmptyTrimmedString = z.string().trim().min(1).optional();

export const questEditSchema = z
  .object({
    title: optionalNonEmptyTrimmedString,
    description: optionalNonEmptyTrimmedString,
    target_count: z.number().int().positive().optional(),
    xp_reward: z.number().int().nonnegative().optional(),
    subject_type: z.enum(QUEST_SUBJECT_TYPES).optional(),
    completion_policy: z.enum(COMPLETION_POLICIES).optional(),
    cooldown_days: z.number().int().positive().nullable().optional(),
    quest_mode: z.enum(QUEST_MODES).optional(),
    linked_config: linkedQuestConfigSchema,
  })
  .strict()
  .refine(
    data =>
      data.title !== undefined ||
      data.description !== undefined ||
      data.target_count !== undefined ||
      data.xp_reward !== undefined ||
      data.subject_type !== undefined ||
      data.completion_policy !== undefined ||
      data.cooldown_days !== undefined ||
      data.quest_mode !== undefined ||
      data.linked_config !== undefined,
    { message: 'No fields provided to update' },
  );

export type QuestEditSchema = z.infer<typeof questEditSchema>;
