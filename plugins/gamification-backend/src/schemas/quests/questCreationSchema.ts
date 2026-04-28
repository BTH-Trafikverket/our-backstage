import { z } from 'zod';

export const COMPLETION_POLICIES = ['ONE_TIME', 'REPEATABLE'] as const;
export type CompletionPolicy = (typeof COMPLETION_POLICIES)[number];
export const QUEST_SUBJECT_TYPES = ['user', 'team'] as const;
export type QuestSubjectType = (typeof QUEST_SUBJECT_TYPES)[number];
export const QUEST_MODES = ['event_driven', 'catalog'] as const;
export type QuestMode = (typeof QUEST_MODES)[number];
export const CATALOG_CONDITIONS = [
  'missing_techdocs',
  'missing_owner',
  'missing_description',
  'missing_tags',
] as const;
export type CatalogCondition = (typeof CATALOG_CONDITIONS)[number];
export const CATALOG_RULE_VERSIONS = ['v1'] as const;
export type CatalogRuleVersion = (typeof CATALOG_RULE_VERSIONS)[number];
export const questSubjectTypeSchema = z.enum(QUEST_SUBJECT_TYPES);
const nonEmptyTrimmedString = z.string().trim().min(1);

const questReminderSchema = z
  .object({
    description: nonEmptyTrimmedString,
    day: z.number().int().positive(),
  })
  .strict();

const catalogRuleV1Schema = z
  .object({
    version: z.literal('v1'),
    check: z.discriminatedUnion('type', [
      z.object({
        type: z.literal('missing_techdocs'),
      }),
      z.object({
        type: z.literal('missing_owner'),
      }),
      z.object({
        type: z.literal('missing_description'),
      }),
      z.object({
        type: z.literal('missing_tags'),
      }),
      z.object({
        type: z.literal('missing_lifecycle'),
      }),
      z.object({
        type: z.literal('required_annotation'),
        annotation: nonEmptyTrimmedString,
      }),
      z.object({
        type: z.literal('missing_relation'),
        relationType: nonEmptyTrimmedString,
      }),
      z.object({
        type: z.literal('missing_dependency_metadata'),
        field: nonEmptyTrimmedString,
      }),
    ]),
  })
  .strict();

export const catalogRuleSchema = z.union([catalogRuleV1Schema]);
export type CatalogRule = z.infer<typeof catalogRuleSchema>;

export const linkedQuestConfigSchema = z
  .object({
    catalog_condition: z.enum(CATALOG_CONDITIONS).optional(),
    catalog_rule: catalogRuleSchema.optional(),
    reminder: questReminderSchema.optional(),
  })
  .strict()
  .optional();

export const questCreationSchema = z
  .object({
    title: nonEmptyTrimmedString,
    description: nonEmptyTrimmedString,
    target_count: z.number().int().positive().default(1),
    xp_reward: z.number().int().nonnegative(),
    subject_type: questSubjectTypeSchema.default('user'),
    completion_policy: z.enum(COMPLETION_POLICIES).default('REPEATABLE'),
    cooldown_days: z.number().int().positive().nullable().optional(),
    quest_mode: z.enum(QUEST_MODES).default('event_driven'),
    linked_config: linkedQuestConfigSchema,
  })
  .superRefine((data, ctx) => {
    if (
      data.quest_mode === 'catalog' &&
      !data.linked_config?.catalog_condition &&
      !data.linked_config?.catalog_rule
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'linked_config.catalog_condition or linked_config.catalog_rule is required for catalog quests',
        path: ['linked_config'],
      });
    }
  });

export type QuestCreationInput = z.infer<typeof questCreationSchema>;
