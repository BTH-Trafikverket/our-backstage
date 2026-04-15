import { render, screen, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import {
  discoveryApiRef,
  fetchApiRef,
  identityApiRef,
} from '@backstage/core-plugin-api';
import { BadgesCard } from './EntityBadgesCard';

describe('BadgesCard', () => {
  const baseUrl = 'http://example.test/api/gamification';

  function renderCard(fetchImpl: (...args: any[]) => Promise<Response>) {
    const discoveryApi = {
      getBaseUrl: jest.fn(async () => baseUrl),
    };
    const fetchApi = {
      fetch: jest.fn(fetchImpl),
    };
    const identityApi = {
      getCredentials: jest.fn(async () => ({ token: 'test-token' })),
    };

    return {
      ...render(
        <TestApiProvider
          apis={[
            [discoveryApiRef, discoveryApi as any],
            [fetchApiRef, fetchApi as any],
            [identityApiRef, identityApi as any],
          ]}
        >
          <BadgesCard subjectRef="group:default/platform" />
        </TestApiProvider>,
      ),
      fetchApi,
    };
  }

  it('shows a loading state while badges are loading', async () => {
    let resolveResponse!: (value: Response) => void;

    const { container, fetchApi } = renderCard(async (input: any) => {
      if (String(input).includes('badge-images')) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Promise<Response>(resolve => {
        resolveResponse = resolve;
      });
    });

    expect(container.querySelector('.bui-Skeleton')).toBeInTheDocument();
    await waitFor(() => expect(resolveResponse).toBeDefined());
    expect(fetchApi.fetch).toHaveBeenCalledTimes(2);

    const progressCall = fetchApi.fetch.mock.calls.find((call: any[]) =>
      String(call[0]).includes('progress'),
    );
    const requestUrl = String(progressCall![0]);
    expect(requestUrl).toContain('status=earned');
    expect(requestUrl).toContain('sortBy=earned_at');
    expect(requestUrl).toContain('order=desc');
    expect(requestUrl).toContain('limit=100');

    resolveResponse(
      new Response(
        JSON.stringify({
          subjectRefs: ['group:default/platform'],
          badges: [],
          pagination: { total: 0, page: 1, limit: 100, totalPages: 0 },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    await screen.findByText('No earned badges yet.');
  });

  it('shows the empty state when no earned badges exist', async () => {
    renderCard(
      async () =>
        new Response(
          JSON.stringify({
            subjectRefs: ['group:default/platform'],
            badges: [],
            pagination: { total: 0, page: 1, limit: 100, totalPages: 0 },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    );

    expect(
      await screen.findByText('No earned badges yet.'),
    ).toBeInTheDocument();
  });

  it('renders earned badges in a scrollable grid across paginated responses', async () => {
    const { fetchApi } = renderCard(async (input: any) => {
      if (String(input).includes('badge-images')) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const url = new URL(String(input));
      const page = url.searchParams.get('page');

      if (page === '2') {
        return new Response(
          JSON.stringify({
            subjectRefs: ['group:default/platform'],
            badges: [
              {
                id: 'badge-3',
                title: 'Legacy Hero',
                description: 'Archived badge you already earned',
                xp_reward: 10,
                isEarned: true,
                earnedAt: '2026-01-01T00:00:00Z',
                progressSubjectRef: 'group:default/platform',
                progress: {
                  completedRequirements: 2,
                  totalRequirements: 2,
                  percent: 100,
                },
                archived_at: '2026-02-01T00:00:00Z',
                criterias: [{ quest_id: 'quest-3', target_count: 1 }],
              },
            ],
            pagination: { total: 101, page: 2, limit: 100, totalPages: 2 },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      return new Response(
        JSON.stringify({
          subjectRefs: ['group:default/platform'],
          badges: [
            {
              id: 'badge-1',
              title: 'Contributor',
              description: 'Awarded for completing core work',
              xp_reward: 25,
              isEarned: true,
              earnedAt: '2026-01-03T00:00:00Z',
              progressSubjectRef: 'group:default/platform',
              progress: {
                completedRequirements: 1,
                totalRequirements: 1,
                percent: 100,
              },
              criterias: [{ quest_id: 'quest-1', target_count: 1 }],
            },
            {
              id: 'badge-2',
              title: 'Mentor',
              description: 'Awarded for supporting others',
              xp_reward: 40,
              isEarned: true,
              earnedAt: '2026-01-02T00:00:00Z',
              progressSubjectRef: 'group:default/platform',
              progress: {
                completedRequirements: 1,
                totalRequirements: 1,
                percent: 100,
              },
              criterias: [{ quest_id: 'quest-2', target_count: 1 }],
              archived_at: null,
            },
          ],
          pagination: { total: 101, page: 1, limit: 100, totalPages: 2 },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    });

    await waitFor(() => expect(fetchApi.fetch).toHaveBeenCalledTimes(3));
    const page2Call = fetchApi.fetch.mock.calls.find((call: any[]) =>
      String(call[0]).includes('page=2'),
    );
    expect(String(page2Call![0])).toContain('page=2');

    const badgesRegion = await screen.findByRole('region', {
      name: 'Earned badges list',
    });
    expect(badgesRegion).toHaveStyle({ overflowY: 'auto' });

    const contributorBadge = await screen.findByRole('button', {
      name: 'Contributor badge',
    });
    expect(contributorBadge).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Mentor badge' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Legacy Hero badge' }),
    ).toBeInTheDocument();

    expect(contributorBadge).toBeInTheDocument();
  });
});
