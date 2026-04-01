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
type LeaderboardTimeRange = 'weekly' | 'monthly' | 'alltime';

type LeaderboardApiRow = {
  rank: number;
  subjectRef: string;
  subjectType: LeaderboardSubjectType;
  totalXp: number;
};

type LeaderboardResponse = {
  subjectType: LeaderboardSubjectType;
  timeRange: LeaderboardTimeRange;
  data: LeaderboardApiRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type LeaderboardPagination = LeaderboardResponse['pagination'];

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MIN_PAGE_SIZE = 3;
const MAX_PAGE_SIZE = 25;

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

const clampPageSize = (value: number) =>
  Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, Math.floor(value)));

const parsePageSizeInput = (value: string) => {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const getSubjectTypeLabel = (subjectType: LeaderboardSubjectType) =>
  subjectType === 'group' ? 'Teams' : 'Individuals';

const getTimeRangeLabel = (timeRange: LeaderboardTimeRange) => {
  if (timeRange === 'weekly') {
    return 'Weekly';
  }

  if (timeRange === 'monthly') {
    return 'Monthly';
  }

  return 'All time';
};

const getLeaderboardDescription = (
  subjectType: LeaderboardSubjectType,
  timeRange: LeaderboardTimeRange,
) =>
  `${getTimeRangeLabel(timeRange)} rankings for ${getSubjectTypeLabel(
    subjectType,
  ).toLocaleLowerCase('en-US')}, ordered by total XP.`;

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

export const LeaderboardPage = () => {
  const fetchApi = useApi(fetchApiRef);
  const discoveryApi = useApi(discoveryApiRef);

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortDescriptor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [subjectType, setSubjectType] =
    useState<LeaderboardSubjectType>('user');
  const [timeRange, setTimeRange] = useState<LeaderboardTimeRange>('alltime');
  const [page, setPage] = useState(DEFAULT_PAGE);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [pageSizeInput, setPageSizeInput] = useState(String(DEFAULT_PAGE_SIZE));
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
    let cancelled = false;
    const controller = new AbortController();

    const loadLeaderboard = async () => {
      try {
        setLoading(true);
        setError(undefined);
        const url = await buildGamificationUrl('/leaderboard', {
          subjectType,
          timeRange,
          page: String(page),
          limit: String(pageSize),
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
          if (nextPagination.limit !== pageSize) {
            setPageSize(nextPagination.limit);
          }
          if (nextPagination.page !== page) {
            setPage(nextPagination.page);
          }
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
  }, [buildGamificationUrl, fetchApi, page, pageSize, subjectType, timeRange]);

  useEffect(() => {
    setPageSizeInput(String(pageSize));
  }, [pageSize]);

  const canGoToPreviousPage = pagination.page > 1;
  const canGoToNextPage =
    pagination.total > 0 && pagination.page < pagination.totalPages;
  const filteredEntries = filterLeaderboardEntries(entries, search);
  const visibleEntries = sortLeaderboardEntries(filteredEntries, sort);
  const hasActiveSearch = search.trim().length > 0;
  const tableEmptyState =
    hasActiveSearch && entries.length > 0 ? filteredEmptyState : emptyState;
  const leaderboardDescription = getLeaderboardDescription(
    subjectType,
    timeRange,
  );
  const handleSubjectTypeChange = (nextSubjectType: LeaderboardSubjectType) => {
    if (nextSubjectType === subjectType) {
      return;
    }

    setSubjectType(nextSubjectType);
    setPage(DEFAULT_PAGE);
  };
  const handleTimeRangeChange = (nextTimeRange: LeaderboardTimeRange) => {
    if (nextTimeRange === timeRange) {
      return;
    }

    setTimeRange(nextTimeRange);
    setPage(DEFAULT_PAGE);
  };
  const commitPageSize = useCallback(
    (nextPageSize: number) => {
      const normalizedPageSize = clampPageSize(nextPageSize);
      setPageSizeInput(String(normalizedPageSize));

      if (normalizedPageSize === pageSize) {
        return;
      }

      setPageSize(normalizedPageSize);
      setPage(DEFAULT_PAGE);
    },
    [pageSize],
  );
  const handlePageSizeChange = (value: string) => {
    const sanitizedValue = value.replace(/[^\d]/g, '');
    setPageSizeInput(sanitizedValue);

    const parsedPageSize = parsePageSizeInput(sanitizedValue);
    if (
      parsedPageSize === null ||
      parsedPageSize < MIN_PAGE_SIZE ||
      parsedPageSize > MAX_PAGE_SIZE
    ) {
      return;
    }

    commitPageSize(parsedPageSize);
  };
  const handlePageSizeBlur = () => {
    const parsedPageSize = parsePageSizeInput(pageSizeInput);

    if (parsedPageSize === null) {
      setPageSizeInput(String(pageSize));
      return;
    }

    commitPageSize(parsedPageSize);
  };

  return (
    <Flex direction="column" gap="4">
      <HeaderPage title="Leaderboard" />
      <Text color="secondary">{leaderboardDescription}</Text>

      {!error ? (
        <LeaderboardToolbar
          isLoading={loading}
          search={search}
          subjectType={subjectType}
          timeRange={timeRange}
          pageCount={entries.length}
          pageSize={pageSizeInput}
          totalCount={pagination.total}
          visibleCount={visibleEntries.length}
          onSearchChange={setSearch}
          onPageSizeBlur={handlePageSizeBlur}
          onPageSizeChange={handlePageSizeChange}
          onSubjectTypeChange={handleSubjectTypeChange}
          onTimeRangeChange={handleTimeRangeChange}
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
