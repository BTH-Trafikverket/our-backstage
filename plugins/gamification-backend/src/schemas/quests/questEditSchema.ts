import { z } from 'zod';
import { COMPLETION_POLICIES } from './questCreationSchema';

export const questEditSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    target_count: z.number().int().positive().optional(),
    xp_reward: z.number().int().nonnegative().optional(),
    completion_policy: z.enum(COMPLETION_POLICIES).optional(),
    cooldown_days: z.number().int().positive().nullable().optional(),
  })
  .strict()
  .refine(
    data =>
      data.title !== undefined ||
      data.description !== undefined ||
      data.target_count !== undefined ||
      data.xp_reward !== undefined ||
      data.completion_policy !== undefined ||
      data.cooldown_days !== undefined,
    { message: 'No fields provided to update' },
  );

export type QuestEditSchema = z.infer<typeof questEditSchema>;
