export type BadgeSubjectType = 'user' | 'team';
export type BadgeAudienceFilter = 'all' | 'individual' | 'team';
export type BadgeStatusFilter = 'active' | 'earned' | 'all';
export type BadgeSortField =
  | 'earned_at'
  | 'created_at'
  | 'title'
  | 'xp_reward'
  | 'progress_percent';
export type BadgeSortOrder = 'asc' | 'desc';

export type QuestLite = {
  id: string;
  title: string;
  subject_type: BadgeSubjectType;
  completion_policy: 'ONE_TIME' | 'REPEATABLE';
};

export type BadgeCriteria = {
  quest_id: string;
  target_count: number;
};

export type ProgressInfo = {
  current: number;
  target: number;
  percent: number;
  done: boolean;
};

export type CriteriaWithProgress = {
  quest_id: string;
  quest_title: string;
  target_count: number;
  completion_policy: string;
  progress: ProgressInfo;
  quest_progress: ProgressInfo;
};

export type BadgeProgressSummary = {
  completedRequirements: number;
  totalRequirements: number;
  percent: number;
};

export type Badge = {
  id: string;
  title: string;
  description: string;
  xp_reward: number;
  subject_type: BadgeSubjectType;
  criterias: Array<BadgeCriteria | CriteriaWithProgress>;
  archived_at?: string | null;
  created_at?: string;
  updated_at?: string;
  isEarned?: boolean;
  earnedAt?: string | null;
  progressSubjectRef?: string | null;
  progress?: BadgeProgressSummary;
};

export type BadgeTableRow = {
  id: string;
  badge: Badge;
};

export type BadgeFormCriteria = {
  quest_id: string;
  target_count: string;
};

export type BadgeFormData = {
  title: string;
  description: string;
  xp_reward: string;
  subject_type: BadgeSubjectType;
  criterias: BadgeFormCriteria[];
};

export type BadgeFilterState = {
  audience: BadgeAudienceFilter;
  status: BadgeStatusFilter;
  team: string;
};

export type BadgesPageProps = {
  isAdmin: boolean;
  onToggleDemo?: () => void;
  isDemoMode?: boolean;
};
