import { z } from 'zod';
import {
  badgeCriteriaSchema,
  questSubjectTypeSchema,
} from './badgeCreationSchema';

export const badgeEditSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    subject_type: questSubjectTypeSchema.optional(),
    criterias: z.array(badgeCriteriaSchema).min(1).optional(),
  })
  .strict()
  .refine(
    value =>
      value.title !== undefined ||
      value.description !== undefined ||
      value.subject_type !== undefined ||
      value.criterias !== undefined,
    {
      message: 'At least one field must be provided',
    },
  );

export type BadgeEditInput = z.infer<typeof badgeEditSchema>;
