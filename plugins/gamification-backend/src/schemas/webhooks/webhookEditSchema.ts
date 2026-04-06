import { z } from 'zod';
import {
  webhookDescriptionSchema,
  webhookEventSchema,
  webhookPayloadSchema,
  webhookTitleSchema,
  webhookUrlSchema,
} from './webhookCreationSchema';

export const webhookEditSchema = z
  .object({
    title: webhookTitleSchema.optional(),
    description: webhookDescriptionSchema.optional(),
    url: webhookUrlSchema.optional(),
    event: webhookEventSchema.optional(),
    payload: webhookPayloadSchema.optional(),
  })
  .strict()
  .refine(
    value =>
      value.title !== undefined ||
      value.description !== undefined ||
      value.url !== undefined ||
      value.event !== undefined ||
      value.payload !== undefined,
    {
      message: 'No fields provided to update',
    },
  );

export type WebhookEditInput = z.infer<typeof webhookEditSchema>;
