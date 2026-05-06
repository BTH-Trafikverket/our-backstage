# Reminders

Reminders surface stale or incomplete gamification activity to users. There are two sources:

- Event-driven reminders configured on a quest definition.
- Activity reminders configured under `gamification.reminders.rules`.

## Why This Exists

The reminder work was scoped around inactivity in the gamification data that already exists. The project did not add a new GitHub activity ingestion system; it uses quest event history and quest configuration as the source of reminder eligibility.

## User Routes

Source:

- [reminderRouter.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/reminderRouter.ts)
- [ReminderService](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/reminderService.ts)
- [ReminderRepository](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/repositories/reminderRepository.ts)

Routes:

- `GET /reminders` lists reminders visible to the authenticated user and their ownership groups.
- `POST /reminders/{id}/dismiss` dismisses a reminder for the current viewer.
- `POST /reminders/{id}/disable` disables a reminder for the current viewer.

All reminder routes are user-only. A user can modify reminders only for their own user ref or ownership group refs.

## Tables

Source:

- [023_create_quest_reminders.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/migrations/023_create_quest_reminders.ts)
- [025_create_quest_reminder_notification_deliveries.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/migrations/025_create_quest_reminder_notification_deliveries.ts)

Tables:

- `quest_reminders` stores reminder records and target subjects.
- `quest_reminder_viewer_state` stores viewer-level dismissed/disabled state.
- `quest_reminder_notification_deliveries` prevents duplicate reminder notifications per delivery window.

Reminder identity is based on quest, target subject, and rule key.

## Event-Driven Quest Reminders

Source:

- [QuestsService reminder sync](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/questsService.ts)
- [questCreationSchema.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/schemas/quests/questCreationSchema.ts)

Quest `linked_config.reminder` accepts:

- `description`
- `day`

When a quest is created or edited, the backend:

- Disables existing event-driven reminders for that quest.
- Lists the quest audience from the catalog.
- Creates or refreshes reminders for each target subject when the reminder config is valid.

When a quest event is handled, the backend also creates or refreshes an event-driven reminder for the subject that made progress.

## Activity Rule Evaluation

Source:

- [ReminderEvaluationService](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/reminderEvaluationService.ts)
- [ReminderEvaluationWorker](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/reminderEvaluationWorker.ts)
- [plugin.ts reminder setup](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/plugin.ts)

Config rules live under `gamification.reminders.rules`.

Each rule can target a quest by `questId` or `questTitle` and defines:

- `key`
- `inactivityDays`
- `activityDescription`
- `activitySource`

Current activity evaluation supports `quest_event_receipts`. Unsupported sources are skipped. Activity reminders currently support user-scoped quests only.

Evaluation behavior:

- Finds subjects with quest activity.
- Uses latest quest activity as the inactivity baseline.
- For repeatable cooldown quests, waits until `cooldown_days + inactivityDays` after the latest XP award.
- Suppresses reminders that are globally disabled, viewer-disabled, or dismissed during the same activity cycle.
- Resets dismissed viewer state when a newer activity cycle starts.

For quests with cooldowns, reminder eligibility waits for both the cooldown and the inactivity window. A quest with `cooldown_days: 7` and a reminder rule with `inactivityDays: 7` becomes eligible after 14 full days from the latest relevant activity or award boundary.

## Notifications

Source:

- [ReminderNotificationService](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/reminderNotificationService.ts)
- [ReminderEvaluationService notification reservation](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/services/reminderEvaluationService.ts)

Notification delivery is optional and idempotent:

- A delivery row is reserved before sending.
- Successful delivery marks the row sent.
- Failed delivery releases the reservation so a later evaluation can retry.
- Forced evaluations use a unique delivery window key.

The current duplicate-notification protection is the persisted delivery-window ledger. There is no global singleton lease for the in-process reminder worker in the current implementation, so docs should describe the delivered idempotency boundary rather than a worker lease that does not exist.

## Development Support

Source:

- [005_reminder_demo.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/seeds/005_reminder_demo.ts)
- [TestPage.tsx](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification/src/components/TestPage/TestPage.tsx)
- [questsRouter.ts test route](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification-backend/src/routes/questsRouter.ts)

Local reminder demos use seed data and a non-production force action:

- The seed writes old quest event receipts for reminder demo subjects.
- The test page exposes `Force reminders`.
- The backend route is only registered outside production and still requires admin credentials.
