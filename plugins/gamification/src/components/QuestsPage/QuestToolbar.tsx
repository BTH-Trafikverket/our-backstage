import { Box, Button, Flex, SearchField, Text } from '@backstage/ui';
import type { QuestAudienceFilter, QuestStatusFilter } from './types';

type QuestToolbarProps = {
  isAdmin: boolean;
  isLoading: boolean;
  search: string;
  audienceFilter: QuestAudienceFilter;
  statusFilter: QuestStatusFilter;
  teamFilter: string;
  teamOptions: string[];
  totalCount: number;
  visibleCount: number;
  onSearchChange: (value: string) => void;
  onAudienceChange: (value: QuestAudienceFilter) => void;
  onStatusChange: (value: QuestStatusFilter) => void;
  onTeamChange: (value: string) => void;
  onCreateQuest?: () => void;
};

const FilterButton = ({
  label,
  isSelected,
  onPress,
  isDisabled = false,
}: {
  label: string;
  isSelected: boolean;
  onPress: () => void;
  isDisabled?: boolean;
}) => (
  <Button
    size="small"
    variant={isSelected ? 'primary' : 'secondary'}
    isDisabled={isDisabled}
    onPress={onPress}
  >
    {label}
  </Button>
);

export const QuestToolbar = ({
  isAdmin,
  isLoading,
  search,
  audienceFilter,
  statusFilter,
  teamFilter,
  teamOptions,
  totalCount,
  visibleCount,
  onSearchChange,
  onAudienceChange,
  onStatusChange,
  onTeamChange,
  onCreateQuest,
}: QuestToolbarProps) => {
  const scopeButtons: Array<{
    value: QuestAudienceFilter;
    label: string;
    disabled?: boolean;
  }> = [
    { value: 'all', label: 'All' },
    { value: 'individual', label: 'Individuals' },
    {
      value: 'team',
      label: 'Teams',
      disabled: !isAdmin && teamOptions.length === 0,
    },
  ];

  const statusButtons: Array<{ value: QuestStatusFilter; label: string }> = [
    { value: 'active', label: 'Active' },
    { value: 'completed', label: 'Completed' },
    { value: 'all', label: 'All' },
  ];

  return (
    <Flex direction="column" gap="4">
      <Flex
        align="center"
        justify="between"
        gap="3"
        style={{ flexWrap: 'wrap' }}
      >
        <Box
          style={{
            flex: '1 1 22rem',
            minWidth: '18rem',
            maxWidth: '32rem',
          }}
        >
          <SearchField
            aria-label="Search quests"
            placeholder="Search quests"
            size="medium"
            value={search}
            onChange={onSearchChange}
          />
        </Box>

        <Text color="secondary">
          {isLoading
            ? 'Refreshing quests...'
            : `Showing ${visibleCount} of ${totalCount} quests`}
        </Text>
      </Flex>

      <Flex direction="column" gap="3">
        <Flex
          gap="3"
          align="center"
          justify="between"
          style={{ flexWrap: 'wrap' }}
        >
          <Flex gap="2" align="center" style={{ flexWrap: 'wrap' }}>
            <Text
              as="span"
              variant="body-small"
              color="secondary"
              weight="bold"
            >
              Scope
            </Text>
            {scopeButtons.map(option => (
              <FilterButton
                key={option.value}
                label={option.label}
                isSelected={audienceFilter === option.value}
                isDisabled={option.disabled}
                onPress={() => onAudienceChange(option.value)}
              />
            ))}
          </Flex>

          {isAdmin && onCreateQuest ? (
            <Button size="small" variant="primary" onPress={onCreateQuest}>
              Create quest
            </Button>
          ) : null}
        </Flex>

        {!isAdmin ? (
          <Flex gap="2" align="center" style={{ flexWrap: 'wrap' }}>
            <Text
              as="span"
              variant="body-small"
              color="secondary"
              weight="bold"
            >
              Status
            </Text>
            {statusButtons.map(option => (
              <FilterButton
                key={option.value}
                label={option.label}
                isSelected={statusFilter === option.value}
                onPress={() => onStatusChange(option.value)}
              />
            ))}
          </Flex>
        ) : null}

        {!isAdmin && audienceFilter === 'team' && teamOptions.length > 0 ? (
          <Flex gap="2" align="center" style={{ flexWrap: 'wrap' }}>
            <Text
              as="span"
              variant="body-small"
              color="secondary"
              weight="bold"
            >
              Team
            </Text>
            {teamOptions.map(team => (
              <FilterButton
                key={team}
                label={team.split('/').pop() ?? team}
                isSelected={teamFilter === team}
                onPress={() => onTeamChange(team)}
              />
            ))}
          </Flex>
        ) : null}
      </Flex>
    </Flex>
  );
};
