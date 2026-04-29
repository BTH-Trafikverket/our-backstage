import { render, screen, waitFor, within } from '@testing-library/react';
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

  const createWebhookListResponse = (data: unknown[] = [webhook]) =>
    createJsonResponse({
      data,
      pagination: { page: 1, limit: 10, total: data.length, totalPages: 1 },
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

  it('loads and displays event metadata for the selected create event', async () => {
    const user = userEvent.setup();
    let resolveMetadataResponse!: (response: Response) => void;

    const fetchImpl = jest.fn(async (input: RequestInfo | URL) => {
      const url = getRequestUrl(input);

      if (url === `${baseUrl}/webhooks/events/quest.completed/metadata`) {
        return new Promise<Response>(resolve => {
          resolveMetadataResponse = resolve;
        });
      }

      if (url === `${baseUrl}/webhooks`) {
        return createWebhookListResponse([]);
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    renderPage(fetchImpl);

    await user.click(
      await screen.findByRole('button', { name: 'Create Webhook' }),
    );
    await user.click(screen.getByRole('button', { name: 'Select event' }));
    await user.click(screen.getByLabelText('Quest Completed'));

    expect(
      screen.getByText('Loading available placeholders...'),
    ).toBeInTheDocument();

    await waitFor(() =>
      expect(fetchImpl).toHaveBeenCalledWith(
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
        template: {
          content:
            '{{username}} completed {{quest_title}} and earned {{xp_reward}} XP.',
        },
      }),
    );

    expect(await screen.findByText('username')).toBeInTheDocument();
    expect(screen.getByText('quest_title')).toBeInTheDocument();
    expect(screen.getByText('total_xp')).toBeInTheDocument();
    expect(screen.getByText('xp_reward')).toBeInTheDocument();
    expect(screen.getByText('Template example')).toBeInTheDocument();
  });

  it('shows an error message when event metadata fails to load', async () => {
    const user = userEvent.setup();

    const fetchImpl = jest.fn(async (input: RequestInfo | URL) => {
      const url = getRequestUrl(input);

      if (url === `${baseUrl}/webhooks/events/badge.earned/metadata`) {
        return new Response(
          JSON.stringify({ error: { message: 'Metadata lookup failed' } }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      if (url === `${baseUrl}/webhooks`) {
        return createWebhookListResponse([]);
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    renderPage(fetchImpl);

    await user.click(
      await screen.findByRole('button', { name: 'Create Webhook' }),
    );
    await user.click(screen.getByRole('button', { name: 'Select event' }));
    await user.click(screen.getByLabelText('Badge Earned'));

    expect(
      await screen.findByText(
        'Unable to load placeholders: Metadata lookup failed',
      ),
    ).toBeInTheDocument();
  });

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

  it('shows an override dialog when create health check warns and retries with skipEndpointHealthCheck', async () => {
    const user = userEvent.setup();
    const fetchImpl = jest.fn(async (input: RequestInfo | URL, init?: any) => {
      const url = getRequestUrl(input);

      if (url === `${baseUrl}/webhooks` && init?.method === 'POST') {
        const body = JSON.parse(init.body);

        if (body.skipEndpointHealthCheck) {
          return createJsonResponse(
            {
              ...webhook,
              id: 'webhook-2',
              title: body.title,
              description: body.description,
              url: body.url,
              events: [body.event],
              payload: body.payload,
            },
            { status: 201 },
          );
        }

        return createJsonResponse(
          {
            error: {
              name: 'WebhookTargetReachabilityError',
              message:
                'Webhook endpoint responded with status 404 to a health check. Double-check the URL before saving.',
              canOverride: true,
              url: 'https://example.com/webhooks/gamification',
              statusCode: 404,
            },
          },
          { status: 409 },
        );
      }

      return createWebhookListResponse([]);
    });

    renderPage(fetchImpl);

    await user.click(
      await screen.findByRole('button', { name: 'Create Webhook' }),
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Title' }),
      'Production Webhook',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Webhook URL' }),
      'https://example.com/webhooks/gamification',
    );
    await user.click(screen.getByRole('button', { name: 'Select event' }));
    await user.click(screen.getByLabelText('Quest Completed'));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Create Webhook',
      }),
    );

    expect(
      await screen.findByText('Endpoint not responding'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/might mean the endpoint is down/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save anyway' }));

    await waitFor(() =>
      expect(fetchImpl).toHaveBeenCalledWith(
        `${baseUrl}/webhooks`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            title: 'Production Webhook',
            description: '',
            url: 'https://example.com/webhooks/gamification',
            event: 'quest.completed',
            payload: {},
            skipEndpointHealthCheck: true,
          }),
        }),
      ),
    );
  });
});
