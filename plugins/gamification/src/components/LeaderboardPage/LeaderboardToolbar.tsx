import { Box, Button, Flex, SearchField, Text } from '@backstage/ui';

type LeaderboardSubjectType = 'user' | 'group';

type LeaderboardToolbarProps = {
  isAdmin: boolean;
  isLoading: boolean;
  search: string;
  subjectType: LeaderboardSubjectType;
  totalCount: number;
  visibleCount: number;
  onSearchChange: (value: string) => void;
  onSubjectTypeChange: (value: LeaderboardSubjectType) => void;
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

export const LeaderboardToolbar = ({
  isAdmin,
  isLoading,
  search,
  subjectType,
  totalCount,
  visibleCount,
  onSearchChange,
  onSubjectTypeChange,
}: LeaderboardToolbarProps) => (
  <Flex direction="column" gap="3">
    <Flex align="center" justify="between" gap="3" style={{ flexWrap: 'wrap' }}>
      <Box
        style={{
          flex: '1 1 22rem',
          minWidth: '18rem',
          maxWidth: '32rem',
        }}
      >
        <SearchField
          aria-label="Search leaderboard"
          placeholder="Search leaderboard"
          size="medium"
          value={search}
          onChange={onSearchChange}
        />
      </Box>

      <Text color="secondary">
        {isLoading
          ? 'Refreshing leaderboard...'
          : `Showing ${visibleCount} of ${totalCount} leaderboard entries on this page`}
      </Text>
    </Flex>

    <Flex direction="column" gap="2">
      <Flex gap="2" align="center" style={{ flexWrap: 'wrap' }}>
        <Text as="span" variant="body-small" color="secondary" weight="bold">
          Scope
        </Text>
        <FilterButton
          label="Individuals"
          isSelected={subjectType === 'user'}
          onPress={() => onSubjectTypeChange('user')}
        />
        <FilterButton
          label="Teams"
          isSelected={subjectType === 'group'}
          isDisabled={!isAdmin}
          onPress={() => onSubjectTypeChange('group')}
        />
      </Flex>

      {!isAdmin ? (
        <Text variant="body-small" color="secondary">
          Team rankings are only available in admin view.
        </Text>
      ) : null}
    </Flex>
  </Flex>
);
