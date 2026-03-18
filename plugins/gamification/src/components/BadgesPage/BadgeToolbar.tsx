import { Box, Button, Flex, SearchField, Text } from '@backstage/ui';
import type { BadgeAudienceFilter } from './types';

type BadgeToolbarProps = {
  isAdmin: boolean;
  isLoading: boolean;
  search: string;
  audienceFilter: BadgeAudienceFilter;
  teamFilter: string;
  teamOptions: string[];
  totalCount: number;
  visibleCount: number;
  onSearchChange: (value: string) => void;
  onAudienceChange: (value: BadgeAudienceFilter) => void;
  onTeamChange: (value: string) => void;
  onCreateBadge?: () => void;
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

export const BadgeToolbar = ({
  isAdmin,
  isLoading,
  search,
  audienceFilter,
  teamFilter,
  teamOptions,
  totalCount,
  visibleCount,
  onSearchChange,
  onAudienceChange,
  onTeamChange,
  onCreateBadge,
}: BadgeToolbarProps) => {
  const scopeButtons: Array<{
    value: BadgeAudienceFilter;
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
            aria-label="Search badges"
            placeholder="Search badges"
            size="medium"
            value={search}
            onChange={onSearchChange}
          />
        </Box>

        <Text color="secondary">
          {isLoading
            ? 'Refreshing badges...'
            : `Showing ${visibleCount} of ${totalCount} badges`}
        </Text>
      </Flex>

      <Flex
        gap="3"
        align="center"
        justify="between"
        style={{ flexWrap: 'wrap' }}
      >
        {!isAdmin ? (
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
        ) : (
          <div />
        )}

        {isAdmin && onCreateBadge ? (
          <Button size="small" variant="primary" onPress={onCreateBadge}>
            Create badge
          </Button>
        ) : null}
      </Flex>

      {!isAdmin && audienceFilter === 'team' && teamOptions.length > 0 ? (
        <Flex gap="2" align="center" style={{ flexWrap: 'wrap' }}>
          <Text as="span" variant="body-small" color="secondary" weight="bold">
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
  );
};
