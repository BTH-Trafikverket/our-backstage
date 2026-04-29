import { z } from 'zod';

export const WEBHOOK_EVENT_NAMES = [
  'quest.completed',
  'badge.earned',
  'daily',
  'weekly',
  'monthly',
] as const;

export const webhookTitleSchema = z
  .string({ required_error: 'Title is required' })
  .trim()
  .min(1, 'Title is required');

export const webhookDescriptionSchema = z.string().trim();

export const webhookUrlSchema = z
  .string({ required_error: 'URL is required' })
  .trim()
  .url('URL must be a valid URL');

export const webhookEventSchema = z.enum(WEBHOOK_EVENT_NAMES, {
  required_error: 'Event is required',
  invalid_type_error: 'Event is required',
});

export const webhookPayloadSchema = z.record(z.unknown());

export const webhookCreationSchema = z
  .object({
    title: webhookTitleSchema,
    description: webhookDescriptionSchema.default(''),
    url: webhookUrlSchema,
    event: webhookEventSchema,
    payload: webhookPayloadSchema.default({}),
    skipEndpointHealthCheck: z.boolean().optional(),
  })
  .strict();

export type WebhookCreationInput = z.infer<typeof webhookCreationSchema>;
