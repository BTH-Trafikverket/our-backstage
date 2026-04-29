import type { Seed } from '../src/seeds/types';

export const seed005ReminderDemo: Seed = {
  id: '005_reminder_demo',
  description: 'Seed quest activity receipts for reminder demos',
  async run({ knex }) {
    const mergeQuest = await knex('quests')
      .select(['id', 'title'])
      .where({ title: 'Merge a PR' })
      .first();

    if (!mergeQuest) {
      throw new Error("Missing quest 'Merge a PR' required for reminder demo");
    }

    const reminderSubjects = [
      'user:default/linusandersson02',
      'user:default/hahh24',
      'user:default/skz911',
    ];

    await knex('quest_event_receipts')
      .insert(
        reminderSubjects.map(subjectRef => ({
          event_id: `seed:reminder-demo:merge-pr:${subjectRef}`,
          event_key: `quest:${mergeQuest.id}`,
          subject_ref: subjectRef,
          caller_subject: 'seed',
        })),
      )
      .onConflict('event_id')
      .ignore();
  },
};
