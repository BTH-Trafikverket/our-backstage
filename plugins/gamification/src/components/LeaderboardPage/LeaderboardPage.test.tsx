import { render, screen, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import userEvent from '@testing-library/user-event';
import { LeaderboardPage } from './LeaderboardPage';

describe('LeaderboardPage', () => {
  const baseUrl = 'http://example.test/api/gamification';

  const createLeaderboardResponse = (
    data: Array<{
      rank: number;
      subjectRef: string;
      totalXp: number;
    }>,
    options?: {
      subjectType?: 'user' | 'group';
      timeRange?: 'weekly' | 'monthly' | 'alltime';
      pagination?: {
        page?: number;
        limit?: number;
        total?: number;
        totalPages?: number;
      };
    },
  ) => ({
    subjectType: options?.subjectType ?? ('user' as const),
    timeRange: options?.timeRange ?? ('alltime' as const),
    data,
    pagination: {
      page: options?.pagination?.page ?? 1,
      limit: options?.pagination?.limit ?? 25,
      total: options?.pagination?.total ?? data.length,
      totalPages: options?.pagination?.totalPages ?? 1,
    },
  });

  const createJsonResponse = (body: unknown, init?: ResponseInit) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });

  const createPaginatedFetchImpl = (
    rows: Array<{
      rank: number;
      subjectRef: string;
      totalXp: number;
    }>,
    options?: {
      subjectType?: 'user' | 'group';
      timeRange?: 'weekly' | 'monthly' | 'alltime';
    },
  ) =>
    jest.fn(async (input: string) => {
      const url = new URL(input);
      const page = Number(url.searchParams.get('page') ?? '1');
      const limit = Number(url.searchParams.get('limit') ?? '25');
      const offset = (page - 1) * limit;
      const pagedRows = rows.slice(offset, offset + limit);

      return createJsonResponse(
        createLeaderboardResponse(pagedRows, {
          subjectType: options?.subjectType,
          timeRange: options?.timeRange,
          pagination: {
            page,
            limit,
            total: rows.length,
            totalPages: rows.length > 0 ? Math.ceil(rows.length / limit) : 0,
          },
        }),
      );
    });

  function renderPage(fetchImpl: jest.Mock) {
    const discoveryApi = {
      getBaseUrl: jest.fn(async () => baseUrl),
    };
    const fetchApi = {
      fetch: fetchImpl,
    };

    return {
      ...render(
        <TestApiProvider
          apis={[
            [discoveryApiRef, discoveryApi as any],
            [fetchApiRef, fetchApi as any],
          ]}
        >
          <LeaderboardPage />
        </TestApiProvider>,
      ),
      discoveryApi,
      fetchApi,
    };
  }

  const getVisibleNames = () =>
    screen.getAllByRole('rowheader').map(cell => cell.textContent);

  it('shows a loading state while the leaderboard request is in flight', async () => {
    const fetchImpl = jest.fn(() => new Promise<Response>(() => {}));

    const { fetchApi } = renderPage(fetchImpl);

    expect(screen.getByText('Loading leaderboard...')).toBeInTheDocument();
    await waitFor(() => expect(fetchApi.fetch).toHaveBeenCalledTimes(1));
  });

  it('renders leaderboard rows from the backend response', async () => {
    const fetchImpl = jest.fn(async () =>
      createJsonResponse(
        createLeaderboardResponse(
          [
            {
              rank: 1,
              subjectRef: 'user:default/alice-andersson',
              totalXp: 1480,
            },
            {
              rank: 2,
              subjectRef: 'user:default/bob-berg',
              totalXp: 1260,
            },
          ],
          {
            pagination: {
              page: 1,
              limit: 100,
              total: 2,
              totalPages: 1,
            },
          },
        ),
      ),
    );

    const { fetchApi } = renderPage(fetchImpl);

    expect(await screen.findByText('Alice Andersson')).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Rank' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Name' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Points' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Bob Berg')).toBeInTheDocument();
    expect(screen.getByText('1480')).toBeInTheDocument();
    expect(screen.getByText('1260')).toBeInTheDocument();
    expect(
      screen.getByRole('searchbox', { name: 'Search leaderboard' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Page size' })).toHaveValue(
      '25',
    );
    expect(
      screen.getByText('Showing 2 of 2 leaderboard entries'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'All time rankings for individuals, ordered by total XP.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Individuals' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Teams' })).toBeInTheDocument();
    expect(screen.getByText('Scope')).toBeInTheDocument();
    expect(screen.getByText('Time')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Weekly' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Monthly' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'All time' }),
    ).toBeInTheDocument();
    expect(fetchApi.fetch).toHaveBeenCalledWith(
      `${baseUrl}/leaderboard?subjectType=user&timeRange=alltime&page=1&limit=100`,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('filters the full leaderboard, resets to page one, and removes empty pages', async () => {
    const user = userEvent.setup();
    const rows = [
      {
        rank: 1,
        subjectRef: 'user:default/alice-andersson',
        totalXp: 1480,
      },
      {
        rank: 2,
        subjectRef: 'user:default/cora-clark',
        totalXp: 1400,
      },
      {
        rank: 3,
        subjectRef: 'user:default/dana-doe',
        totalXp: 1320,
      },
      {
        rank: 4,
        subjectRef: 'user:default/bob-berg',
        totalXp: 1260,
      },
      {
        rank: 5,
        subjectRef: 'user:default/evan-ellis',
        totalXp: 1180,
      },
      {
        rank: 6,
        subjectRef: 'user:default/bea-brooks',
        totalXp: 1110,
      },
      {
        rank: 7,
        subjectRef: 'user:default/zoe-zimmer',
        totalXp: 980,
      },
    ];
    const fetchImpl = createPaginatedFetchImpl(rows);

    const { fetchApi } = renderPage(fetchImpl);

    expect(await screen.findByText('Alice Andersson')).toBeInTheDocument();

    const pageSizeInput = screen.getByRole('textbox', { name: 'Page size' });
    await user.clear(pageSizeInput);
    await user.type(pageSizeInput, '3');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(screen.getByText('Page 2 of 3')).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(screen.getByText('Page 3 of 3')).toBeInTheDocument(),
    );
    expect(screen.getByText('Zoe Zimmer')).toBeInTheDocument();

    await user.type(
      screen.getByRole('searchbox', { name: 'Search leaderboard' }),
      'b',
    );

    await waitFor(() =>
      expect(screen.getByText('Page 1 of 1')).toBeInTheDocument(),
    );
    expect(getVisibleNames()).toEqual(['Bob Berg', 'Bea Brooks']);
    expect(
      screen.getByText('Showing 2 of 2 leaderboard entries (7 total)'),
    ).toBeInTheDocument();
    expect(fetchApi.fetch).toHaveBeenCalledTimes(1);
  });

  it('switches to team rankings and refetches with the group subject type', async () => {
    const user = userEvent.setup();
    const fetchImpl = jest.fn(async (input: string) => {
      const subjectType =
        new URL(input).searchParams.get('subjectType') === 'group'
          ? 'group'
          : 'user';

      return createJsonResponse(
        createLeaderboardResponse(
          [
            subjectType === 'group'
              ? {
                  rank: 1,
                  subjectRef: 'group:default/platform',
                  totalXp: 1480,
                }
              : {
                  rank: 1,
                  subjectRef: 'user:default/alice-andersson',
                  totalXp: 1480,
                },
          ],
          {
            subjectType,
            pagination: {
              page: 1,
              limit: 100,
              total: 1,
              totalPages: 1,
            },
          },
        ),
      );
    });

    const { fetchApi } = renderPage(fetchImpl);

    expect(await screen.findByText('Alice Andersson')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Teams' }));

    expect(await screen.findByText('Platform')).toBeInTheDocument();
    expect(
      screen.getByText('All time rankings for teams, ordered by total XP.'),
    ).toBeInTheDocument();
    expect(fetchApi.fetch).toHaveBeenNthCalledWith(
      2,
      `${baseUrl}/leaderboard?subjectType=group&timeRange=alltime&page=1&limit=100`,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  }, 15_000);

  it('switches time range and refetches with the selected backend parameter', async () => {
    const user = userEvent.setup();
    const fetchImpl = jest.fn(async (input: string) => {
      const timeRange =
        (new URL(input).searchParams.get('timeRange') as
          | 'weekly'
          | 'monthly'
          | 'alltime'
          | null) ?? 'alltime';

      return createJsonResponse(
        createLeaderboardResponse(
          [
            {
              rank: 1,
              subjectRef:
                timeRange === 'weekly'
                  ? 'user:default/bob-berg'
                  : 'user:default/alice-andersson',
              totalXp: timeRange === 'weekly' ? 320 : 1480,
            },
          ],
          {
            timeRange,
            pagination: {
              page: 1,
              limit: 100,
              total: 1,
              totalPages: 1,
            },
          },
        ),
      );
    });

    const { fetchApi } = renderPage(fetchImpl);

    expect(await screen.findByText('Alice Andersson')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Weekly' }));

    expect(await screen.findByText('Bob Berg')).toBeInTheDocument();
    expect(
      screen.getByText('Weekly rankings for individuals, ordered by total XP.'),
    ).toBeInTheDocument();
    expect(fetchApi.fetch).toHaveBeenNthCalledWith(
      2,
      `${baseUrl}/leaderboard?subjectType=user&timeRange=weekly&page=1&limit=100`,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('updates local pagination when page size changes and resets to page one', async () => {
    const user = userEvent.setup();
    const rows = Array.from({ length: 30 }, (_, index) => ({
      rank: index + 1,
      subjectRef: `user:default/user-${String(index + 1).padStart(2, '0')}`,
      totalXp: 1000 - index,
    }));
    const fetchImpl = createPaginatedFetchImpl(rows);

    const { fetchApi } = renderPage(fetchImpl);

    expect(await screen.findByText('User 01')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() =>
      expect(screen.getByText('Page 2 of 2')).toBeInTheDocument(),
    );
    expect(screen.getByText('User 26')).toBeInTheDocument();

    const pageSizeInput = screen.getByRole('textbox', { name: 'Page size' });
    await user.clear(pageSizeInput);
    await user.type(pageSizeInput, '20');

    await waitFor(() =>
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument(),
    );
    expect(pageSizeInput).toHaveValue('20');
    expect(screen.getByText('User 01')).toBeInTheDocument();
    expect(screen.queryByText('User 26')).not.toBeInTheDocument();
    expect(fetchApi.fetch).toHaveBeenCalledTimes(1);
  });

  it('clamps invalid page sizes back into the supported range on blur', async () => {
    const user = userEvent.setup();
    const rows = Array.from({ length: 9 }, (_, index) => ({
      rank: index + 1,
      subjectRef: `user:default/user-${String(index + 1).padStart(2, '0')}`,
      totalXp: 500 - index,
    }));
    const fetchImpl = createPaginatedFetchImpl(rows);

    const { fetchApi } = renderPage(fetchImpl);

    expect(await screen.findByText('User 01')).toBeInTheDocument();

    const pageSizeInput = screen.getByRole('textbox', { name: 'Page size' });
    await user.clear(pageSizeInput);
    await user.type(pageSizeInput, '1');
    await user.tab();

    await waitFor(() =>
      expect(screen.getByText('Page 1 of 3')).toBeInTheDocument(),
    );
    expect(pageSizeInput).toHaveValue('3');
    expect(getVisibleNames()).toEqual(['User 01', 'User 02', 'User 03']);
    expect(fetchApi.fetch).toHaveBeenCalledTimes(1);
  });

  it('sorts the full leaderboard before paginating', async () => {
    const user = userEvent.setup();
    const rows = [
      {
        rank: 1,
        subjectRef: 'user:default/zara-zane',
        totalXp: 220,
      },
      {
        rank: 2,
        subjectRef: 'user:default/yara-young',
        totalXp: 310,
      },
      {
        rank: 3,
        subjectRef: 'user:default/xena-xavier',
        totalXp: 140,
      },
      {
        rank: 4,
        subjectRef: 'user:default/alice-andersson',
        totalXp: 180,
      },
      {
        rank: 5,
        subjectRef: 'user:default/bob-berg',
        totalXp: 170,
      },
      {
        rank: 6,
        subjectRef: 'user:default/charlie-dahl',
        totalXp: 160,
      },
    ];
    const fetchImpl = createPaginatedFetchImpl(rows);

    renderPage(fetchImpl);
    expect(await screen.findByText('Zara Zane')).toBeInTheDocument();

    const pageSizeInput = screen.getByRole('textbox', { name: 'Page size' });
    await user.clear(pageSizeInput);
    await user.type(pageSizeInput, '3');
    await user.tab();

    expect(getVisibleNames()).toEqual([
      'Zara Zane',
      'Yara Young',
      'Xena Xavier',
    ]);

    await user.click(screen.getByText('Name'));

    await waitFor(() =>
      expect(getVisibleNames()).toEqual([
        'Alice Andersson',
        'Bob Berg',
        'Charlie Dahl',
      ]),
    );
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() =>
      expect(getVisibleNames()).toEqual([
        'Xena Xavier',
        'Yara Young',
        'Zara Zane',
      ]),
    );
  });

  it('shows an empty state when the backend returns no leaderboard rows', async () => {
    const fetchImpl = jest.fn(async () =>
      createJsonResponse(createLeaderboardResponse([])),
    );

    renderPage(fetchImpl);

    expect(
      await screen.findByText('No leaderboard entries to show.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('No one has earned any points yet.'),
    ).toBeInTheDocument();
  });

  it('shows an error state when the leaderboard request fails', async () => {
    const fetchImpl = jest.fn(async () =>
      createJsonResponse(
        { message: 'Leaderboard request failed' },
        {
          status: 500,
          statusText: 'Internal Server Error',
        },
      ),
    );

    renderPage(fetchImpl);

    expect(
      await screen.findByText('Unable to load leaderboard'),
    ).toBeInTheDocument();
    expect(screen.getByText('Leaderboard request failed')).toBeInTheDocument();
  });

  it('loads additional backend pages before paginating locally', async () => {
    const user = userEvent.setup();
    const rows = Array.from({ length: 101 }, (_, index) => ({
      rank: index + 1,
      subjectRef: `user:default/user-${String(index + 1).padStart(3, '0')}`,
      totalXp: 2000 - index,
    }));
    const fetchImpl = createPaginatedFetchImpl(rows);

    const { fetchApi } = renderPage(fetchImpl);

    expect(await screen.findByText('User 001')).toBeInTheDocument();
    await waitFor(() => expect(fetchApi.fetch).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Page 1 of 5')).toBeInTheDocument();
    expect(fetchApi.fetch).toHaveBeenNthCalledWith(
      1,
      `${baseUrl}/leaderboard?subjectType=user&timeRange=alltime&page=1&limit=100`,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
    expect(fetchApi.fetch).toHaveBeenNthCalledWith(
      2,
      `${baseUrl}/leaderboard?subjectType=user&timeRange=alltime&page=2&limit=100`,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );

    for (let step = 0; step < 4; step += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }));
    }

    await waitFor(() =>
      expect(screen.getByText('Page 5 of 5')).toBeInTheDocument(),
    );
    expect(screen.getByText('User 101')).toBeInTheDocument();
  }, 15_000);
});
