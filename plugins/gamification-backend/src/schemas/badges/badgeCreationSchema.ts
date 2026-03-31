import { z } from 'zod';
import { questSubjectTypeSchema } from '../quests/questCreationSchema';

export { questSubjectTypeSchema };

export const badgeCriteriaSchema = z
  .object({
    quest_id: z.string().trim().min(1),
    target_count: z.number().int().min(1),
  })
  .strict();

const validateUniqueQuestCriteria = (
  criterias: Array<{ quest_id: string; target_count: number }>,
  ctx: z.RefinementCtx,
) => {
  const seenQuestIds = new Set<string>();

  criterias.forEach((criteria, index) => {
    const normalizedQuestId = criteria.quest_id.toLocaleLowerCase('en-US');
    if (seenQuestIds.has(normalizedQuestId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Each quest can only appear once in badge criteria',
        path: ['criterias', index, 'quest_id'],
      });
      return;
    }

    seenQuestIds.add(normalizedQuestId);
  });
};

export const badgeCreationSchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
    xp_reward: z.number().int().min(0),
    subject_type: questSubjectTypeSchema,
    image_id: z.number().int().positive().nullable().optional(),
    criterias: z.array(badgeCriteriaSchema).min(1),
  })
  .strict()
  .superRefine((value, ctx) =>
    validateUniqueQuestCriteria(value.criterias, ctx),
  );

export type BadgeCreationInput = z.infer<typeof badgeCreationSchema>;
export type BadgeCriteriaInput = z.infer<typeof badgeCriteriaSchema>;
