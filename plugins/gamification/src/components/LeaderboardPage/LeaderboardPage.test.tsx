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
        createLeaderboardResponse([
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
        ]),
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
    expect(
      screen.getByText('Showing 2 of 2 leaderboard entries on this page'),
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
      `${baseUrl}/leaderboard?subjectType=user&timeRange=alltime&page=1&limit=25`,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('filters leaderboard rows by name on the current page', async () => {
    const user = userEvent.setup();
    const fetchImpl = jest.fn(async () =>
      createJsonResponse(
        createLeaderboardResponse([
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
        ]),
      ),
    );

    renderPage(fetchImpl);
    expect(await screen.findByText('Alice Andersson')).toBeInTheDocument();

    await user.type(
      screen.getByRole('searchbox', { name: 'Search leaderboard' }),
      'bob',
    );

    expect(screen.getByText('Bob Berg')).toBeInTheDocument();
    expect(screen.queryByText('Alice Andersson')).not.toBeInTheDocument();
    expect(
      screen.getByText('Showing 1 of 2 leaderboard entries on this page'),
    ).toBeInTheDocument();

    await user.clear(
      screen.getByRole('searchbox', { name: 'Search leaderboard' }),
    );
    await user.type(
      screen.getByRole('searchbox', { name: 'Search leaderboard' }),
      'nomatch',
    );

    expect(
      screen.getByText('No leaderboard entries match this search.'),
    ).toBeInTheDocument();
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
          { subjectType },
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
      `${baseUrl}/leaderboard?subjectType=group&timeRange=alltime&page=1&limit=25`,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });

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
          { timeRange },
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
      `${baseUrl}/leaderboard?subjectType=user&timeRange=weekly&page=1&limit=25`,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('sorts leaderboard rows on the current page when a sortable header is used', async () => {
    const user = userEvent.setup();
    const fetchImpl = jest.fn(async () =>
      createJsonResponse(
        createLeaderboardResponse([
          {
            rank: 1,
            subjectRef: 'user:default/charlie-dahl',
            totalXp: 220,
          },
          {
            rank: 2,
            subjectRef: 'user:default/bob-berg',
            totalXp: 310,
          },
          {
            rank: 3,
            subjectRef: 'user:default/alice-andersson',
            totalXp: 140,
          },
        ]),
      ),
    );

    renderPage(fetchImpl);
    expect(await screen.findByText('Charlie Dahl')).toBeInTheDocument();
    expect(getVisibleNames()).toEqual([
      'Charlie Dahl',
      'Bob Berg',
      'Alice Andersson',
    ]);

    await user.click(screen.getByText('Name'));
    expect(getVisibleNames()).toEqual([
      'Alice Andersson',
      'Bob Berg',
      'Charlie Dahl',
    ]);

    await user.click(screen.getByText('Points'));
    expect(getVisibleNames()).toEqual([
      'Alice Andersson',
      'Charlie Dahl',
      'Bob Berg',
    ]);

    await user.click(screen.getByText('Rank'));
    expect(getVisibleNames()).toEqual([
      'Charlie Dahl',
      'Bob Berg',
      'Alice Andersson',
    ]);
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

  it('keeps pagination backed by the server and resets to page one when filters change', async () => {
    const user = userEvent.setup();
    const fetchImpl = jest.fn(async (input: string) => {
      const url = new URL(input);
      const subjectType =
        url.searchParams.get('subjectType') === 'group' ? 'group' : 'user';
      const page = Number(url.searchParams.get('page') ?? '1');

      if (subjectType === 'group') {
        return createJsonResponse(
          createLeaderboardResponse(
            [
              {
                rank: 1,
                subjectRef: 'group:default/platform',
                totalXp: 700,
              },
            ],
            {
              subjectType: 'group',
              pagination: {
                page: 1,
                limit: 25,
                total: 1,
                totalPages: 1,
              },
            },
          ),
        );
      }

      return createJsonResponse(
        createLeaderboardResponse(
          [
            {
              rank: page === 1 ? 1 : 26,
              subjectRef:
                page === 1
                  ? 'user:default/alice-andersson'
                  : 'user:default/bob-berg',
              totalXp: page === 1 ? 900 : 500,
            },
          ],
          {
            pagination: {
              page,
              limit: 25,
              total: 30,
              totalPages: 2,
            },
          },
        ),
      );
    });

    const { fetchApi } = renderPage(fetchImpl);

    expect(await screen.findByText('Alice Andersson')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Bob Berg')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(fetchApi.fetch).toHaveBeenNthCalledWith(
      2,
      `${baseUrl}/leaderboard?subjectType=user&timeRange=alltime&page=2&limit=25`,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Teams' }));

    expect(await screen.findByText('Platform')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
    expect(fetchApi.fetch).toHaveBeenNthCalledWith(
      3,
      `${baseUrl}/leaderboard?subjectType=group&timeRange=alltime&page=1&limit=25`,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });
});
