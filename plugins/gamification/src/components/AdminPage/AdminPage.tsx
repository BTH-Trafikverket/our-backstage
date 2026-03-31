import { useCallback, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogBody,
  DialogHeader,
  Flex,
  HeaderPage,
  Text,
  useTable,
} from '@backstage/ui';
import { WebhookFormDialog } from './WebhookFormDialog';
import { WebhookTable } from './WebhookTable';
import {
  WEBHOOK_EVENTS,
  type Webhook,
  type WebhookFormData,
  type WebhookTableRow,
} from './types';

const MOCK_WEBHOOKS: Webhook[] = [
  {
    id: '1',
    title: 'Production Webhook',
    description: 'Sends gamification events to production system',
    url: 'https://example.com/webhooks/gamification',
    events: ['quest.completed', 'badge.earned'],
    payload: { timeout: 5000, retries: 3 },
    createdAt: '2026-03-30',
  },
  {
    id: '2',
    title: 'Analytics Webhook',
    description: 'Tracks all gamification events for analytics',
    url: 'https://analytics.example.com/events',
    events: ['quest.completed', 'user.leveled_up', 'badge.earned'],
    payload: { batchSize: 100, includeMetadata: true },
    createdAt: '2026-03-30',
  },
  {
    id: '3',
    title: 'Slack Notifications',
    description: 'Notifies team of major achievements',
    url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL',
    events: ['user.leveled_up'],
    payload: { channel: '#achievements', username: 'Gamification Bot' },
    createdAt: '2026-03-30',
  },
];

export const AdminPage = () => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<WebhookFormData>({
    title: '',
    description: '',
    url: '',
    event: '',
    payload: '{}',
  });
  const [createError, setCreateError] = useState<string | null>(null);

  const [viewWebhook, setViewWebhook] = useState<Webhook | null>(null);

  const handleCreateChange = (field: keyof WebhookFormData, value: string) => {
    setCreateForm(prev => ({ ...prev, [field]: value }));
    setCreateError(null);
  };

  const handleCreateSubmit = () => {
    if (!createForm.title.trim()) {
      setCreateError('Title is required');
      return;
    }
    if (!createForm.url.trim()) {
      setCreateError('URL is required');
      return;
    }
    try {
      JSON.parse(createForm.payload || '{}');
    } catch {
      setCreateError('Invalid JSON in payload');
      return;
    }
    // TODO: send to backend
    setIsCreateOpen(false);
    setCreateForm({
      title: '',
      description: '',
      url: '',
      event: '',
      payload: '{}',
    });
    setCreateError(null);
  };

  const resetCreateDialog = () => {
    setIsCreateOpen(false);
    setCreateError(null);
    setCreateForm({
      title: '',
      description: '',
      url: '',
      event: '',
      payload: '{}',
    });
  };

  const getData = useCallback(
    async ({
      offset,
      pageSize,
    }: {
      offset: number;
      pageSize: number;
      signal: AbortSignal;
    }) => {
      const pageData = MOCK_WEBHOOKS.slice(offset, offset + pageSize);

      return {
        data: pageData.map(
          (webhook): WebhookTableRow => ({
            id: webhook.id,
            webhook,
          }),
        ),
        totalCount: MOCK_WEBHOOKS.length,
      };
    },
    [],
  );

  const { tableProps } = useTable({
    mode: 'offset',
    getData,
    paginationOptions: {
      pageSize: 10,
      pageSizeOptions: [10, 20, 30],
      showPageSizeOptions: false,
      getLabel: ({ offset, pageSize, totalCount }) => {
        const safeOffset = offset ?? 0;
        const safePageSize = pageSize ?? 10;
        const safeTotalCount = totalCount ?? 0;

        if (!safeTotalCount) {
          return '0 results';
        }

        const from = safeOffset + 1;
        const to = Math.min(safeOffset + safePageSize, safeTotalCount);
        return `${from}-${to} of ${safeTotalCount}`;
      },
    },
  });

  const handleViewWebhook = (webhook: Webhook) => {
    setViewWebhook(webhook);
  };

  const handleEditWebhook = (_webhook: Webhook) => {
    // TODO: open edit dialog
  };

  const handleDeleteWebhook = (_webhook: Webhook) => {
    // TODO: open delete dialog
  };

  return (
    <>
      <WebhookFormDialog
        isOpen={isCreateOpen}
        mode="create"
        formData={createForm}
        error={createError}
        loading={false}
        onClose={resetCreateDialog}
        onSubmit={handleCreateSubmit}
        onChange={handleCreateChange}
      />

      <Flex direction="column" gap="4">
        <HeaderPage title="Webhooks" />

        {tableProps.error ? (
          <Alert
            status="danger"
            icon
            title="Unable to load webhooks"
            description={tableProps.error.message}
          />
        ) : null}

        <Flex justify="end">
          <Button
            size="small"
            variant="primary"
            onPress={() => setIsCreateOpen(true)}
          >
            Create Webhook
          </Button>
        </Flex>

        <WebhookTable
          tableProps={tableProps}
          onViewWebhook={handleViewWebhook}
          onEditWebhook={handleEditWebhook}
          onDeleteWebhook={handleDeleteWebhook}
        />

        <Dialog
          isOpen={viewWebhook !== null}
          onOpenChange={open => {
            if (!open) setViewWebhook(null);
          }}
          width={1100}
        >
          <DialogHeader>
            <Flex direction="column" gap="1">
              <Text weight="bold" style={{ fontSize: 22, lineHeight: 1.2 }}>
                {viewWebhook?.title ?? ''}
              </Text>
              <Text color="secondary" style={{ fontSize: 14 }}>
                Webhook details
              </Text>
            </Flex>
          </DialogHeader>
          <DialogBody>
            <Flex direction="column" gap="4">
              {viewWebhook?.description ? (
                <Box
                  style={{
                    padding: 14,
                    border:
                      '1px solid var(--bui-border, rgba(127, 127, 127, 0.3))',
                    borderRadius: 8,
                  }}
                >
                  <Text
                    weight="bold"
                    style={{ fontSize: 14, display: 'block' }}
                  >
                    Description:
                  </Text>
                  <Text
                    style={{
                      fontSize: 16,
                      lineHeight: 1.45,
                      marginTop: 6,
                      display: 'block',
                    }}
                  >
                    {viewWebhook.description}
                  </Text>
                </Box>
              ) : null}

              <Box
                style={{
                  padding: 14,
                  border:
                    '1px solid var(--bui-border, rgba(127, 127, 127, 0.3))',
                  borderRadius: 8,
                }}
              >
                <Text weight="bold" style={{ fontSize: 14, display: 'block' }}>
                  URL:
                </Text>
                <Text
                  style={{
                    fontSize: 15,
                    lineHeight: 1.45,
                    marginTop: 6,
                    display: 'block',
                    wordBreak: 'break-all',
                  }}
                >
                  {viewWebhook?.url}
                </Text>
              </Box>

              <Box
                style={{
                  padding: 14,
                  border:
                    '1px solid var(--bui-border, rgba(127, 127, 127, 0.3))',
                  borderRadius: 8,
                }}
              >
                <Text weight="bold" style={{ fontSize: 14, display: 'block' }}>
                  Event:
                </Text>
                <Text
                  style={{
                    fontSize: 15,
                    lineHeight: 1.45,
                    marginTop: 6,
                    display: 'block',
                  }}
                >
                  {(() => {
                    const eventId = (viewWebhook?.events ?? [])[0];
                    if (!eventId) {
                      return '—';
                    }

                    return (
                      WEBHOOK_EVENTS.find(event => event.id === eventId)
                        ?.label ?? eventId
                    );
                  })()}
                </Text>
              </Box>

              <Box
                style={{
                  padding: 14,
                  border:
                    '1px solid var(--bui-border, rgba(127, 127, 127, 0.3))',
                  borderRadius: 8,
                }}
              >
                <Text weight="bold" style={{ fontSize: 14 }}>
                  Payload:
                </Text>
                <pre
                  style={{
                    margin: '8px 0 0 0',
                    padding: 14,
                    background: '#1e1e1e',
                    color: '#d4d4d4',
                    border: '1px solid #555',
                    borderRadius: 6,
                    overflow: 'auto',
                    minHeight: '18rem',
                    maxHeight: '65vh',
                    whiteSpace: 'pre',
                    fontSize: 15,
                    lineHeight: 1.6,
                  }}
                >
                  {JSON.stringify(viewWebhook?.payload, null, 2)}
                </pre>
              </Box>

              <Box
                style={{
                  padding: 14,
                  border:
                    '1px solid var(--bui-border, rgba(127, 127, 127, 0.3))',
                  borderRadius: 8,
                }}
              >
                <Text weight="bold" style={{ fontSize: 14, display: 'block' }}>
                  Created:
                </Text>
                <Text
                  style={{
                    fontSize: 15,
                    lineHeight: 1.45,
                    marginTop: 6,
                    display: 'block',
                  }}
                >
                  {viewWebhook?.createdAt}
                </Text>
              </Box>
            </Flex>
          </DialogBody>
        </Dialog>
      </Flex>
    </>
  );
};
