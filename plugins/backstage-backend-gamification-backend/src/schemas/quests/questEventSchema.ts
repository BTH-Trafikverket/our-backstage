import { z } from 'zod';

export const questEventActorSchema = z
  .object({
    entityRef: z.string().min(1).optional(),
    provider: z.string().min(1).optional(),
    id: z.string().min(1).optional(),
    login: z.string().min(1).optional(),
    email: z.string().email().optional(),
  })
  .strict()
  .superRefine((actor, ctx) => {
    const hasEntityRef = Boolean(actor.entityRef);
    const hasProvider = Boolean(actor.provider);
    const hasIdentifier = Boolean(actor.id || actor.login || actor.email);

    if (!hasEntityRef && !(hasProvider && hasIdentifier)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'actor must include either { entityRef } or { provider + (id|login|email) }',
      });
    }
  });

export const questEventSchema = z
  .object({
    eventKey: z.string().min(1),
    eventId: z.string().min(1),
    actor: questEventActorSchema,
  })
  .strict();

export type QuestEventRequest = z.infer<typeof questEventSchema>;
export type QuestEventActor = z.infer<typeof questEventActorSchema>;
