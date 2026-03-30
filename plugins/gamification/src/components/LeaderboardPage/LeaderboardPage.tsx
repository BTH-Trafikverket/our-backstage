import {
  CellText,
  Flex,
  HeaderPage,
  Table,
  Text,
  type ColumnConfig,
} from '@backstage/ui';
import { leaderboardMockData, type LeaderboardEntry } from './mockData';

const leaderboardColumns: readonly ColumnConfig<LeaderboardEntry>[] = [
  {
    id: 'rank',
    label: 'Rank',
    width: 96,
    cell: item => <CellText title={String(item.rank)} />,
  },
  {
    id: 'name',
    label: 'Name',
    isRowHeader: true,
    defaultWidth: '2fr',
    minWidth: 220,
    cell: item => <CellText title={item.name} />,
  },
  {
    id: 'points',
    label: 'Points',
    width: 140,
    cell: item => <CellText title={String(item.points)} />,
  },
];

const emptyState = (
  <Flex
    direction="column"
    align="center"
    justify="center"
    gap="2"
    style={{ minHeight: '12rem' }}
  >
    <Text weight="bold">No leaderboard entries to show.</Text>
    <Text color="secondary">
      Add mock rows to preview the first UI version.
    </Text>
  </Flex>
);

export const LeaderboardPage = () => (
  <Flex direction="column" gap="4">
    <HeaderPage title="Leaderboard" />
    <Text color="secondary">First UI draft with local mock data only.</Text>

    <Table
      columnConfig={leaderboardColumns}
      data={leaderboardMockData}
      emptyState={emptyState}
      pagination={{ type: 'none' }}
    />
  </Flex>
);
