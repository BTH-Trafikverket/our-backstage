import { Box, Button, Flex, SearchField, Text, TextField } from '@backstage/ui';

type LeaderboardSubjectType = 'user' | 'group';
type LeaderboardTimeRange = 'weekly' | 'monthly' | 'alltime';

type LeaderboardToolbarProps = {
  isLoading: boolean;
  search: string;
  subjectType: LeaderboardSubjectType;
  timeRange: LeaderboardTimeRange;
  pageCount: number;
  pageSize: string;
  totalCount: number;
  visibleCount: number;
  onSearchChange: (value: string) => void;
  onPageSizeBlur: () => void;
  onPageSizeChange: (value: string) => void;
  onSubjectTypeChange: (value: LeaderboardSubjectType) => void;
  onTimeRangeChange: (value: LeaderboardTimeRange) => void;
};

const FilterButton = ({
  label,
  isSelected,
  onPress,
}: {
  label: string;
  isSelected: boolean;
  onPress: () => void;
}) => (
  <Button
    size="small"
    variant={isSelected ? 'primary' : 'secondary'}
    onPress={onPress}
  >
    {label}
  </Button>
);

export const LeaderboardToolbar = ({
  isLoading,
  search,
  subjectType,
  timeRange,
  pageCount,
  pageSize,
  totalCount,
  visibleCount,
  onSearchChange,
  onPageSizeBlur,
  onPageSizeChange,
  onSubjectTypeChange,
  onTimeRangeChange,
}: LeaderboardToolbarProps) => {
  const scopeButtons: Array<{
    value: LeaderboardSubjectType;
    label: string;
  }> = [
    { value: 'user', label: 'Individuals' },
    { value: 'group', label: 'Teams' },
  ];
  const timeRangeButtons: Array<{
    value: LeaderboardTimeRange;
    label: string;
  }> = [
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'alltime', label: 'All time' },
  ];
  const totalLabel = totalCount > pageCount ? ` (${totalCount} total)` : '';

  return (
    <Flex direction="column" gap="4">
      <Flex align="end" justify="between" gap="3" style={{ flexWrap: 'wrap' }}>
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

        <Flex align="end" gap="3" style={{ flexWrap: 'wrap' }}>
          <Box style={{ flex: '0 0 9rem' }}>
            <TextField
              label="Page size"
              description="3-25 per page"
              value={pageSize}
              onChange={onPageSizeChange}
              onBlur={onPageSizeBlur}
              inputMode="numeric"
              placeholder="25"
              size="medium"
            />
          </Box>

          <Text color="secondary">
            {isLoading
              ? 'Refreshing leaderboard...'
              : `Showing ${visibleCount} of ${pageCount} leaderboard entries on this page${totalLabel}`}
          </Text>
        </Flex>
      </Flex>

      <Flex gap="4" align="center" style={{ flexWrap: 'wrap' }}>
        <Flex gap="2" align="center" style={{ flexWrap: 'wrap' }}>
          <Text as="span" variant="body-small" color="secondary" weight="bold">
            Scope
          </Text>
          {scopeButtons.map(option => (
            <FilterButton
              key={option.value}
              label={option.label}
              isSelected={subjectType === option.value}
              onPress={() => onSubjectTypeChange(option.value)}
            />
          ))}
        </Flex>

        <Flex gap="2" align="center" style={{ flexWrap: 'wrap' }}>
          <Text as="span" variant="body-small" color="secondary" weight="bold">
            Time
          </Text>
          {timeRangeButtons.map(option => (
            <FilterButton
              key={option.value}
              label={option.label}
              isSelected={timeRange === option.value}
              onPress={() => onTimeRangeChange(option.value)}
            />
          ))}
        </Flex>
      </Flex>
    </Flex>
  );
};
