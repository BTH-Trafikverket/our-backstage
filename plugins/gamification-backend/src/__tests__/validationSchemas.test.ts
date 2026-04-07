import { badgeCreationSchema } from '../schemas/badges/badgeCreationSchema';
import { badgeEditSchema } from '../schemas/badges/badgeEditSchema';
import { questCreationSchema } from '../schemas/quests/questCreationSchema';
import { questEditSchema } from '../schemas/quests/questEditSchema';
import { questEventSchema } from '../schemas/quests/questEventSchema';
import { webhookCreationSchema } from '../schemas/webhooks/webhookCreationSchema';
import { webhookEventMetadataParamsSchema } from '../schemas/webhooks/webhookEventMetadataSchema';

describe('validation schemas', () => {
  describe('questCreationSchema', () => {
    it('applies defaults for optional quest fields', () => {
      expect(
        questCreationSchema.parse({
          title: 'Review pull request',
          description: 'Review and approve a pull request',
          xp_reward: 25,
        }),
      ).toEqual({
        title: 'Review pull request',
        description: 'Review and approve a pull request',
        target_count: 1,
        xp_reward: 25,
        subject_type: 'user',
        completion_policy: 'REPEATABLE',
      });
    });

    it('rejects whitespace-only title and description', () => {
      const result = questCreationSchema.safeParse({
        title: '   ',
        description: '   ',
        xp_reward: 25,
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues.map(issue => issue.path)).toEqual([
        ['title'],
        ['description'],
      ]);
    });
  });

  describe('questEditSchema', () => {
    it('rejects empty patch payloads', () => {
      const result = questEditSchema.safeParse({});

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(
        'No fields provided to update',
      );
    });

    it('accepts nullable cooldown_days when another field is present', () => {
      expect(
        questEditSchema.parse({
          completion_policy: 'REPEATABLE',
          cooldown_days: null,
        }),
      ).toEqual({
        completion_policy: 'REPEATABLE',
        cooldown_days: null,
      });
    });

    it('rejects whitespace-only title and description updates', () => {
      const result = questEditSchema.safeParse({
        title: '   ',
        description: '   ',
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues.map(issue => issue.path)).toEqual([
        ['title'],
        ['description'],
      ]);
    });
  });

  describe('questEventSchema', () => {
    it('accepts subjectRef-only requests', () => {
      expect(
        questEventSchema.parse({
          eventId: 'evt-1',
          questId: '0f8fad5b-d9cb-469f-a165-70867728950e',
          subjectRef: 'user:default/alice',
        }),
      ).toEqual({
        eventId: 'evt-1',
        questId: '0f8fad5b-d9cb-469f-a165-70867728950e',
        subjectRef: 'user:default/alice',
      });
    });

    it('accepts actor requests with provider and login', () => {
      expect(
        questEventSchema.parse({
          eventId: 'evt-2',
          questId: '0f8fad5b-d9cb-469f-a165-70867728950e',
          actor: {
            provider: 'github',
            login: 'alice',
          },
        }),
      ).toEqual({
        eventId: 'evt-2',
        questId: '0f8fad5b-d9cb-469f-a165-70867728950e',
        actor: {
          provider: 'github',
          login: 'alice',
        },
      });
    });

    it('rejects requests without subjectRef or actor', () => {
      const result = questEventSchema.safeParse({
        eventId: 'evt-3',
        questId: '0f8fad5b-d9cb-469f-a165-70867728950e',
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(
        'Either subjectRef or actor is required',
      );
    });

    it('rejects actor payloads without entityRef or provider plus identifier', () => {
      const result = questEventSchema.safeParse({
        eventId: 'evt-4',
        questId: '0f8fad5b-d9cb-469f-a165-70867728950e',
        actor: {
          provider: 'github',
        },
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(
        'actor must include either { entityRef } or { provider + (id|login|email) }',
      );
      expect(result.error?.issues[0]?.path).toEqual(['actor']);
    });

    it('rejects non-v4 quest ids', () => {
      const result = questEventSchema.safeParse({
        eventId: 'evt-5',
        questId: '00000000-0000-0000-0000-000000000000',
        subjectRef: 'user:default/alice',
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(
        'questId must be a valid UUID v4',
      );
    });

    it('rejects requests without an eventId', () => {
      const result = questEventSchema.safeParse({
        questId: '0f8fad5b-d9cb-469f-a165-70867728950e',
        subjectRef: 'user:default/alice',
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe('eventId is required');
    });
  });

  describe('badgeCreationSchema', () => {
    it('accepts badges with unique criteria quests', () => {
      expect(
        badgeCreationSchema.parse({
          title: 'Contributor',
          description: 'Awarded for contributing',
          xp_reward: 150,
          subject_type: 'user',
          criterias: [
            { quest_id: 'quest-a', target_count: 1 },
            { quest_id: 'quest-b', target_count: 2 },
          ],
        }),
      ).toEqual({
        title: 'Contributor',
        description: 'Awarded for contributing',
        xp_reward: 150,
        subject_type: 'user',
        criterias: [
          { quest_id: 'quest-a', target_count: 1 },
          { quest_id: 'quest-b', target_count: 2 },
        ],
      });
    });

    it('rejects duplicate criteria quests case-insensitively', () => {
      const result = badgeCreationSchema.safeParse({
        title: 'Contributor',
        description: 'Awarded for contributing',
        xp_reward: 150,
        subject_type: 'user',
        criterias: [
          { quest_id: 'Quest-A', target_count: 1 },
          { quest_id: 'quest-a', target_count: 2 },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(
        'Each quest can only appear once in badge criteria',
      );
      expect(result.error?.issues[0]?.path).toEqual([
        'criterias',
        1,
        'quest_id',
      ]);
    });
  });

  describe('badgeEditSchema', () => {
    it('rejects empty badge edit payloads', () => {
      const result = badgeEditSchema.safeParse({});

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(
        'At least one field must be provided',
      );
    });

    it('accepts partial badge edits', () => {
      expect(
        badgeEditSchema.parse({
          description: 'Updated description',
        }),
      ).toEqual({
        description: 'Updated description',
      });
    });
  });

  describe('webhookCreationSchema', () => {
    it('applies defaults for optional webhook fields', () => {
      expect(
        webhookCreationSchema.parse({
          title: 'Production Webhook',
          url: 'https://example.com/webhooks/gamification',
          event: 'quest.completed',
        }),
      ).toEqual({
        title: 'Production Webhook',
        description: '',
        url: 'https://example.com/webhooks/gamification',
        event: 'quest.completed',
        payload: {},
      });
    });

    it('rejects whitespace-only titles and invalid URLs', () => {
      const result = webhookCreationSchema.safeParse({
        title: '   ',
        url: 'not-a-url',
        event: 'quest.completed',
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues.map(issue => issue.path)).toEqual([
        ['title'],
        ['url'],
      ]);
    });
  });

  describe('webhookEventMetadataParamsSchema', () => {
    it('accepts known-looking webhook event path params', () => {
      expect(
        webhookEventMetadataParamsSchema.parse({
          event: 'quest.completed',
        }),
      ).toEqual({
        event: 'quest.completed',
      });
    });

    it('rejects whitespace-only event params', () => {
      const result = webhookEventMetadataParamsSchema.safeParse({
        event: '   ',
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues.map(issue => issue.path)).toEqual([
        ['event'],
      ]);
    });
  });
});
