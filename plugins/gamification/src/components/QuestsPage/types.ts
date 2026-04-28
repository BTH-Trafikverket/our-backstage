export type QuestSubjectType = 'user' | 'team';
export type QuestCompletionPolicy = 'ONE_TIME' | 'REPEATABLE';
export type QuestAudienceFilter = 'all' | 'individual' | 'team';
export type QuestStatusFilter = 'active' | 'completed' | 'all';
export type QuestSortField =
  | 'created_at'
  | 'updated_at'
  | 'title'
  | 'xp_reward'
  | 'progress_toward_target';
export type QuestSortOrder = 'asc' | 'desc';

export type QuestMode = 'event_driven' | 'catalog';
export type CatalogConditionType =
  | 'missing_techdocs'
  | 'missing_owner'
  | 'missing_description'
  | 'missing_tags';

export type QuestReminderConfig = {
  description: string;
  day: number;
};

export type LinkedQuestConfig = {
  catalog_condition?: CatalogConditionType;
  reminder?: QuestReminderConfig;
};

export type Quest = {
  id: string;
  title: string;
  description: string;
  target_count: number;
  xp_reward: number;
  subject_type?: QuestSubjectType;
  completion_policy: QuestCompletionPolicy;
  cooldown_days: number | null;
  created_at?: string;
  updated_at?: string;
  archived_at?: string | null;
  subject_ref?: string | null;
  completion_count: number;
  progress_toward_target: number;
  next_milestone: number;
  quest_mode?: QuestMode;
  linked_config?: LinkedQuestConfig;
};

export type QuestTableRow = {
  id: string;
  quest: Quest;
};

export type QuestFilterState = {
  audience: QuestAudienceFilter;
  status: QuestStatusFilter;
  team: string;
};

export type QuestFormData = {
  title: string;
  description: string;
  target_count: string;
  xp_reward: string;
  subject_type: QuestSubjectType;
  completion_policy: QuestCompletionPolicy;
  cooldown_days: string;
  quest_mode: QuestMode;
  catalog_condition: CatalogConditionType | '';
  reminder_day: string;
  reminder_description: string;
};

export type QuestsPageProps = {
  isAdmin: boolean;
  onToggleDemo?: () => void;
  isDemoMode?: boolean;
};

export type QuestOption<T extends string> = {
  value: T;
  label: string;
};
