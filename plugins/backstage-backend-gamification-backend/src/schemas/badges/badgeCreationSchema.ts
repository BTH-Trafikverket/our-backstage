import { z } from 'zod';

export const badgeCreationSchema = z.object({
  title: z.string(),
  entityRef: z.string().optional(),
});

export type BadgeCreationInput = z.infer<typeof badgeCreationSchema>;
