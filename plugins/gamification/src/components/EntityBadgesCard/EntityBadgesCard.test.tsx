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
        JSON.stringify({ subjectRef: 'group:default/platform', badges: [] }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    await screen.findByText('No badges earned yet.');
  });

  it('shows the empty state when no badges have been earned', async () => {
    renderCard(
      async () =>
        new Response(
          JSON.stringify({ subjectRef: 'group:default/platform', badges: [] }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    );

    expect(
      await screen.findByText('No badges earned yet.'),
    ).toBeInTheDocument();
  });

  it('renders the earned badges returned by the backend', async () => {
    renderCard(
      async () =>
        new Response(
          JSON.stringify({
            subjectRef: 'group:default/platform',
            badges: [
              {
                id: 'badge-1',
                title: 'Contributor',
                description: 'Awarded for completing core work',
                criterias: [{ quest_id: 'quest-1', target_count: 1 }],
              },
              {
                id: 'badge-2',
                title: 'Reviewer',
                description: 'Awarded for code review work',
                criterias: [{ quest_id: 'quest-2', target_count: 2 }],
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
    });
  });
});
