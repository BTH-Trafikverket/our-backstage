import { useCallback, useEffect, useRef, useState } from 'react';
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
} from '@backstage/ui';
import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { formatSubjectName, readErrorMessage } from '../QuestsPage/utils';

type LeaderboardEntry = {
  id: string;
  rank: number;
  name: string;
  points: number;
};

type LeaderboardApiRow = {
  rank: number;
  subjectRef: string;
  subjectType: 'user' | 'group';
  totalXp: number;
};

type LeaderboardResponse = {
  subjectType: 'user' | 'group';
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

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;

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
    <Text color="secondary">No one has earned any points yet.</Text>
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

export const LeaderboardPage = () => {
  const fetchApi = useApi(fetchApiRef);
  const discoveryApi = useApi(discoveryApiRef);

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [page, setPage] = useState(DEFAULT_PAGE);
  const [pagination, setPagination] = useState<LeaderboardPagination>(
    createDefaultPagination(),
  );
  const pageSizeRef = useRef(DEFAULT_PAGE_SIZE);

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
          page: String(page),
          limit: String(pageSizeRef.current),
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
          pageSizeRef.current = nextPagination.limit;
          setEntries(normalizeLeaderboardEntries(result));
          setPagination(nextPagination);
        }
      } catch (e: any) {
        if (controller.signal.aborted) {
          return;
        }

        if (!cancelled) {
          pageSizeRef.current = DEFAULT_PAGE_SIZE;
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
  }, [buildGamificationUrl, fetchApi, page]);

  const canGoToPreviousPage = pagination.page > 1;
  const canGoToNextPage =
    pagination.total > 0 && pagination.page < pagination.totalPages;

  return (
    <Flex direction="column" gap="4">
      <HeaderPage title="Leaderboard" />
      <Text color="secondary">Ranked by total XP.</Text>

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
            data={entries}
            emptyState={emptyState}
            pagination={{ type: 'none' }}
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
