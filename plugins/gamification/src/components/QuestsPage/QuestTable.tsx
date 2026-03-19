import {
  Button,
  Cell,
  CellText,
  Column,
  Flex,
  Table,
  Tag,
  TagGroup,
  Text,
  type TableProps,
} from '@backstage/ui';
import type { QuestTableRow } from './types';
import {
  formatQuestDate,
  getQuestAudienceLabel,
  getQuestProgress,
  getQuestProgressPercentage,
  getQuestRewardDescription,
  getQuestTypeLabel,
  isQuestCompleted,
} from './utils';

type QuestTableProps = {
  isAdmin: boolean;
  search: string;
  tableProps: Omit<TableProps<QuestTableRow>, 'columnConfig' | 'emptyState'>;
  onEditQuest: (quest: QuestTableRow['quest']) => void;
  onDeleteQuest: (quest: QuestTableRow['quest']) => void;
};

const renderAdminQuestMeta = (item: QuestTableRow) => (
  <TagGroup aria-label={`Metadata for ${item.quest.title}`}>
    <Tag id={`${item.id}-audience`}>{getQuestAudienceLabel(item.quest)}</Tag>
    <Tag id={`${item.id}-cadence`}>{getQuestTypeLabel(item.quest)}</Tag>
    <Tag id={`${item.id}-target`}>{`Target ${item.quest.target_count}`}</Tag>
  </TagGroup>
);

const renderUserQuestMeta = (item: QuestTableRow) => (
  <TagGroup aria-label={`Metadata for ${item.quest.title}`}>
    <Tag id={`${item.id}-audience`}>{getQuestAudienceLabel(item.quest)}</Tag>
    <Tag id={`${item.id}-cadence`}>{getQuestTypeLabel(item.quest)}</Tag>
  </TagGroup>
);

const renderProgressCell = (item: QuestTableRow) => {
  const progress = getQuestProgress(item.quest);
  const percentage = getQuestProgressPercentage(item.quest);
  const completed = isQuestCompleted(item.quest);

  return (
    <Cell>
      <Flex direction="column" gap="2">
        <Flex justify="between" align="center" gap="2">
          <Text weight="bold" color={completed ? 'success' : 'primary'}>
            {completed ? 'Completed' : 'In progress'}
          </Text>
          <Text variant="body-small" color="secondary">
            {`${progress.current}/${progress.target}`}
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
              width: `${percentage}%`,
              height: '100%',
              borderRadius: '999px',
              backgroundColor: completed
                ? 'var(--bui-fg-success)'
                : 'var(--bui-bg-solid)',
            }}
          />
        </div>
        <Text variant="body-small" color="secondary">
          {completed
            ? 'This quest is already complete.'
            : `Next milestone at ${item.quest.next_milestone}`}
        </Text>
      </Flex>
    </Cell>
  );
};

const getAdminColumns = (
  onEditQuest: (quest: QuestTableRow['quest']) => void,
  onDeleteQuest: (quest: QuestTableRow['quest']) => void,
) =>
  [
    {
      id: 'title',
      label: 'Quest',
      isRowHeader: true,
      isSortable: true,
      defaultWidth: '3.4fr',
      minWidth: 320,
      cell: (item: QuestTableRow) => (
        <Cell>
          <Flex direction="column" gap="2">
            <Text weight="bold">{item.quest.title}</Text>
            <Text color="secondary">{item.quest.description}</Text>
            {renderAdminQuestMeta(item)}
          </Flex>
        </Cell>
      ),
    },
    {
      id: 'xp_reward',
      label: 'Reward',
      isSortable: true,
      width: 170,
      cell: (item: QuestTableRow) => (
        <CellText
          title={`${item.quest.xp_reward} XP`}
          description={getQuestRewardDescription(item.quest)}
        />
      ),
    },
    {
      id: 'updated_at',
      label: 'Updated',
      isSortable: true,
      width: 180,
      cell: (item: QuestTableRow) => (
        <CellText
          title={formatQuestDate(
            item.quest.updated_at ?? item.quest.created_at,
          )}
          description="Latest change"
        />
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
      cell: (item: QuestTableRow) => (
        <Cell>
          <Flex justify="end" gap="2" style={{ width: '100%' }}>
            {item.quest.archived_at ? (
              <Text color="secondary">Archived</Text>
            ) : (
              <>
                <Button
                  size="small"
                  variant="secondary"
                  onPress={() => onEditQuest(item.quest)}
                >
                  Edit
                </Button>
                <Button
                  size="small"
                  variant="tertiary"
                  destructive
                  onPress={() => onDeleteQuest(item.quest)}
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

const userColumns = [
  {
    id: 'title',
    label: 'Quest',
    isRowHeader: true,
    isSortable: true,
    defaultWidth: '3.5fr',
    minWidth: 320,
    cell: (item: QuestTableRow) => (
      <Cell>
        <Flex direction="column" gap="2">
          <Text weight="bold">{item.quest.title}</Text>
          <Text color="secondary">{item.quest.description}</Text>
          {renderUserQuestMeta(item)}
        </Flex>
      </Cell>
    ),
  },
  {
    id: 'xp_reward',
    label: 'Reward',
    isSortable: true,
    width: 170,
    cell: (item: QuestTableRow) => (
      <CellText
        title={`${item.quest.xp_reward} XP`}
        description={getQuestRewardDescription(item.quest)}
      />
    ),
  },
  {
    id: 'progress',
    label: 'Progress',
    isSortable: true,
    defaultWidth: '2.2fr',
    minWidth: 240,
    cell: renderProgressCell,
  },
] as const;

export const QuestTable = ({
  isAdmin,
  search,
  tableProps,
  onEditQuest,
  onDeleteQuest,
}: QuestTableProps) => {
  let emptyDescription =
    'Adjust the scope or status filters to explore more quests.';

  if (search.trim()) {
    emptyDescription =
      'Try a different title or reset one of the active filters.';
  } else if (isAdmin) {
    emptyDescription = 'Create a quest to start building your reward flow.';
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
        {search.trim() ? 'No quests match this search.' : 'No quests to show.'}
      </Text>
      <Text color="secondary">{emptyDescription}</Text>
    </Flex>
  );

  return (
    <Table
      columnConfig={
        isAdmin ? getAdminColumns(onEditQuest, onDeleteQuest) : userColumns
      }
      emptyState={emptyState}
      {...tableProps}
    />
  );
};
