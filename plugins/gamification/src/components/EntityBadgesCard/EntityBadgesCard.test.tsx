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
  const originalConsoleError = console.error;
  let consoleErrorSpy: jest.SpyInstance;

  beforeAll(() => {
    consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation((...args) => {
        const [msg] = args;
        if (
          typeof msg === 'string' &&
          msg.includes('findDOMNode is deprecated')
        ) {
          return;
        }

        originalConsoleError(...args);
      });
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

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

    renderCard(
      () =>
        new Promise<Response>(resolve => {
          resolveResponse = resolve;
        }),
    );

    expect(screen.getByTestId('progress')).toBeInTheDocument();
    await waitFor(() => expect(resolveResponse).toBeDefined());

    resolveResponse(
      new Response(
        JSON.stringify({ subjectRefs: ['group:default/platform'], badges: [] }),
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
                isEarned: true,
                earnedAt: '2026-01-03T00:00:00Z',
                criterias: [{ quest_id: 'quest-1', target_count: 1 }],
              },
              {
                id: 'badge-2',
                title: 'Reviewer',
                description: 'Awarded for code review work',
                isEarned: false,
                earnedAt: null,
                criterias: [{ quest_id: 'quest-2', target_count: 2 }],
                archived_at: null,
              },
              {
                id: 'badge-3',
                title: 'Legacy Hero',
                description: 'Archived badge you already earned',
                isEarned: true,
                earnedAt: '2026-01-01T00:00:00Z',
                archived_at: '2026-02-01T00:00:00Z',
                criterias: [{ quest_id: 'quest-3', target_count: 1 }],
              },
            ],
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
  });
});
