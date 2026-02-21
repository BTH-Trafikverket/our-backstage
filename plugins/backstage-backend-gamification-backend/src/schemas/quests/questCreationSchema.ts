import { z } from 'zod';

export const questCreationSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  interval: z.number().int().positive(),
  xp_reward: z.number().int().positive(),
  entityRef: z.string().optional(),
});

export type QuestCreationInput = z.infer<typeof questCreationSchema>;
