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

    return render(
      <TestApiProvider
        apis={[
          [discoveryApiRef, discoveryApi as any],
          [fetchApiRef, fetchApi as any],
          [identityApiRef, identityApi as any],
        ]}
      >
        <BadgesCard subjectRef="group:default/platform" />
      </TestApiProvider>,
    );
  }

  it('shows a loading state while badges are loading', async () => {
    let resolveResponse!: (value: Response) => void;

    const { container } = renderCard(
      () =>
        new Promise<Response>(resolve => {
          resolveResponse = resolve;
        }),
    );

    expect(container.querySelector('.bui-Skeleton')).toBeInTheDocument();
    await waitFor(() => expect(resolveResponse).toBeDefined());

    resolveResponse(
      new Response(
        JSON.stringify({
          subjectRefs: ['group:default/platform'],
          badges: [],
          pagination: { total: 0, page: 1, limit: 10, pages: 0 },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    await screen.findByText('No badge progress yet.');
  });

  it('shows the empty state when no badge progress exists', async () => {
    renderCard(
      async () =>
        new Response(
          JSON.stringify({
            subjectRefs: ['group:default/platform'],
            badges: [],
            pagination: { total: 0, page: 1, limit: 10, pages: 0 },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    );

    expect(
      await screen.findByText('No badge progress yet.'),
    ).toBeInTheDocument();
  });

  it('renders all badges returned by the badge progress endpoint, including archived earned badges', async () => {
    renderCard(
      async () =>
        new Response(
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
                title: 'Reviewer',
                description: 'Awarded for code review work',
                xp_reward: 40,
                isEarned: false,
                earnedAt: null,
                progressSubjectRef: 'group:default/platform',
                progress: {
                  completedRequirements: 1,
                  totalRequirements: 3,
                  percent: 33,
                },
                criterias: [{ quest_id: 'quest-2', target_count: 2 }],
                archived_at: null,
              },
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
            pagination: { total: 3, page: 1, limit: 10, pages: 1 },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    );

    await waitFor(() => {
      expect(screen.getByText('Contributor')).toBeInTheDocument();
      expect(screen.getByText('Reviewer')).toBeInTheDocument();
      expect(screen.getByText('Legacy Hero')).toBeInTheDocument();
    });

    expect(screen.getByText('25 XP')).toBeInTheDocument();
    expect(screen.getByText('1/3 requirements')).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });
});
