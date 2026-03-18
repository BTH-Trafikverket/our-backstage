import type { SortDescriptor } from '@backstage/ui';
import type {
  Badge,
  BadgeAudienceFilter,
  BadgeFilterState,
  BadgeFormData,
  BadgeSortField,
  BadgeSortOrder,
  BadgeSubjectType,
  BadgeTableRow,
  QuestLite,
} from './types';

export const createEmptyBadgeForm = (): BadgeFormData => ({
  title: '',
  description: '',
  xp_reward: '0',
  subject_type: 'user',
  criterias: [{ quest_id: '', target_count: '1' }],
});

export const createDefaultBadgeFilter = (): BadgeFilterState => ({
  audience: 'all',
  status: 'active',
  team: '',
});

export const createBadgeTableRow = (badge: Badge): BadgeTableRow => ({
  id: `${badge.id}:${badge.progressSubjectRef ?? 'definition'}`,
  badge,
});

export const getBadgeSubjectTypeLabel = (subjectType: BadgeSubjectType) =>
  subjectType === 'team' ? 'Team' : 'User';

export const getBadgeStatusLabel = (badge: Badge, isAdmin: boolean) => {
  if (isAdmin) {
    return badge.archived_at ? 'Archived' : 'Active';
  }

  if (badge.isEarned) {
    return badge.archived_at ? 'Earned, archived' : 'Earned';
  }

  return 'In progress';
};

export const formatBadgeDate = (value?: string | null) => {
  if (!value) {
    return 'Not earned yet';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Not earned yet';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

export const getBadgeSort = (
  descriptor: SortDescriptor | null,
): { sortBy: BadgeSortField; order: BadgeSortOrder } => {
  if (!descriptor) {
    return { sortBy: 'earned_at', order: 'desc' };
  }

  const column = String(descriptor.column);
  let sortBy: BadgeSortField = 'earned_at';

  if (
    column === 'title' ||
    column === 'xp_reward' ||
    column === 'created_at' ||
    column === 'earned_at'
  ) {
    sortBy = column;
  } else if (column === 'progress') {
    sortBy = 'progress_percent';
  }

  return {
    sortBy,
    order: descriptor.direction === 'ascending' ? 'asc' : 'desc',
  };
};

export const getCompatibleQuests = (
  quests: QuestLite[],
  subjectType: BadgeSubjectType,
) => quests.filter(quest => quest.subject_type === subjectType);

export const getQuestById = (quests: QuestLite[], questId: string) =>
  quests.find(q => q.id === questId);

export const getQuestTitle = (quests: QuestLite[], questId: string) =>
  getQuestById(quests, questId)?.title ?? questId;

export const buildBadgePayload = (form: BadgeFormData) => ({
  title: form.title.trim(),
  description: form.description.trim(),
  xp_reward: parseInt(form.xp_reward, 10),
  subject_type: form.subject_type,
  criterias: form.criterias.map(criteria => ({
    quest_id: criteria.quest_id,
    target_count: parseInt(criteria.target_count, 10),
  })),
});

export const validateBadgeForm = (
  form: BadgeFormData,
  quests: QuestLite[],
): string | null => {
  if (!form.title.trim()) return 'Title is required';
  if (!form.description.trim()) return 'Description is required';
  if (form.xp_reward.trim() === '') return 'XP reward is required';
  if (!form.criterias.length) return 'At least one criterion is required';

  const parsedXpReward = parseInt(form.xp_reward, 10);
  if (Number.isNaN(parsedXpReward) || parsedXpReward < 0) {
    return 'XP reward must be 0 or greater';
  }

  const selectedIds = form.criterias
    .map(criteria => criteria.quest_id)
    .filter(Boolean);
  if (new Set(selectedIds).size !== selectedIds.length) {
    return 'You have selected the same quest multiple times in the criteria';
  }

  for (let index = 0; index < form.criterias.length; index += 1) {
    const criteria = form.criterias[index];

    if (!criteria.quest_id) {
      return `Criterion ${index + 1}: Select a quest`;
    }

    const quest = getQuestById(quests, criteria.quest_id);
    if (!quest) {
      return `Criterion ${index + 1}: Selected quest could not be found`;
    }

    if (quest.subject_type !== form.subject_type) {
      return `Criterion ${index + 1}: ${getBadgeSubjectTypeLabel(
        form.subject_type,
      )} badges can only use ${getBadgeSubjectTypeLabel(
        form.subject_type,
      ).toLocaleLowerCase('en-US')} quests`;
    }

    const parsedCount = parseInt(criteria.target_count, 10);
    if (quest.completion_policy === 'ONE_TIME') {
      if (parsedCount !== 1) {
        return `Criterion ${index + 1}: One-time quests must have a count of 1`;
      }
    } else if (Number.isNaN(parsedCount) || parsedCount < 1) {
      return `Criterion ${index + 1}: Count must be at least 1`;
    }
  }

  return null;
};

export const getCriteriaSummaryText = (
  badge: Badge,
  quests: QuestLite[],
  isAdmin: boolean,
) => {
  const criterias = badge.criterias ?? [];
  if (!criterias.length) {
    return 'No criteria';
  }

  return criterias
    .map(criteria => {
      const questTitle =
        'quest_title' in criteria
          ? criteria.quest_title
          : getQuestTitle(quests, criteria.quest_id);
      if (!isAdmin && 'progress' in criteria) {
        return `${questTitle} ${criteria.progress.current}/${criteria.progress.target}`;
      }

      return `${questTitle} x${criteria.target_count}`;
    })
    .join(' • ');
};

export const getBadgeProgressText = (badge: Badge) => {
  if (!badge.progress) {
    return 'No progress yet';
  }

  return `${badge.progress.completedRequirements}/${badge.progress.totalRequirements} requirements`;
};

export async function readErrorMessage(response: Response): Promise<string> {
  const body = await response.text();

  if (!body) {
    return `Error: ${response.status} ${response.statusText}`;
  }

  try {
    const parsed = JSON.parse(body);
    return parsed.error?.message ?? parsed.message ?? body;
  } catch {
    return body;
  }
}
