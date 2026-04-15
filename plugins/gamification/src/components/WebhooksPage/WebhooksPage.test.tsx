import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { TestApiProvider } from '@backstage/test-utils';
import { WebhooksPage } from './WebhooksPage';

describe('WebhooksPage', () => {
  jest.setTimeout(15000);

  const baseUrl = 'http://example.test/api/gamification';
  const webhook = {
    id: 'webhook-1',
    title: 'Production Webhook',
    description: 'Sends quest updates to an external system',
    url: 'https://example.com/webhooks/gamification',
    events: ['quest.completed'],
    payload: { timeout: 5000 },
    created_at: '2026-03-31T08:00:00.000Z',
    updated_at: '2026-03-31T08:00:00.000Z',
  };

  const createJsonResponse = (body: unknown, init?: ResponseInit) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });

  const createWebhookListResponse = () =>
    createJsonResponse({
      data: [webhook],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

  const getRequestUrl = (input: RequestInfo | URL) => {
    if (typeof input === 'string') {
      return input;
    }

    if (input instanceof URL) {
      return input.toString();
    }

    return input.url;
  };

  function renderPage(fetchImpl: jest.Mock) {
    const discoveryApi = {
      getBaseUrl: jest.fn(async () => baseUrl),
    };
    const fetchApi = {
      fetch: fetchImpl,
    };

    return render(
      <TestApiProvider
        apis={[
          [discoveryApiRef, discoveryApi as any],
          [fetchApiRef, fetchApi as any],
        ]}
      >
        <WebhooksPage />
      </TestApiProvider>,
    );
  }

  it('submits webhook edits through the backend patch endpoint', async () => {
    const user = userEvent.setup();
    const fetchImpl = jest.fn(async (input: RequestInfo | URL, init?: any) => {
      const url = getRequestUrl(input);

      if (url === `${baseUrl}/webhooks/webhook-1` && init?.method === 'PATCH') {
        return createJsonResponse({
          ...webhook,
          title: 'Updated Production Webhook',
          updated_at: '2026-04-01T09:30:00.000Z',
        });
      }

      return createWebhookListResponse();
    });

    renderPage(fetchImpl);

    expect(await screen.findByText('Production Webhook')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByRole('textbox', { name: 'Title' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Title' }),
      'Updated Production Webhook',
    );
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(fetchImpl).toHaveBeenCalledWith(
        `${baseUrl}/webhooks/webhook-1`,
        expect.objectContaining({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'Updated Production Webhook',
            description: webhook.description,
            url: webhook.url,
            event: webhook.events[0],
            payload: webhook.payload,
          }),
        }),
      ),
    );
  });

  it('deletes webhooks through the backend delete endpoint', async () => {
    const user = userEvent.setup();
    const fetchImpl = jest.fn(async (input: RequestInfo | URL, init?: any) => {
      const url = getRequestUrl(input);

      if (
        url === `${baseUrl}/webhooks/webhook-1` &&
        init?.method === 'DELETE'
      ) {
        return new Response(null, { status: 204 });
      }

      return createWebhookListResponse();
    });

    renderPage(fetchImpl);

    expect(await screen.findByText('Production Webhook')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(
      screen.getByText(/permanently removes the webhook configuration/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete webhook' }));

    await waitFor(() =>
      expect(fetchImpl).toHaveBeenCalledWith(
        `${baseUrl}/webhooks/webhook-1`,
        expect.objectContaining({
          method: 'DELETE',
        }),
      ),
    );
  });
});
