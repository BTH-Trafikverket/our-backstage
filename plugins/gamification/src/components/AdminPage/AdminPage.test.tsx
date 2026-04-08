import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestApiProvider } from '@backstage/test-utils';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { AdminPage } from './AdminPage';

describe('AdminPage webhook event metadata', () => {
  const baseUrl = 'http://example.test/api/gamification';

  const createJsonResponse = (body: unknown, init?: ResponseInit) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });

  const createWebhookListResponse = () =>
    createJsonResponse({
      data: [],
      pagination: {
        total: 0,
        page: 1,
        limit: 10,
        pages: 0,
      },
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
          <AdminPage />
        </TestApiProvider>,
      ),
      discoveryApi,
      fetchApi,
    };
  }

  it('loads and displays placeholders for the selected event', async () => {
    const user = userEvent.setup();
    let resolveMetadataResponse!: (response: Response) => void;

    const fetchImpl = jest.fn(async (input: string) => {
      const url = String(input);

      if (url.includes('/webhooks/events/quest.completed/metadata')) {
        return new Promise<Response>(resolve => {
          resolveMetadataResponse = resolve;
        });
      }

      if (url.includes('/webhooks')) {
        return createWebhookListResponse();
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    const { fetchApi } = renderPage(fetchImpl);

    await user.click(
      await screen.findByRole('button', { name: 'Create Webhook' }),
    );
    await user.click(screen.getByRole('button', { name: 'Select event' }));
    await user.click(screen.getByLabelText('Quest Completed'));

    expect(
      screen.getByText('Loading available placeholders...'),
    ).toBeInTheDocument();

    await waitFor(() =>
      expect(fetchApi.fetch).toHaveBeenCalledWith(
        `${baseUrl}/webhooks/events/quest.completed/metadata`,
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      ),
    );

    resolveMetadataResponse(
      createJsonResponse({
        event: 'quest.completed',
        labels: ['username', 'quest_title', 'total_xp', 'xp_reward'],
        template: {},
      }),
    );

    expect(await screen.findByText('username')).toBeInTheDocument();
    expect(screen.getByText('quest_title')).toBeInTheDocument();
    expect(screen.getByText('total_xp')).toBeInTheDocument();
    expect(screen.getByText('xp_reward')).toBeInTheDocument();
  });

  it('shows an error message when event metadata fails to load', async () => {
    const user = userEvent.setup();

    const fetchImpl = jest.fn(async (input: string) => {
      const url = String(input);

      if (url.includes('/webhooks/events/user.leveled_up/metadata')) {
        return new Response(
          JSON.stringify({ error: { message: 'Metadata lookup failed' } }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      if (url.includes('/webhooks')) {
        return createWebhookListResponse();
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    renderPage(fetchImpl);

    await user.click(
      await screen.findByRole('button', { name: 'Create Webhook' }),
    );
    await user.click(screen.getByRole('button', { name: 'Select event' }));
    await user.click(screen.getByLabelText('User Leveled Up'));

    expect(
      await screen.findByText(
        'Unable to load placeholders: Metadata lookup failed',
      ),
    ).toBeInTheDocument();
  });
});
