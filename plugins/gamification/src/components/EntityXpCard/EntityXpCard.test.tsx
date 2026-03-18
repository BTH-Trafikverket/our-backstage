import { render, screen } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import {
  discoveryApiRef,
  fetchApiRef,
  identityApiRef,
} from '@backstage/core-plugin-api';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { EntityXpCard } from './EntityXpCard';

describe('EntityXpCard', () => {
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
        <EntityProvider
          entity={{
            apiVersion: 'backstage.io/v1alpha1',
            kind: 'Group',
            metadata: { name: 'platform', namespace: 'default' },
          }}
        >
          <EntityXpCard />
        </EntityProvider>
      </TestApiProvider>,
    );
  }

  it('renders xp status returned by the xp endpoint', async () => {
    renderCard(
      async () =>
        new Response(
          JSON.stringify({
            subjectRef: 'group:default/platform',
            totalXp: 250,
            level: 2,
            currentLevelXp: 100,
            nextLevelXp: 400,
            xpIntoLevel: 150,
            xpToNextLevel: 150,
            progress: 0.5,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    );

    expect(await screen.findByText('Level 2')).toBeInTheDocument();
    expect(screen.getByText('250 XP')).toBeInTheDocument();
    expect(screen.getByText('150/300 XP')).toBeInTheDocument();
    expect(screen.getByText('Until level 3')).toBeInTheDocument();
  });
});
