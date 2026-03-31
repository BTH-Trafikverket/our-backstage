import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CellText,
  Flex,
  HeaderPage,
  SearchField,
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
  subjectType: LeaderboardApiRow['subjectType'];
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
type LeaderboardPageProps = {
  isAdmin?: boolean;
};

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const TEMPORARY_LEADERBOARD_UI_MOCK_ENABLED = true;
const TEMPORARY_LEADERBOARD_UI_MOCK_PAGE_SIZE = 3;

// TEMPORARY UI VERIFICATION LOGIC:
// Keep a small in-memory leaderboard dataset here until the backend route is
// available again in the running environment. Switch the flag above back to
// false to restore real API loading.
const TEMPORARY_LEADERBOARD_UI_MOCK_ROWS: readonly LeaderboardApiRow[] = [
  {
    rank: 1,
    subjectRef: 'user:default/alice-andersson',
    subjectType: 'user',
    totalXp: 1480,
  },
  {
    rank: 2,
    subjectRef: 'group:default/platform-team',
    subjectType: 'group',
    totalXp: 1325,
  },
  {
    rank: 3,
    subjectRef: 'user:default/bob-berg',
    subjectType: 'user',
    totalXp: 1260,
  },
  {
    rank: 4,
    subjectRef: 'group:default/search-and-discovery',
    subjectType: 'group',
    totalXp: 1180,
  },
  {
    rank: 5,
    subjectRef: 'user:default/charlie-dahl',
    subjectType: 'user',
    totalXp: 1090,
  },
  {
    rank: 6,
    subjectRef: 'user:default/dana-ek',
    subjectType: 'user',
    totalXp: 980,
  },
  {
    rank: 7,
    subjectRef: 'group:default/ops-guild',
    subjectType: 'group',
    totalXp: 930,
  },
];

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

const filteredEmptyState = (
  <Flex
    direction="column"
    align="center"
    justify="center"
    gap="2"
    style={{ minHeight: '12rem' }}
  >
    <Text weight="bold">No leaderboard entries match your search.</Text>
  </Flex>
);

const visibilityEmptyState = (
  <Flex
    direction="column"
    align="center"
    justify="center"
    gap="2"
    style={{ minHeight: '12rem' }}
  >
    <Text weight="bold">No visible leaderboard entries to show.</Text>
    <Text color="secondary">
      Non-admin view uses a frontend fallback that hides team rows because the
      current leaderboard response has no row-level visibility field.
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
      subjectType: row.subjectType,
    }));
};

const createTemporaryMockLeaderboardResponse = (
  page: number,
  limit: number,
): LeaderboardResponse => {
  const total = TEMPORARY_LEADERBOARD_UI_MOCK_ROWS.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const normalizedPage = Math.min(Math.max(page, DEFAULT_PAGE), totalPages);
  const startIndex = (normalizedPage - 1) * limit;

  return {
    subjectType: 'user',
    timeRange: 'alltime',
    data: TEMPORARY_LEADERBOARD_UI_MOCK_ROWS.slice(
      startIndex,
      startIndex + limit,
    ),
    pagination: {
      page: normalizedPage,
      limit,
      total,
      totalPages,
    },
  };
};

const applyLeaderboardVisibility = (
  entries: LeaderboardEntry[],
  isAdmin: boolean,
): LeaderboardEntry[] => {
  // The current leaderboard row model has subjectType but no explicit
  // visibility flag, so non-admins only see individual user rows.
  if (isAdmin) {
    return entries;
  }

  return entries.filter(entry => entry.subjectType === 'user');
};

const filterLeaderboardEntries = (
  entries: LeaderboardEntry[],
  search: string,
): LeaderboardEntry[] => {
  const normalizedSearch = search.trim().toLowerCase();

  if (!normalizedSearch) {
    return entries;
  }

  return entries.filter(entry =>
    entry.name.toLowerCase().includes(normalizedSearch),
  );
};

export const LeaderboardPage = ({ isAdmin = false }: LeaderboardPageProps) => {
  const fetchApi = useApi(fetchApiRef);
  const discoveryApi = useApi(discoveryApiRef);

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [search, setSearch] = useState('');
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

        if (TEMPORARY_LEADERBOARD_UI_MOCK_ENABLED) {
          // TEMPORARY UI VERIFICATION LOGIC:
          // Keep the loading state visible briefly while paging through a local
          // mock dataset that mirrors the real API response shape.
          await new Promise(resolve => window.setTimeout(resolve, 0));

          if (cancelled || controller.signal.aborted) {
            return;
          }

          const result = createTemporaryMockLeaderboardResponse(
            page,
            TEMPORARY_LEADERBOARD_UI_MOCK_PAGE_SIZE,
          );
          const nextPagination = normalizePagination(result.pagination);
          pageSizeRef.current = nextPagination.limit;
          setEntries(normalizeLeaderboardEntries(result));
          setPagination(nextPagination);
          return;
        }

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
  const visibleEntries = applyLeaderboardVisibility(entries, isAdmin);
  const hasActiveSearch = search.trim().length > 0;
  const filteredEntries = filterLeaderboardEntries(visibleEntries, search);
  const pageTitle = isAdmin ? 'Leaderboard' : 'Your Leaderboard';
  const leaderboardDescription = isAdmin
    ? 'Ranked by total XP across users and teams.'
    : 'Ranked by total XP for visible user entries.';
  let tableEmptyState = emptyState;

  if (!isAdmin && entries.length > 0 && visibleEntries.length === 0) {
    tableEmptyState = visibilityEmptyState;
  } else if (hasActiveSearch && visibleEntries.length > 0) {
    tableEmptyState = filteredEmptyState;
  }

  return (
    <Flex direction="column" gap="4">
      <HeaderPage title={pageTitle} />
      <Text color="secondary">{leaderboardDescription}</Text>
      {!isAdmin ? (
        <Text color="secondary">
          Frontend visibility fallback: team rows are hidden for non-admins
          because the current leaderboard response does not include visibility
          metadata.
        </Text>
      ) : null}
      {TEMPORARY_LEADERBOARD_UI_MOCK_ENABLED ? (
        <Text color="secondary">
          Temporary mock data is enabled for UI verification.
        </Text>
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
          <Box
            style={{
              width: '100%',
              maxWidth: '24rem',
            }}
          >
            <SearchField
              aria-label="Filter leaderboard by name"
              placeholder="Filter by name"
              size="medium"
              value={search}
              onChange={setSearch}
            />
          </Box>

          <Table
            columnConfig={leaderboardColumns}
            data={filteredEntries}
            emptyState={tableEmptyState}
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
