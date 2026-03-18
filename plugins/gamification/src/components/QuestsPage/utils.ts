import type { SortDescriptor } from '@backstage/ui';
import type {
  Quest,
  QuestAudienceFilter,
  QuestCompletionPolicy,
  QuestFilterState,
  QuestFormData,
  QuestOption,
  QuestSortField,
  QuestSortOrder,
  QuestStatusFilter,
  QuestSubjectType,
  QuestTableRow,
} from './types';

export const audienceOptions: Array<QuestOption<QuestAudienceFilter>> = [
  { value: 'all', label: 'All' },
  { value: 'individual', label: 'Individual' },
  { value: 'team', label: 'Team' },
];

export const statusOptions: Array<QuestOption<QuestStatusFilter>> = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'all', label: 'All' },
];

export const subjectTypeOptions: Array<QuestOption<QuestSubjectType>> = [
  { value: 'user', label: 'User' },
  { value: 'team', label: 'Team' },
];

export const completionPolicyOptions: Array<
  QuestOption<QuestCompletionPolicy>
> = [
  { value: 'REPEATABLE', label: 'Repeatable' },
  { value: 'ONE_TIME', label: 'One-time' },
];

export const createEmptyQuestForm = (): QuestFormData => ({
  title: '',
  description: '',
  target_count: '',
  xp_reward: '',
  subject_type: 'user',
  completion_policy: 'REPEATABLE',
  cooldown_days: '',
});

export const createDefaultQuestFilter = (
  isAdmin: boolean,
): QuestFilterState => ({
  audience: 'all',
  status: isAdmin ? 'all' : 'active',
  team: '',
});

export const normalizeQuest = (quest: any): Quest => ({
  id: quest.id,
  title: quest.title,
  description: quest.description ?? '',
  target_count: quest.target_count ?? 0,
  xp_reward: quest.xp_reward ?? 0,
  subject_type: quest.subject_type === 'team' ? 'team' : 'user',
  completion_policy:
    quest.completion_policy === 'ONE_TIME' ? 'ONE_TIME' : 'REPEATABLE',
  cooldown_days: quest.cooldown_days ?? null,
  created_at: quest.created_at,
  updated_at: quest.updated_at,
  subject_ref: quest.subject_ref ?? null,
  completion_count: quest.completion_count ?? 0,
  progress_toward_target: quest.progress_toward_target ?? 0,
  next_milestone: quest.next_milestone ?? quest.target_count ?? 0,
});

export const createQuestTableRow = (quest: Quest): QuestTableRow => ({
  id: `${quest.id}:${quest.subject_ref ?? 'definition'}`,
  quest,
});

export const buildQuestPayload = (formData: QuestFormData) => ({
  title: formData.title.trim(),
  description: formData.description.trim(),
  xp_reward: parseInt(formData.xp_reward, 10),
  subject_type: formData.subject_type,
  completion_policy: formData.completion_policy,
  target_count: parseInt(formData.target_count, 10),
  ...(formData.completion_policy === 'REPEATABLE' && {
    cooldown_days: formData.cooldown_days
      ? parseInt(formData.cooldown_days, 10)
      : null,
  }),
});

export const validateQuestForm = (formData: QuestFormData): string | null => {
  if (!formData.title.trim()) {
    return 'Title is required';
  }
  if (!formData.description.trim()) {
    return 'Description is required';
  }
  if (!formData.target_count || parseInt(formData.target_count, 10) < 1) {
    return 'Target count must be at least 1';
  }
  if (
    formData.xp_reward.trim() === '' ||
    parseInt(formData.xp_reward, 10) < 0
  ) {
    return 'XP reward must be 0 or greater';
  }
  if (
    formData.completion_policy === 'REPEATABLE' &&
    formData.cooldown_days &&
    parseInt(formData.cooldown_days, 10) < 1
  ) {
    return 'Cooldown must be at least 1 day';
  }

  return null;
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

export const getQuestSubjectType = (quest: Quest): QuestSubjectType =>
  quest.subject_type ?? 'user';

export const formatSubjectName = (subjectRef?: string | null) => {
  if (!subjectRef) {
    return null;
  }

  const entityName = subjectRef.split('/').pop() ?? subjectRef;
  return entityName
    .split(/[-_]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

export const getQuestAudienceLabel = (quest: Quest) => {
  const subjectType = getQuestSubjectType(quest);
  const subjectName = formatSubjectName(quest.subject_ref);

  if (subjectType === 'team') {
    return subjectName ?? 'All teams';
  }

  return subjectName ?? 'All users';
};

export const getQuestTypeLabel = (quest: Quest) => {
  if (quest.completion_policy === 'ONE_TIME') {
    return 'One-time';
  }

  if (quest.cooldown_days) {
    return `Every ${quest.cooldown_days}d`;
  }

  return 'Repeatable';
};

export const getQuestSort = (
  descriptor: SortDescriptor | null,
): { sortBy: QuestSortField; order: QuestSortOrder } => {
  if (!descriptor) {
    return { sortBy: 'created_at', order: 'desc' };
  }

  const column = String(descriptor.column);
  let sortBy: QuestSortField = 'created_at';
  if (column === 'title' || column === 'xp_reward' || column === 'updated_at') {
    sortBy = column;
  } else if (column === 'progress') {
    sortBy = 'progress_toward_target';
  }
  const order: QuestSortOrder =
    descriptor.direction === 'ascending' ? 'asc' : 'desc';

  return { sortBy, order };
};

export const getQuestProgress = (quest: Quest) => ({
  current: quest.progress_toward_target,
  target: quest.target_count,
});

export const getQuestProgressPercentage = (quest: Quest) => {
  const current = Math.max(0, quest.progress_toward_target);
  const target = Math.max(1, quest.target_count);
  return Math.min(100, Math.round((current / target) * 100));
};

export const isQuestCompleted = (quest: Quest) =>
  quest.completion_policy === 'ONE_TIME' &&
  quest.completion_count >= quest.target_count;

export const formatQuestDate = (value?: string) => {
  if (!value) {
    return 'Not updated yet';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Not updated yet';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

export const getQuestRewardDescription = (quest: Quest) => {
  if (quest.completion_policy === 'ONE_TIME') {
    return 'One-time reward';
  }

  if (quest.cooldown_days) {
    return `Every ${quest.cooldown_days} day${
      quest.cooldown_days === 1 ? '' : 's'
    }`;
  }

  return 'Each milestone';
};
