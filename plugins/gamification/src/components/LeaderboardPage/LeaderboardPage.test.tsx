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
  ) => ({
    subjectType: 'user' as const,
    timeRange: 'alltime' as const,
    data,
    pagination: {
      page: 1,
      limit: 25,
      total: data.length,
      totalPages: 1,
    },
  });

  const createJsonResponse = (body: unknown, init?: ResponseInit) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });

  function renderPage(
    fetchImpl: jest.Mock,
    options?: {
      isAdmin?: boolean;
      actualIsAdmin?: boolean;
      onToggleDemo?: () => void;
      isDemoMode?: boolean;
    },
  ) {
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
          <LeaderboardPage
            isAdmin={options?.isAdmin ?? false}
            actualIsAdmin={options?.actualIsAdmin}
            onToggleDemo={options?.onToggleDemo}
            isDemoMode={options?.isDemoMode}
          />
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
      screen.getByText('Ranked by total XP across individuals.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Admin view')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Admin leaderboard view'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Preview .* view/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Scope')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Individuals' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Teams' }),
    ).not.toBeInTheDocument();
    expect(fetchApi.fetch).toHaveBeenCalledWith(
      `${baseUrl}/leaderboard?subjectType=user&page=1&limit=25`,
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

  it('shows an admin-specific leaderboard header for admins', async () => {
    const fetchImpl = jest.fn(async () =>
      createJsonResponse(
        createLeaderboardResponse([
          {
            rank: 1,
            subjectRef: 'user:default/alice-andersson',
            totalXp: 1480,
          },
        ]),
      ),
    );

    renderPage(fetchImpl, { isAdmin: true });

    expect(await screen.findByText('Alice Andersson')).toBeInTheDocument();
    expect(screen.getByText('Admin view')).toBeInTheDocument();
    expect(screen.getByText('Admin leaderboard view')).toBeInTheDocument();
    expect(
      screen.getByText('Admin view. Ranked by total XP across individuals.'),
    ).toBeInTheDocument();
  });

  it('shows a local preview toggle when preview support is enabled', async () => {
    const user = userEvent.setup();
    const onToggleDemo = jest.fn();
    const fetchImpl = jest.fn(async () =>
      createJsonResponse(
        createLeaderboardResponse([
          {
            rank: 1,
            subjectRef: 'user:default/alice-andersson',
            totalXp: 1480,
          },
        ]),
      ),
    );

    renderPage(fetchImpl, {
      isAdmin: true,
      actualIsAdmin: true,
      onToggleDemo,
    });

    expect(await screen.findByText('Alice Andersson')).toBeInTheDocument();
    const previewButton = screen.getByRole('button', {
      name: 'Preview non-admin view',
    });
    await user.click(previewButton);
    expect(onToggleDemo).toHaveBeenCalledTimes(1);
  });

  it('lets an admin preview the non-admin leaderboard state', async () => {
    const fetchImpl = jest.fn(async () =>
      createJsonResponse(
        createLeaderboardResponse([
          {
            rank: 1,
            subjectRef: 'user:default/alice-andersson',
            totalXp: 1480,
          },
        ]),
      ),
    );

    renderPage(fetchImpl, {
      isAdmin: false,
      actualIsAdmin: true,
      isDemoMode: true,
      onToggleDemo: jest.fn(),
    });

    expect(await screen.findByText('Alice Andersson')).toBeInTheDocument();
    expect(screen.queryByText('Admin view')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Admin leaderboard view'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Ranked by total XP across individuals.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Return to admin view' }),
    ).toBeInTheDocument();
  });

  it('keeps the leaderboard fixed to individual rankings', async () => {
    const fetchImpl = jest.fn(async () =>
      createJsonResponse(
        createLeaderboardResponse([
          {
            rank: 1,
            subjectRef: 'user:default/alice-andersson',
            totalXp: 1480,
          },
        ]),
      ),
    );

    const { fetchApi } = renderPage(fetchImpl);

    expect(await screen.findByText('Alice Andersson')).toBeInTheDocument();
    await waitFor(() => expect(fetchApi.fetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Scope')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Individuals' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Teams' }),
    ).not.toBeInTheDocument();
    expect(fetchApi.fetch).toHaveBeenCalledWith(
      `${baseUrl}/leaderboard?subjectType=user&page=1&limit=25`,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });
});
