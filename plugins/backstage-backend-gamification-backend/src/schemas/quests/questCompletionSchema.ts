import { z } from 'zod';

export const questCompletionSchema = z
  .object({
    quest_id: z.string().uuid(),
    user_ref: z.string().min(1),
  })
  .strict();

export type QuestCompletionInput = z.infer<typeof questCompletionSchema>;
