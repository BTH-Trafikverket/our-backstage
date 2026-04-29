import type { Knex } from 'knex';
import type { QuestSubjectType } from '../schemas/quests/questCreationSchema';

export type ReminderStatus = 'active' | 'disabled';
export type ReminderViewerStoredState = 'dismissed' | 'disabled';
export type ReminderViewerState = ReminderViewerStoredState | 'active';
export type ReminderReasonPayload = Record<string, unknown>;
export type ReminderNotificationDeliveryStatus = 'sending' | 'sent';

export type ReminderRow = {
  id: string;
  quest_id: string;
  target_subject_ref: string;
  target_subject_type: QuestSubjectType;
  rule_key: string;
  rule_kind: string;
  reason_payload: ReminderReasonPayload;
  status: ReminderStatus;
  created_at: Date;
  updated_at: Date;
  last_generated_at: Date;
};

export type ReminderViewerStateRow = {
  reminder_id: string;
  viewer_subject_ref: string;
  state: ReminderViewerStoredState;
  created_at: Date;
  updated_at: Date;
};

export type ReminderWithViewerStateRow = ReminderRow & {
  quest_title: string;
  viewer_state: ReminderViewerState;
};

export type ReminderNotificationDeliveryRow = {
  id: string;
  reminder_id: string;
  delivery_window_key: string;
  status: ReminderNotificationDeliveryStatus;
  sent_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export class ReminderRepository {
  private readonly db: Knex | Knex.Transaction;

  constructor(db: Knex | Knex.Transaction) {
    this.db = db;
  }

  async withTransaction<T>(
    fn: (repo: ReminderRepository) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async trx => fn(new ReminderRepository(trx)));
  }

  private toJsonb(value: ReminderReasonPayload | undefined) {
    return this.db.raw('?::jsonb', [JSON.stringify(value ?? {})]);
  }

  async createOrRefreshReminder(params: {
    questId: string;
    targetSubjectRef: string;
    targetSubjectType: QuestSubjectType;
    ruleKey: string;
    ruleKind: string;
    reasonPayload?: ReminderReasonPayload;
    status?: ReminderStatus;
    lastGeneratedAt?: Date;
  }): Promise<ReminderRow> {
    const status = params.status ?? 'active';
    const reasonPayload = this.toJsonb(params.reasonPayload);
    const lastGeneratedAt = params.lastGeneratedAt ?? this.db.fn.now();

    const rows = await this.db<ReminderRow>('quest_reminders')
      .insert({
        quest_id: params.questId,
        target_subject_ref: params.targetSubjectRef,
        target_subject_type: params.targetSubjectType,
        rule_key: params.ruleKey,
        rule_kind: params.ruleKind,
        reason_payload: reasonPayload,
        status,
        last_generated_at: lastGeneratedAt,
      })
      .onConflict(['quest_id', 'target_subject_ref', 'rule_key'])
      .merge({
        target_subject_type: params.targetSubjectType,
        rule_kind: params.ruleKind,
        reason_payload: reasonPayload,
        status,
        last_generated_at: lastGeneratedAt,
      })
      .returning('*');

    return rows[0];
  }

  async getReminderById(id: string): Promise<ReminderRow | undefined> {
    return this.db<ReminderRow>('quest_reminders').where({ id }).first();
  }

  async getReminderByIdentity(
    questId: string,
    targetSubjectRef: string,
    ruleKey: string,
  ): Promise<ReminderRow | undefined> {
    return this.db<ReminderRow>('quest_reminders')
      .where({
        quest_id: questId,
        target_subject_ref: targetSubjectRef,
        rule_key: ruleKey,
      })
      .first();
  }

  async getViewerState(
    reminderId: string,
    viewerSubjectRef: string,
  ): Promise<ReminderViewerStoredState | undefined> {
    const row = await this.db<ReminderViewerStateRow>(
      'quest_reminder_viewer_state',
    )
      .where({
        reminder_id: reminderId,
        viewer_subject_ref: viewerSubjectRef,
      })
      .first();

    return row?.state;
  }

  async updateReminderStatus(
    id: string,
    status: ReminderStatus,
  ): Promise<ReminderRow | undefined> {
    const rows = await this.db<ReminderRow>('quest_reminders')
      .where({ id })
      .update({ status })
      .returning('*');

    return rows[0];
  }

  async updateReminderStatusForQuest(params: {
    questId: string;
    status: ReminderStatus;
    ruleKind?: string;
  }): Promise<number> {
    const query = this.db<ReminderRow>('quest_reminders')
      .where({ quest_id: params.questId })
      .update({ status: params.status });

    if (params.ruleKind) {
      query.andWhere({ rule_kind: params.ruleKind });
    }

    return query;
  }

  async listVisibleRemindersForViewer(params: {
    viewerSubjectRef: string;
    teamRefs: string[];
    includeHidden?: boolean;
  }): Promise<ReminderWithViewerStateRow[]> {
    const viewerSubjectRef = params.viewerSubjectRef.trim();
    const db = this.db;
    const teamRefs = [
      ...new Set(params.teamRefs.map(ref => ref.trim()).filter(Boolean)),
    ];

    let query = this.db('quest_reminders as reminders')
      .join('quests', 'quests.id', 'reminders.quest_id')
      .leftJoin(
        'quest_reminder_viewer_state as viewer_state',
        function joinViewerState() {
          this.on('viewer_state.reminder_id', '=', 'reminders.id').andOn(
            db.raw('viewer_state.viewer_subject_ref = ?', [viewerSubjectRef]),
          );
        },
      )
      .select(
        'reminders.id',
        'reminders.quest_id',
        'quests.title as quest_title',
        'reminders.target_subject_ref',
        'reminders.target_subject_type',
        'reminders.rule_key',
        'reminders.rule_kind',
        'reminders.reason_payload',
        'reminders.status',
        'reminders.created_at',
        'reminders.updated_at',
        'reminders.last_generated_at',
        this.db.raw("COALESCE(viewer_state.state, 'active') as viewer_state"),
      )
      .where('reminders.status', 'active')
      .whereNull('quests.archived_at')
      .andWhere(scope => {
        scope.where(userScope => {
          userScope
            .where('reminders.target_subject_type', 'user')
            .andWhere('reminders.target_subject_ref', viewerSubjectRef);
        });

        if (teamRefs.length > 0) {
          scope.orWhere(teamScope => {
            teamScope
              .where('reminders.target_subject_type', 'team')
              .whereIn('reminders.target_subject_ref', teamRefs);
          });
        }
      })
      .orderBy([
        { column: 'reminders.last_generated_at', order: 'desc' },
        { column: 'reminders.created_at', order: 'desc' },
        { column: 'reminders.id', order: 'desc' },
      ]);

    if (!params.includeHidden) {
      query = query.whereNull('viewer_state.state');
    }

    const rows = await query;

    return rows.map(row => ({
      ...(row as ReminderWithViewerStateRow),
      viewer_state:
        (row as ReminderWithViewerStateRow).viewer_state ?? 'active',
    }));
  }

  async dismissReminderForViewer(
    reminderId: string,
    viewerSubjectRef: string,
  ): Promise<ReminderViewerStateRow> {
    const rows = await this.db<ReminderViewerStateRow>(
      'quest_reminder_viewer_state',
    )
      .insert({
        reminder_id: reminderId,
        viewer_subject_ref: viewerSubjectRef,
        state: 'dismissed',
      })
      .onConflict(['reminder_id', 'viewer_subject_ref'])
      .merge({
        state: this.db.raw(
          `CASE
             WHEN quest_reminder_viewer_state.state = 'disabled' THEN quest_reminder_viewer_state.state
             ELSE EXCLUDED.state
           END`,
        ),
      })
      .returning('*');

    return rows[0];
  }

  async disableReminderForViewer(
    reminderId: string,
    viewerSubjectRef: string,
  ): Promise<ReminderViewerStateRow> {
    const rows = await this.db<ReminderViewerStateRow>(
      'quest_reminder_viewer_state',
    )
      .insert({
        reminder_id: reminderId,
        viewer_subject_ref: viewerSubjectRef,
        state: 'disabled',
      })
      .onConflict(['reminder_id', 'viewer_subject_ref'])
      .merge({
        state: 'disabled',
      })
      .returning('*');

    return rows[0];
  }

  async tryReserveNotificationDelivery(params: {
    reminderId: string;
    deliveryWindowKey: string;
  }): Promise<boolean> {
    try {
      await this.db<ReminderNotificationDeliveryRow>(
        'quest_reminder_notification_deliveries',
      ).insert({
        reminder_id: params.reminderId,
        delivery_window_key: params.deliveryWindowKey,
        status: 'sending',
      });
      return true;
    } catch (error: any) {
      if (error?.code === '23505') {
        return false;
      }
      throw error;
    }
  }

  async markNotificationDeliverySent(params: {
    reminderId: string;
    deliveryWindowKey: string;
    sentAt?: Date;
  }): Promise<void> {
    await this.db<ReminderNotificationDeliveryRow>(
      'quest_reminder_notification_deliveries',
    )
      .where({
        reminder_id: params.reminderId,
        delivery_window_key: params.deliveryWindowKey,
      })
      .update({
        status: 'sent',
        sent_at: params.sentAt ?? this.db.fn.now(),
      });
  }

  async releaseNotificationDelivery(params: {
    reminderId: string;
    deliveryWindowKey: string;
  }): Promise<void> {
    await this.db<ReminderNotificationDeliveryRow>(
      'quest_reminder_notification_deliveries',
    )
      .where({
        reminder_id: params.reminderId,
        delivery_window_key: params.deliveryWindowKey,
      })
      .del();
  }
}
