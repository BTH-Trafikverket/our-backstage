import { Box, Flex, SearchField, Text } from '@backstage/ui';

type LeaderboardToolbarProps = {
  isLoading: boolean;
  search: string;
  totalCount: number;
  visibleCount: number;
  onSearchChange: (value: string) => void;
};

export const LeaderboardToolbar = ({
  isLoading,
  search,
  totalCount,
  visibleCount,
  onSearchChange,
}: LeaderboardToolbarProps) => (
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
);
