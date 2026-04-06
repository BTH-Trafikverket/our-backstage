import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION quest_progress_award_xp()
    RETURNS TRIGGER AS $$
    DECLARE
      v_target_count INTEGER;
      v_reward INTEGER;
    BEGIN
      IF NEW.completion_count IS NULL OR NEW.completion_count <= 0 THEN
        RETURN NEW;
      END IF;

      IF TG_OP = 'UPDATE' AND NEW.completion_count <= OLD.completion_count THEN
        RETURN NEW;
      END IF;

      SELECT target_count, xp_reward
        INTO v_target_count, v_reward
      FROM quests
      WHERE id = NEW.quest_id;

      IF v_target_count IS NULL OR v_reward IS NULL THEN
        RETURN NEW;
      END IF;

      IF v_target_count < 1 OR v_reward <= 0 THEN
        RETURN NEW;
      END IF;

      IF (NEW.completion_count % v_target_count) = 0 THEN
        WITH inserted_award AS (
          INSERT INTO xp_awards (
            id,
            subject_ref,
            quest_id,
            badge_id,
            awarded_on_completion_count,
            xp_amount,
            source
          )
          VALUES (
            gen_random_uuid(),
            NEW.subject_ref,
            NEW.quest_id,
            NULL,
            NEW.completion_count,
            v_reward,
            'quest_progress_trigger'
          )
          ON CONFLICT DO NOTHING
          RETURNING id, subject_ref, quest_id, awarded_on_completion_count, xp_amount, created_at
        )
        INSERT INTO domain_events (
          event_name,
          source_table,
          source_id,
          subject_ref,
          quest_id,
          badge_id,
          payload,
          occurred_at,
          available_at
        )
        SELECT
          'quest.completed',
          'xp_awards',
          inserted_award.id::text,
          inserted_award.subject_ref,
          inserted_award.quest_id,
          NULL,
          jsonb_build_object(
            'subject',
            jsonb_build_object(
              'ref', inserted_award.subject_ref,
              'type', q.subject_type,
              'kind', split_part(inserted_award.subject_ref, ':', 1),
              'namespace', split_part(split_part(inserted_award.subject_ref, ':', 2), '/', 1),
              'name', split_part(split_part(inserted_award.subject_ref, ':', 2), '/', 2),
              'displayName', split_part(split_part(inserted_award.subject_ref, ':', 2), '/', 2)
            ),
            'quest',
            jsonb_build_object(
              'id', q.id,
              'title', q.title,
              'description', q.description,
              'targetCount', q.target_count,
              'xpReward', q.xp_reward,
              'subjectType', q.subject_type,
              'completionPolicy', q.completion_policy,
              'cooldownDays', q.cooldown_days
            ),
            'completion',
            jsonb_build_object(
              'count', inserted_award.awarded_on_completion_count,
              'milestoneCount', FLOOR(inserted_award.awarded_on_completion_count::numeric / q.target_count)::int
            ),
            'xp',
            jsonb_build_object(
              'previousTotal',
              GREATEST(
                0,
                (
                  SELECT COALESCE(SUM(xa.xp_amount), 0)::int
                  FROM xp_awards xa
                  WHERE xa.subject_ref = inserted_award.subject_ref
                ) - inserted_award.xp_amount
              ),
              'total',
              (
                SELECT COALESCE(SUM(xa.xp_amount), 0)::int
                FROM xp_awards xa
                WHERE xa.subject_ref = inserted_award.subject_ref
              ),
              'gained', inserted_award.xp_amount
            ),
            'subject_ref', inserted_award.subject_ref,
            'subject_type', q.subject_type,
            'subject_kind', split_part(inserted_award.subject_ref, ':', 1),
            'subject_namespace', split_part(split_part(inserted_award.subject_ref, ':', 2), '/', 1),
            'subject_name', split_part(split_part(inserted_award.subject_ref, ':', 2), '/', 2),
            'subject_display_name', split_part(split_part(inserted_award.subject_ref, ':', 2), '/', 2),
            'username',
            CASE
              WHEN q.subject_type = 'user' THEN split_part(split_part(inserted_award.subject_ref, ':', 2), '/', 2)
              ELSE NULL
            END,
            'quest_id', q.id,
            'quest_title', q.title,
            'quest_description', q.description,
            'quest_target_count', q.target_count,
            'quest_subject_type', q.subject_type,
            'completion_count', inserted_award.awarded_on_completion_count,
            'completed_milestone', FLOOR(inserted_award.awarded_on_completion_count::numeric / q.target_count)::int,
            'xp_reward', inserted_award.xp_amount,
            'previous_total_xp',
            GREATEST(
              0,
              (
                SELECT COALESCE(SUM(xa.xp_amount), 0)::int
                FROM xp_awards xa
                WHERE xa.subject_ref = inserted_award.subject_ref
              ) - inserted_award.xp_amount
            ),
            'total_xp',
            (
              SELECT COALESCE(SUM(xa.xp_amount), 0)::int
              FROM xp_awards xa
              WHERE xa.subject_ref = inserted_award.subject_ref
            ),
            'xp_gained', inserted_award.xp_amount
          ),
          inserted_award.created_at,
          inserted_award.created_at
        FROM inserted_award
        JOIN quests q
          ON q.id = inserted_award.quest_id
        ON CONFLICT DO NOTHING;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION enqueue_badge_earned_domain_event()
    RETURNS TRIGGER AS $$
    DECLARE
      v_badge RECORD;
      v_total_xp INTEGER;
      v_triggering_quest RECORD;
      v_subject_kind TEXT;
      v_subject_namespace TEXT;
      v_subject_name TEXT;
    BEGIN
      SELECT
        b.id,
        b.title,
        b.description,
        b.xp_reward,
        b.subject_type
      INTO v_badge
      FROM badges b
      WHERE b.id = NEW.badge_id;

      IF v_badge.id IS NULL THEN
        RETURN NEW;
      END IF;

      v_subject_kind := split_part(NEW.subject_ref, ':', 1);
      v_subject_namespace := split_part(split_part(NEW.subject_ref, ':', 2), '/', 1);
      v_subject_name := split_part(split_part(NEW.subject_ref, ':', 2), '/', 2);

      SELECT COALESCE(SUM(xa.xp_amount), 0)::int
      INTO v_total_xp
      FROM xp_awards xa
      WHERE xa.subject_ref = NEW.subject_ref;

      SELECT
        q.id,
        q.title,
        q.description,
        q.target_count,
        q.subject_type
      INTO v_triggering_quest
      FROM badge_criteria_completion bcc
      JOIN quests q
        ON q.id = bcc.quest_id
      WHERE bcc.subject_ref = NEW.subject_ref
        AND bcc.badge_id = NEW.badge_id
        AND bcc.completed_at = NEW.earned_at
      ORDER BY q.id ASC
      LIMIT 1;

      INSERT INTO domain_events (
        event_name,
        source_table,
        source_id,
        subject_ref,
        quest_id,
        badge_id,
        payload,
        occurred_at,
        available_at
      )
      VALUES (
        'badge.earned',
        'earned_badges',
        NEW.subject_ref || ':' || NEW.badge_id::text,
        NEW.subject_ref,
        v_triggering_quest.id,
        NEW.badge_id,
        jsonb_build_object(
          'subject',
          jsonb_build_object(
            'ref', NEW.subject_ref,
            'type', v_badge.subject_type,
            'kind', v_subject_kind,
            'namespace', v_subject_namespace,
            'name', v_subject_name,
            'displayName', v_subject_name
          ),
          'badge',
          jsonb_build_object(
            'id', v_badge.id,
            'title', v_badge.title,
            'description', v_badge.description,
            'xpReward', v_badge.xp_reward,
            'subjectType', v_badge.subject_type,
            'earnedAt', NEW.earned_at
          ),
          'quest',
          CASE
            WHEN v_triggering_quest.id IS NULL THEN NULL
            ELSE jsonb_build_object(
              'id', v_triggering_quest.id,
              'title', v_triggering_quest.title,
              'description', v_triggering_quest.description,
              'targetCount', v_triggering_quest.target_count,
              'subjectType', v_triggering_quest.subject_type
            )
          END,
          'xp',
          jsonb_build_object(
            'previousTotal', GREATEST(0, v_total_xp - v_badge.xp_reward),
            'total', v_total_xp,
            'gained', v_badge.xp_reward
          ),
          'subject_ref', NEW.subject_ref,
          'subject_type', v_badge.subject_type,
          'subject_kind', v_subject_kind,
          'subject_namespace', v_subject_namespace,
          'subject_name', v_subject_name,
          'subject_display_name', v_subject_name,
          'username',
          CASE
            WHEN v_badge.subject_type = 'user' THEN v_subject_name
            ELSE NULL
          END,
          'quest_id', v_triggering_quest.id,
          'quest_title', v_triggering_quest.title,
          'quest_description', v_triggering_quest.description,
          'completion_count', NULL,
          'badge_id', v_badge.id,
          'badge_title', v_badge.title,
          'badge_description', v_badge.description,
          'badge_xp_reward', v_badge.xp_reward,
          'earned_at', NEW.earned_at,
          'xp_reward', v_badge.xp_reward,
          'previous_total_xp', GREATEST(0, v_total_xp - v_badge.xp_reward),
          'total_xp', v_total_xp,
          'xp_gained', v_badge.xp_reward
        ),
        NEW.earned_at,
        NEW.earned_at
      )
      ON CONFLICT DO NOTHING;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE TRIGGER trg_earned_badges_enqueue_domain_event
    AFTER INSERT ON earned_badges
    FOR EACH ROW
    EXECUTE FUNCTION enqueue_badge_earned_domain_event();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP TRIGGER IF EXISTS trg_earned_badges_enqueue_domain_event
    ON earned_badges;
  `);
  await knex.raw(`DROP FUNCTION IF EXISTS enqueue_badge_earned_domain_event;`);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION quest_progress_award_xp()
    RETURNS TRIGGER AS $$
    DECLARE
      v_target_count INTEGER;
      v_reward INTEGER;
    BEGIN
      IF NEW.completion_count IS NULL OR NEW.completion_count <= 0 THEN
        RETURN NEW;
      END IF;

      IF TG_OP = 'UPDATE' AND NEW.completion_count <= OLD.completion_count THEN
        RETURN NEW;
      END IF;

      SELECT target_count, xp_reward
        INTO v_target_count, v_reward
      FROM quests
      WHERE id = NEW.quest_id;

      IF v_target_count IS NULL OR v_reward IS NULL THEN
        RETURN NEW;
      END IF;

      IF v_target_count < 1 OR v_reward <= 0 THEN
        RETURN NEW;
      END IF;

      IF (NEW.completion_count % v_target_count) = 0 THEN
        INSERT INTO xp_awards (
          id,
          subject_ref,
          quest_id,
          badge_id,
          awarded_on_completion_count,
          xp_amount,
          source
        )
        VALUES (
          gen_random_uuid(),
          NEW.subject_ref,
          NEW.quest_id,
          NULL,
          NEW.completion_count,
          v_reward,
          'quest_progress_trigger'
        )
        ON CONFLICT DO NOTHING;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
}
