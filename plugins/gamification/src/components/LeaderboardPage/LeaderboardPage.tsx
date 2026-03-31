import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  CellText,
  Flex,
  HeaderPage,
  Skeleton,
  Table,
  Text,
  type ColumnConfig,
  type SortDescriptor,
} from '@backstage/ui';
import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { formatSubjectName, readErrorMessage } from '../QuestsPage/utils';
import { LeaderboardToolbar } from './LeaderboardToolbar';

type LeaderboardEntry = {
  id: string;
  rank: number;
  name: string;
  points: number;
};

type LeaderboardSubjectType = 'user' | 'group';

type LeaderboardApiRow = {
  rank: number;
  subjectRef: string;
  subjectType: LeaderboardSubjectType;
  totalXp: number;
};

type LeaderboardResponse = {
  subjectType: LeaderboardSubjectType;
  timeRange: 'weekly' | 'monthly' | 'alltime';
  data: LeaderboardApiRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type LeaderboardPagination = LeaderboardResponse['pagination'];
type LeaderboardPageProps = {
  isAdmin?: boolean;
};

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;

const leaderboardColumns: readonly ColumnConfig<LeaderboardEntry>[] = [
  {
    id: 'rank',
    label: 'Rank',
    isSortable: true,
    width: 96,
    cell: item => <CellText title={String(item.rank)} />,
  },
  {
    id: 'name',
    label: 'Name',
    isRowHeader: true,
    isSortable: true,
    defaultWidth: '2fr',
    minWidth: 220,
    cell: item => <CellText title={item.name} />,
  },
  {
    id: 'points',
    label: 'Points',
    isSortable: true,
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
    <Text color="secondary">No one has earned any points yet.</Text>
  </Flex>
);

const filteredEmptyState = (
  <Flex
    direction="column"
    align="center"
    justify="center"
    gap="2"
    style={{ minHeight: '12rem' }}
  >
    <Text weight="bold">No leaderboard entries match this search.</Text>
    <Text color="secondary">
      Try a different name or clear the current page filter.
    </Text>
  </Flex>
);

const renderLoadingState = () => (
  <Flex direction="column" gap="3">
    <Text color="secondary">Loading leaderboard...</Text>
    <Skeleton height={36} width="100%" rounded />
    <Skeleton height={36} width="100%" rounded />
    <Skeleton height={36} width="100%" rounded />
  </Flex>
);

const createDefaultPagination = (): LeaderboardPagination => ({
  page: DEFAULT_PAGE,
  limit: DEFAULT_PAGE_SIZE,
  total: 0,
  totalPages: 1,
});

const normalizePagination = (
  pagination: Partial<LeaderboardPagination> | null | undefined,
): LeaderboardPagination => {
  const limit =
    typeof pagination?.limit === 'number' && pagination.limit > 0
      ? pagination.limit
      : DEFAULT_PAGE_SIZE;
  const total =
    typeof pagination?.total === 'number' && pagination.total >= 0
      ? pagination.total
      : 0;
  const derivedTotalPages = total > 0 ? Math.ceil(total / limit) : 1;
  const totalPages =
    typeof pagination?.totalPages === 'number' && pagination.totalPages > 0
      ? pagination.totalPages
      : derivedTotalPages;
  const page =
    typeof pagination?.page === 'number' && pagination.page > 0
      ? Math.min(pagination.page, totalPages)
      : DEFAULT_PAGE;

  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, totalPages),
  };
};

const normalizeLeaderboardEntries = (
  response: Partial<LeaderboardResponse> | null | undefined,
): LeaderboardEntry[] => {
  const rows = Array.isArray(response?.data) ? response.data : [];

  return rows
    .filter(
      (row): row is LeaderboardApiRow =>
        Boolean(row) &&
        typeof row.rank === 'number' &&
        typeof row.subjectRef === 'string' &&
        typeof row.totalXp === 'number',
    )
    .map(row => ({
      id: row.subjectRef,
      rank: row.rank,
      name: formatSubjectName(row.subjectRef) ?? row.subjectRef,
      points: row.totalXp,
    }));
};

const filterLeaderboardEntries = (
  entries: LeaderboardEntry[],
  search: string,
): LeaderboardEntry[] => {
  const normalizedSearch = search.trim().toLocaleLowerCase('en-US');

  if (!normalizedSearch) {
    return entries;
  }

  return entries.filter(entry =>
    entry.name.toLocaleLowerCase('en-US').includes(normalizedSearch),
  );
};

const sortLeaderboardEntries = (
  entries: LeaderboardEntry[],
  sort: SortDescriptor | null,
): LeaderboardEntry[] => {
  if (!sort) {
    return entries;
  }

  const directionMultiplier = sort.direction === 'descending' ? -1 : 1;
  const sortedEntries = [...entries];

  sortedEntries.sort((left, right) => {
    const column = String(sort.column);
    let result = 0;

    if (column === 'name') {
      result = left.name.localeCompare(right.name, 'en-US', {
        sensitivity: 'base',
      });
    } else if (column === 'points') {
      result = left.points - right.points;
    } else {
      result = left.rank - right.rank;
    }

    if (result !== 0) {
      return result * directionMultiplier;
    }

    return left.rank - right.rank;
  });

  return sortedEntries;
};

export const LeaderboardPage = (_props: LeaderboardPageProps) => {
  const { isAdmin = false } = _props;
  const fetchApi = useApi(fetchApiRef);
  const discoveryApi = useApi(discoveryApiRef);

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortDescriptor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [page, setPage] = useState(DEFAULT_PAGE);
  const [subjectType, setSubjectType] =
    useState<LeaderboardSubjectType>('user');
  const [pagination, setPagination] = useState<LeaderboardPagination>(
    createDefaultPagination(),
  );

  const buildGamificationUrl = useCallback(
    async (path: string, query?: Record<string, string>) => {
      const baseUrl = await discoveryApi.getBaseUrl('gamification');
      const url = new URL(
        `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`,
      );

      if (query) {
        for (const [key, value] of Object.entries(query)) {
          if (value.trim()) {
            url.searchParams.set(key, value);
          }
        }
      }

      return url.toString();
    },
    [discoveryApi],
  );

  useEffect(() => {
    if (!isAdmin && subjectType !== 'user') {
      setSubjectType('user');
      setPage(DEFAULT_PAGE);
    }
  }, [isAdmin, subjectType]);

  // The leaderboard contract only exposes the global subject type for the
  // response and does not include per-team visibility metadata. Keep team
  // rankings admin-only in the UI until the backend exposes finer-grained
  // visibility information.
  const visibleSubjectType = isAdmin ? subjectType : 'user';

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const loadLeaderboard = async () => {
      try {
        setLoading(true);
        setError(undefined);
        const url = await buildGamificationUrl('/leaderboard', {
          subjectType: visibleSubjectType,
          page: String(page),
          limit: String(DEFAULT_PAGE_SIZE),
        });
        const response = await fetchApi.fetch(url, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        const result = (await response.json()) as LeaderboardResponse;
        if (!cancelled) {
          const nextPagination = normalizePagination(result.pagination);
          setEntries(normalizeLeaderboardEntries(result));
          setPagination(nextPagination);
        }
      } catch (e: any) {
        if (controller.signal.aborted) {
          return;
        }

        if (!cancelled) {
          setError(e?.message ?? String(e));
          setEntries([]);
          setPagination(createDefaultPagination());
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadLeaderboard();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [buildGamificationUrl, fetchApi, page, visibleSubjectType]);

  const canGoToPreviousPage = pagination.page > 1;
  const canGoToNextPage =
    pagination.total > 0 && pagination.page < pagination.totalPages;
  const filteredEntries = filterLeaderboardEntries(entries, search);
  const visibleEntries = sortLeaderboardEntries(filteredEntries, sort);
  const hasActiveSearch = search.trim().length > 0;
  const tableEmptyState =
    hasActiveSearch && entries.length > 0 ? filteredEmptyState : emptyState;
  const handleSubjectTypeChange = (value: LeaderboardSubjectType) => {
    if (value === subjectType) {
      return;
    }

    setSubjectType(value);
    setPage(DEFAULT_PAGE);
  };
  let leaderboardDescription = 'Ranked by total XP across users.';

  if (!isAdmin) {
    leaderboardDescription =
      'Ranked by total XP across users. Team rankings are only available in admin view.';
  } else if (visibleSubjectType === 'group') {
    leaderboardDescription = 'Ranked by total XP across teams.';
  }

  return (
    <Flex direction="column" gap="4">
      <HeaderPage title="Leaderboard" />
      <Text color="secondary">{leaderboardDescription}</Text>

      {!error ? (
        <LeaderboardToolbar
          isAdmin={isAdmin}
          isLoading={loading}
          search={search}
          subjectType={visibleSubjectType}
          totalCount={entries.length}
          visibleCount={visibleEntries.length}
          onSearchChange={setSearch}
          onSubjectTypeChange={handleSubjectTypeChange}
        />
      ) : null}

      {loading ? renderLoadingState() : null}

      {!loading && error ? (
        <Alert
          status="danger"
          icon
          title="Unable to load leaderboard"
          description={error}
        />
      ) : null}

      {!loading && !error ? (
        <Flex direction="column" gap="3">
          <Table
            columnConfig={leaderboardColumns}
            data={visibleEntries}
            emptyState={tableEmptyState}
            pagination={{ type: 'none' }}
            sort={{
              descriptor: sort,
              onSortChange: setSort,
            }}
          />

          <Flex align="center" justify="between" gap="3">
            <Text color="secondary">
              Page {pagination.page} of {pagination.totalPages}
            </Text>

            <Flex gap="2">
              <Button
                size="small"
                variant="secondary"
                onPress={() => setPage(pagination.page - 1)}
                isDisabled={!canGoToPreviousPage}
              >
                Previous
              </Button>
              <Button
                size="small"
                variant="secondary"
                onPress={() => setPage(pagination.page + 1)}
                isDisabled={!canGoToNextPage}
              >
                Next
              </Button>
            </Flex>
          </Flex>
        </Flex>
      ) : null}
    </Flex>
  );
};
