import { render, screen, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import userEvent from '@testing-library/user-event';
import { LeaderboardPage } from './LeaderboardPage';

describe('LeaderboardPage', () => {
  const baseUrl = 'http://example.test/api/gamification';

  function renderPage(fetchImpl: (...args: any[]) => Promise<Response>) {
    const discoveryApi = {
      getBaseUrl: jest.fn(async () => baseUrl),
    };
    const fetchApi = {
      fetch: jest.fn(fetchImpl),
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
      fetchApi,
    };
  }

  it('shows a loading state while leaderboard data is loading', async () => {
    let resolveResponse!: (value: Response) => void;

    renderPage(
      () =>
        new Promise<Response>(resolve => {
          resolveResponse = resolve;
        }),
    );

    expect(screen.getByText('Loading leaderboard...')).toBeInTheDocument();
    await waitFor(() => expect(resolveResponse).toBeDefined());

    resolveResponse(
      new Response(
        JSON.stringify({
          subjectType: 'user',
          timeRange: 'alltime',
          data: [],
          pagination: {
            page: 1,
            limit: 25,
            total: 0,
            totalPages: 0,
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    expect(
      await screen.findByText('No leaderboard entries to show.'),
    ).toBeInTheDocument();
  });

  it('renders leaderboard rows returned by the backend endpoint', async () => {
    const { fetchApi } = renderPage(
      async () =>
        new Response(
          JSON.stringify({
            subjectType: 'user',
            timeRange: 'alltime',
            data: [
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
            ],
            pagination: {
              page: 1,
              limit: 25,
              total: 2,
              totalPages: 1,
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    );

    expect(await screen.findByText('Alice Andersson')).toBeInTheDocument();
    expect(screen.getByText('Platform Team')).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Rank' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Name' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Points' }),
    ).toBeInTheDocument();

    expect(fetchApi.fetch).toHaveBeenCalledTimes(1);
    expect(String(fetchApi.fetch.mock.calls[0][0])).toBe(
      `${baseUrl}/leaderboard?page=1&limit=25`,
    );
  });

  it('requests the next page when the user clicks Next', async () => {
    const user = userEvent.setup();
    const { fetchApi } = renderPage(async (input: any) => {
      const url = new URL(String(input));
      const page = url.searchParams.get('page');

      if (page === '2') {
        return new Response(
          JSON.stringify({
            subjectType: 'user',
            timeRange: 'alltime',
            data: [
              {
                rank: 2,
                subjectRef: 'user:default/bob-berg',
                subjectType: 'user',
                totalXp: 1325,
              },
            ],
            pagination: {
              page: 2,
              limit: 1,
              total: 2,
              totalPages: 2,
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      return new Response(
        JSON.stringify({
          subjectType: 'user',
          timeRange: 'alltime',
          data: [
            {
              rank: 1,
              subjectRef: 'user:default/alice-andersson',
              subjectType: 'user',
              totalXp: 1480,
            },
          ],
          pagination: {
            page: 1,
            limit: 1,
            total: 2,
            totalPages: 2,
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    });

    expect(await screen.findByText('Alice Andersson')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Bob Berg')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(fetchApi.fetch).toHaveBeenCalledTimes(2);
    expect(String(fetchApi.fetch.mock.calls[1][0])).toBe(
      `${baseUrl}/leaderboard?page=2&limit=1`,
    );
  });

  it('shows an error state when the leaderboard request fails', async () => {
    renderPage(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              message: 'Leaderboard backend failed',
            },
          }),
          {
            status: 500,
            statusText: 'Internal Server Error',
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    );

    expect(
      await screen.findByText('Unable to load leaderboard'),
    ).toBeInTheDocument();
    expect(screen.getByText('Leaderboard backend failed')).toBeInTheDocument();
  });

  it('shows an empty state when the backend returns no entries', async () => {
    renderPage(
      async () =>
        new Response(
          JSON.stringify({
            subjectType: 'user',
            timeRange: 'alltime',
            data: [],
            pagination: {
              page: 1,
              limit: 25,
              total: 0,
              totalPages: 0,
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    );

    expect(
      await screen.findByText('No leaderboard entries to show.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('No one has earned any points yet.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
  });
});
