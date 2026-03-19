import {
  Button,
  Cell,
  CellText,
  Column,
  DialogTrigger,
  Flex,
  Box,
  Popover,
  Table,
  Tag,
  TagGroup,
  Text,
  type TableProps,
} from '@backstage/ui';
import EmojiEventsIcon from '@material-ui/icons/EmojiEvents';
import type { BadgeStatusFilter, BadgeTableRow, QuestLite } from './types';
import {
  formatBadgeDate,
  getBadgeProgressText,
  getBadgeStatusLabel,
  getBadgeSubjectTypeLabel,
  getCriteriaSummaryText,
} from './utils';

type BadgeTableProps = {
  isAdmin: boolean;
  statusFilter: BadgeStatusFilter;
  search: string;
  quests: QuestLite[];
  tableProps: Omit<TableProps<BadgeTableRow>, 'columnConfig' | 'emptyState'>;
  onEditBadge: (badge: BadgeTableRow['badge']) => void;
  onDeleteBadge: (badge: BadgeTableRow['badge']) => void;
};

const renderAdminMeta = (item: BadgeTableRow) => (
  <TagGroup aria-label={`Metadata for ${item.badge.title}`}>
    <Tag id={`${item.id}-subject`}>
      {getBadgeSubjectTypeLabel(item.badge.subject_type)}
    </Tag>
    <Tag id={`${item.id}-criteria`}>
      {`${item.badge.criterias.length} requirements`}
    </Tag>
  </TagGroup>
);

const renderBadgeIcon = () => (
  <Box
    aria-hidden
    style={{
      width: '2.25rem',
      height: '2.25rem',
      borderRadius: '999px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--bui-bg-neutral-2)',
      color: 'var(--bui-bg-solid)',
      flexShrink: 0,
    }}
  >
    <EmojiEventsIcon style={{ fontSize: 18 }} />
  </Box>
);

const renderUserMeta = (item: BadgeTableRow) => (
  <TagGroup aria-label={`Metadata for ${item.badge.title}`}>
    <Tag id={`${item.id}-subject`}>
      {getBadgeSubjectTypeLabel(item.badge.subject_type)}
    </Tag>
    {item.badge.progressSubjectRef ? (
      <Tag id={`${item.id}-subject-ref`}>
        {item.badge.progressSubjectRef.split('/').pop() ??
          item.badge.progressSubjectRef}
      </Tag>
    ) : null}
  </TagGroup>
);

const renderProgressCell = (item: BadgeTableRow) => {
  const progress = item.badge.progress;
  const percentage = progress?.percent ?? 0;

  return (
    <Cell>
      <Flex direction="column" gap="2">
        <Flex justify="between" align="center" gap="2">
          <Text
            weight="bold"
            color={item.badge.isEarned ? 'success' : 'primary'}
          >
            {item.badge.isEarned ? 'Earned' : 'In progress'}
          </Text>
          <Text variant="body-small" color="secondary">
            {getBadgeProgressText(item.badge)}
          </Text>
        </Flex>
        <div
          aria-hidden
          style={{
            width: '100%',
            height: '0.5rem',
            borderRadius: '999px',
            backgroundColor: 'var(--bui-bg-neutral-2)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.max(0, Math.min(100, percentage))}%`,
              height: '100%',
              borderRadius: '999px',
              backgroundColor: item.badge.isEarned
                ? 'var(--bui-fg-success)'
                : 'var(--bui-bg-solid)',
            }}
          />
        </div>
      </Flex>
    </Cell>
  );
};

const renderCriteriaProgress = (item: BadgeTableRow) => {
  const criterias = item.badge.criterias.filter(
    criteria => 'progress' in criteria,
  );

  if (!criterias.length) {
    return (
      <Text variant="body-small" color="secondary">
        No criteria progress available yet.
      </Text>
    );
  }

  return (
    <Flex direction="column" gap="3">
      {criterias.map((criteria, index) => (
        <Flex
          key={`${criteria.quest_id}-${index}`}
          direction="column"
          gap="2"
          style={{
            padding: '0.75rem',
            borderRadius: '0.75rem',
            backgroundColor: 'var(--bui-bg-neutral-2)',
          }}
        >
          <Flex justify="between" align="center" gap="2">
            <Text weight="bold">{criteria.quest_title}</Text>
            <Text variant="body-small" color="secondary">
              {criteria.progress.current}/{criteria.progress.target}
            </Text>
          </Flex>
          <div
            aria-hidden
            style={{
              width: '100%',
              height: '0.5rem',
              borderRadius: '999px',
              backgroundColor: 'var(--bui-bg-neutral-3)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.max(
                  0,
                  Math.min(100, criteria.progress.percent),
                )}%`,
                height: '100%',
                borderRadius: '999px',
                backgroundColor: criteria.progress.done
                  ? 'var(--bui-fg-success)'
                  : 'var(--bui-bg-solid)',
              }}
            />
          </div>
          <Text variant="body-small" color="secondary">
            {criteria.completion_policy === 'ONE_TIME'
              ? 'One-time requirement'
              : `${criteria.target_count} completions required`}
          </Text>
        </Flex>
      ))}
    </Flex>
  );
};

const getAdminColumns = (
  quests: QuestLite[],
  onEditBadge: (badge: BadgeTableRow['badge']) => void,
  onDeleteBadge: (badge: BadgeTableRow['badge']) => void,
) =>
  [
    {
      id: 'title',
      label: 'Badge',
      isRowHeader: true,
      isSortable: true,
      defaultWidth: '3fr',
      minWidth: 320,
      cell: (item: BadgeTableRow) => (
        <Cell>
          <Flex gap="3" align="start">
            {renderBadgeIcon()}
            <Flex direction="column" gap="2" style={{ minWidth: 0 }}>
              <Text weight="bold">{item.badge.title}</Text>
              <Text color="secondary">{item.badge.description}</Text>
              {renderAdminMeta(item)}
            </Flex>
          </Flex>
        </Cell>
      ),
    },
    {
      id: 'xp_reward',
      label: 'Reward',
      isSortable: true,
      width: 160,
      cell: (item: BadgeTableRow) => (
        <CellText
          title={`${item.badge.xp_reward} XP`}
          description="Awarded when earned"
        />
      ),
    },
    {
      id: 'criteria_count',
      label: 'Requirements',
      isSortable: true,
      defaultWidth: '2fr',
      minWidth: 240,
      cell: (item: BadgeTableRow) => (
        <CellText
          title={`${item.badge.criterias.length} requirements`}
          description={getCriteriaSummaryText(item.badge, quests, true)}
        />
      ),
    },
    {
      id: 'status',
      label: 'Status',
      isSortable: true,
      width: 160,
      cell: (item: BadgeTableRow) => (
        <CellText title={getBadgeStatusLabel(item.badge, true)} />
      ),
    },
    {
      id: 'actions',
      label: 'Actions',
      width: 184,
      header: () => (
        <Column id="actions" width={184}>
          <Flex justify="end" style={{ width: '100%' }}>
            Actions
          </Flex>
        </Column>
      ),
      cell: (item: BadgeTableRow) => (
        <Cell>
          <Flex justify="end" gap="2" style={{ width: '100%' }}>
            {item.badge.archived_at ? (
              <Text color="secondary">Archived</Text>
            ) : (
              <>
                <Button
                  size="small"
                  variant="secondary"
                  onPress={() => onEditBadge(item.badge)}
                >
                  Edit
                </Button>
                <Button
                  size="small"
                  variant="tertiary"
                  destructive
                  onPress={() => onDeleteBadge(item.badge)}
                >
                  Archive
                </Button>
              </>
            )}
          </Flex>
        </Cell>
      ),
    },
  ] as const;

const getUserColumns = (showEarnedSort: boolean) =>
  [
    {
      id: 'title',
      label: 'Badge',
      isRowHeader: true,
      isSortable: true,
      defaultWidth: '3fr',
      minWidth: 320,
      cell: (item: BadgeTableRow) => (
        <Cell>
          <Flex gap="3" align="start">
            {renderBadgeIcon()}
            <Flex direction="column" gap="2" style={{ minWidth: 0, flex: 1 }}>
              <Text weight="bold">{item.badge.title}</Text>
              <Text color="secondary">{item.badge.description}</Text>
              {renderUserMeta(item)}
              <DialogTrigger>
                <Button size="small" variant="secondary">
                  Criteria progress
                </Button>
                <Popover
                  placement="bottom start"
                  hideArrow
                  style={{ width: 'var(--trigger-width)' }}
                >
                  <Box>
                    <Flex direction="column" gap="3">
                      <Text weight="bold">{item.badge.title}</Text>
                      {renderCriteriaProgress(item)}
                    </Flex>
                  </Box>
                </Popover>
              </DialogTrigger>
            </Flex>
          </Flex>
        </Cell>
      ),
    },
    {
      id: 'xp_reward',
      label: 'Reward',
      isSortable: true,
      width: 160,
      cell: (item: BadgeTableRow) => (
        <CellText
          title={`${item.badge.xp_reward} XP`}
          description="Awarded when earned"
        />
      ),
    },
    {
      id: 'progress_percent',
      label: 'Progress',
      isSortable: true,
      defaultWidth: '2fr',
      minWidth: 240,
      cell: renderProgressCell,
    },
    {
      id: 'earned_at',
      label: 'Earned',
      isSortable: showEarnedSort,
      width: 170,
      cell: (item: BadgeTableRow) => (
        <CellText
          title={
            item.badge.isEarned
              ? formatBadgeDate(item.badge.earnedAt)
              : 'Not earned'
          }
          description={getBadgeStatusLabel(item.badge, false)}
        />
      ),
    },
  ] as const;

export const BadgeTable = ({
  isAdmin,
  statusFilter,
  search,
  quests,
  tableProps,
  onEditBadge,
  onDeleteBadge,
}: BadgeTableProps) => {
  let emptyDescription = 'Adjust the search or filters to explore more badges.';

  if (search.trim()) {
    emptyDescription =
      'Try a different title or reset one of the active filters.';
  } else if (isAdmin) {
    emptyDescription = 'Create a badge to start defining reward milestones.';
  }

  const emptyState = (
    <Flex
      direction="column"
      align="center"
      justify="center"
      gap="2"
      style={{ minHeight: '12rem' }}
    >
      <Text weight="bold">
        {search.trim() ? 'No badges match this search.' : 'No badges to show.'}
      </Text>
      <Text color="secondary">{emptyDescription}</Text>
    </Flex>
  );

  return (
    <Table
      key={isAdmin ? 'badges-admin' : 'badges-user'}
      columnConfig={
        isAdmin
          ? getAdminColumns(quests, onEditBadge, onDeleteBadge)
          : getUserColumns(statusFilter === 'all')
      }
      emptyState={emptyState}
      {...tableProps}
    />
  );
};
