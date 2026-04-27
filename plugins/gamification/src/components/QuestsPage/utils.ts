import type { SortDescriptor } from '@backstage/ui';
import type {
  CatalogConditionType,
  Quest,
  QuestAudienceFilter,
  QuestCompletionPolicy,
  QuestFilterState,
  QuestFormData,
  QuestMode,
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

export const questModeOptions: Array<QuestOption<QuestMode>> = [
  { value: 'event_driven', label: 'Event-driven' },
  { value: 'catalog', label: 'Catalog-linked' },
];

export const catalogConditionOptions: Array<QuestOption<CatalogConditionType>> =
  [
    { value: 'missing_techdocs', label: 'Missing TechDocs' },
    { value: 'missing_owner', label: 'Missing owner' },
    { value: 'missing_description', label: 'Missing description' },
    { value: 'missing_tags', label: 'Missing tags' },
  ];

export const createEmptyQuestForm = (): QuestFormData => ({
  title: '',
  description: '',
  target_count: '',
  xp_reward: '',
  subject_type: 'user',
  completion_policy: 'REPEATABLE',
  cooldown_days: '',
  quest_mode: 'event_driven',
  catalog_condition: '',
  reminder_day: '',
  reminder_description: '',
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
  archived_at: quest.archived_at ?? null,
  subject_ref: quest.subject_ref ?? null,
  completion_count: quest.completion_count ?? 0,
  progress_toward_target: quest.progress_toward_target ?? 0,
  next_milestone: quest.next_milestone ?? quest.target_count ?? 0,
  quest_mode: quest.quest_mode === 'catalog' ? 'catalog' : 'event_driven',
  linked_config: quest.linked_config,
});

export const createQuestTableRow = (quest: Quest): QuestTableRow => ({
  id: `${quest.id}:${quest.subject_ref ?? 'definition'}`,
  quest,
});

export const buildQuestPayload = (formData: QuestFormData) => {
  const payload: Record<string, unknown> = {
    title: formData.title.trim(),
    description: formData.description.trim(),
    xp_reward: parseInt(formData.xp_reward, 10),
    subject_type: formData.subject_type,
    completion_policy: formData.completion_policy,
    target_count: parseInt(formData.target_count, 10),
    quest_mode: formData.quest_mode,
  };

  if (formData.completion_policy === 'REPEATABLE') {
    payload.cooldown_days = formData.cooldown_days
      ? parseInt(formData.cooldown_days, 10)
      : null;
  }

  const hasReminder =
    Boolean(formData.reminder_description.trim()) ||
    Boolean(formData.reminder_day.trim());

  const linkedConfig: Record<string, unknown> = {};
  if (formData.quest_mode === 'catalog' && formData.catalog_condition) {
    linkedConfig.catalog_condition = formData.catalog_condition;
  }
  if (hasReminder) {
    linkedConfig.reminder = {
      description: formData.reminder_description.trim(),
      day: parseInt(formData.reminder_day, 10),
    };
  }

  payload.linked_config = linkedConfig;

  return payload;
};

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

  if (formData.quest_mode === 'catalog' && !formData.catalog_condition) {
    return 'Catalog condition is required for catalog-linked quests';
  }

  const hasReminderDescription = Boolean(formData.reminder_description.trim());
  const hasReminderDay = Boolean(formData.reminder_day.trim());

  if (hasReminderDescription || hasReminderDay) {
    if (!hasReminderDescription) {
      return 'Reminder description is required';
    }
    if (!hasReminderDay || parseInt(formData.reminder_day, 10) < 1) {
      return 'Reminder day must be at least 1';
    }
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
  if (quest.quest_mode === 'catalog') {
    return 'Catalog-linked';
  }

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
