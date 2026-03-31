import { render, screen } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import userEvent from '@testing-library/user-event';
import { LeaderboardPage } from './LeaderboardPage';

describe('LeaderboardPage', () => {
  const baseUrl = 'http://example.test/api/gamification';

  function renderPage(options?: { isAdmin?: boolean }) {
    const discoveryApi = {
      getBaseUrl: jest.fn(async () => baseUrl),
    };
    const fetchApi = {
      fetch: jest.fn(async () => new Response(null, { status: 200 })),
    };

    return {
      ...render(
        <TestApiProvider
          apis={[
            [discoveryApiRef, discoveryApi as any],
            [fetchApiRef, fetchApi as any],
          ]}
        >
          <LeaderboardPage isAdmin={options?.isAdmin} />
        </TestApiProvider>,
      ),
      fetchApi,
    };
  }

  it('shows a loading state before temporary mock rows render', async () => {
    const { fetchApi } = renderPage({ isAdmin: true });

    expect(screen.getByText('Loading leaderboard...')).toBeInTheDocument();
    expect(await screen.findByText('Alice Andersson')).toBeInTheDocument();
    expect(fetchApi.fetch).not.toHaveBeenCalled();
  });

  it('renders temporary mock leaderboard rows for UI verification', async () => {
    const { fetchApi } = renderPage({ isAdmin: true });

    expect(
      await screen.findByRole('heading', { name: 'Leaderboard' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Alice Andersson')).toBeInTheDocument();
    expect(screen.getByText('Platform Team')).toBeInTheDocument();
    expect(screen.getByText('1480')).toBeInTheDocument();
    expect(
      screen.getByText('Ranked by total XP across users and teams.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Temporary mock data is enabled for UI verification.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Rank' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Name' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Points' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    expect(fetchApi.fetch).not.toHaveBeenCalled();
  });

  it('filters temporary mock rows by name on the client side', async () => {
    const user = userEvent.setup();

    renderPage({ isAdmin: true });
    await screen.findByText('Alice Andersson');

    const searchInput = screen.getByRole('searchbox', {
      name: 'Filter leaderboard by name',
    });

    await user.type(searchInput, 'platform');

    expect(screen.getByText('Platform Team')).toBeInTheDocument();
    expect(screen.queryByText('Alice Andersson')).not.toBeInTheDocument();

    await user.clear(searchInput);
    await user.type(searchInput, 'nomatch');

    expect(
      screen.getByText('No leaderboard entries match your search.'),
    ).toBeInTheDocument();
  });

  it('hides group rows from the temporary mock leaderboard for non-admins', async () => {
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Your Leaderboard' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Alice Andersson')).toBeInTheDocument();
    expect(screen.getByText('Bob Berg')).toBeInTheDocument();
    expect(screen.queryByText('Platform Team')).not.toBeInTheDocument();
    expect(
      screen.getByText('Ranked by total XP for visible user entries.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Frontend visibility fallback: team rows are hidden for non-admins because the current leaderboard response does not include visibility metadata.',
      ),
    ).toBeInTheDocument();
  });

  it('pages through the temporary mock leaderboard data', async () => {
    const user = userEvent.setup();

    renderPage({ isAdmin: true });
    expect(await screen.findByText('Alice Andersson')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Search And Discovery')).toBeInTheDocument();
    expect(screen.getByText('Charlie Dahl')).toBeInTheDocument();
    expect(screen.getByText('Dana Ek')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
  });

  it('shows the visibility empty state on a mock page with only hidden rows', async () => {
    const user = userEvent.setup();

    renderPage();
    expect(await screen.findByText('Alice Andersson')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Charlie Dahl')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(
      await screen.findByText('No visible leaderboard entries to show.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Non-admin view uses a frontend fallback that hides team rows because the current leaderboard response has no row-level visibility field.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();
  });
});
