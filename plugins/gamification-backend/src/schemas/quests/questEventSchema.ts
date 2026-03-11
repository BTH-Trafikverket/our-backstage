import { z } from 'zod';

const uuidV4Regex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const questEventSchema = z
  .object({
    questId: z.string().regex(uuidV4Regex, 'questId must be a valid UUID v4'),
    subjectRef: z.string().min(1).optional(),
    actor: z
      .object({
        entityRef: z.string().min(1).optional(),
        provider: z.string().min(1).optional(),
        id: z.string().min(1).optional(),
        login: z.string().min(1).optional(),
        email: z.string().email().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.subjectRef && !value.actor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either subjectRef or actor is required',
      });
      return;
    }

    if (value.actor) {
      const hasEntityRef = Boolean(value.actor.entityRef);
      const hasProvider = Boolean(value.actor.provider);
      const hasIdentifier = Boolean(
        value.actor.id || value.actor.login || value.actor.email,
      );

      if (!hasEntityRef && !(hasProvider && hasIdentifier)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'actor must include either { entityRef } or { provider + (id|login|email) }',
          path: ['actor'],
        });
      }
    }
  });

export type QuestEventRequest = z.infer<typeof questEventSchema>;
export type QuestEventActor = NonNullable<QuestEventRequest['actor']>;
