import { z } from 'zod';

export const webhookTitleSchema = z
  .string({ required_error: 'Title is required' })
  .trim()
  .min(1, 'Title is required');

export const webhookDescriptionSchema = z.string().trim();

export const webhookUrlSchema = z
  .string({ required_error: 'URL is required' })
  .trim()
  .url('URL must be a valid URL');

export const webhookEventSchema = z
  .string({ required_error: 'Event is required' })
  .trim()
  .min(1, 'Event is required');

export const webhookPayloadSchema = z.record(z.unknown());

export const webhookCreationSchema = z
  .object({
    title: webhookTitleSchema,
    description: webhookDescriptionSchema.default(''),
    url: webhookUrlSchema,
    event: webhookEventSchema,
    payload: webhookPayloadSchema.default({}),
  })
  .strict();

export type WebhookCreationInput = z.infer<typeof webhookCreationSchema>;
