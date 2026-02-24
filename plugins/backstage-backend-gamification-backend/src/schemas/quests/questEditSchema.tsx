import { z } from 'zod';

export const questPatchSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    interval: z.number().int().positive().optional(),
    xp_reward: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine(
    data =>
      data.title !== undefined ||
      data.description !== undefined ||
      data.interval !== undefined ||
      data.xp_reward !== undefined,
    { message: 'No fields provided to update' },
  );

export type QuestPatchInput = z.infer<typeof questPatchSchema>;
