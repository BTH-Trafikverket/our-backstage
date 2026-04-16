import { useCallback, useEffect, useState } from 'react';
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
import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { WebhookDeleteDialog } from './WebhookDeleteDialog';
import { WebhookFormDialog } from './WebhookFormDialog';
import { WebhookTable } from './WebhookTable';
import {
  WEBHOOK_EVENTS,
  type Webhook,
  type WebhookApiResponse,
  type WebhookEventMetadata,
  type WebhookFormData,
  type WebhookTableRow,
} from './types';
import {
  buildWebhookPayload,
  createWebhookFormData,
  normalizeWebhook,
  readErrorMessage,
  validateWebhookForm,
} from './utils';
import { JsonHighlight } from './JsonHighlight';

const createEmptyWebhookForm = (): WebhookFormData => ({
  title: '',
  description: '',
  url: '',
  event: '',
  payload: '',
});

export const WebhooksPage = () => {
  const fetchApi = useApi(fetchApiRef);
  const discoveryApi = useApi(discoveryApiRef);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm, setCreateForm] = useState<WebhookFormData>(
    createEmptyWebhookForm(),
  );
  const [createError, setCreateError] = useState<string | null>(null);
  const [createEventMetadata, setCreateEventMetadata] =
    useState<WebhookEventMetadata | null>(null);
  const [createEventMetadataError, setCreateEventMetadataError] = useState<
    string | null
  >(null);
  const [createEventMetadataLoading, setCreateEventMetadataLoading] =
    useState(false);

  const [editWebhook, setEditWebhook] = useState<Webhook | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editForm, setEditForm] = useState<WebhookFormData>(
    createEmptyWebhookForm(),
  );
  const [editError, setEditError] = useState<string | null>(null);

  const [deleteWebhook, setDeleteWebhook] = useState<Webhook | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [viewWebhook, setViewWebhook] = useState<Webhook | null>(null);

  const buildGamificationUrl = useCallback(
    async (path: string, query?: Record<string, string>) => {
      const baseUrl = await discoveryApi.getBaseUrl('gamification');
      const url = new URL(
        `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`,
      );

      if (query) {
        for (const [key, value] of Object.entries(query)) {
          if (value.trim()) {
            url.searchParams.set(key, value);
          }
        }
      }

      return url.toString();
    },
    [discoveryApi],
  );

  const handleCreateChange = (field: keyof WebhookFormData, value: string) => {
    setCreateForm(prev => ({ ...prev, [field]: value }));
    setCreateError(null);
  };

  const handleEditChange = (field: keyof WebhookFormData, value: string) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
    setEditError(null);
  };

  const resetCreateDialog = () => {
    setIsCreateOpen(false);
    setCreateError(null);
    setCreateEventMetadata(null);
    setCreateEventMetadataError(null);
    setCreateEventMetadataLoading(false);
    setCreateForm(createEmptyWebhookForm());
  };

  const resetEditDialog = () => {
    setEditWebhook(null);
    setEditError(null);
    setEditForm(createEmptyWebhookForm());
  };

  const resetDeleteDialog = () => {
    setDeleteWebhook(null);
    setDeleteError(null);
  };

  useEffect(() => {
    if (!isCreateOpen || !createForm.event) {
      setCreateEventMetadata(null);
      setCreateEventMetadataError(null);
      setCreateEventMetadataLoading(false);
      return undefined;
    }

    const abortController = new AbortController();

    const loadEventMetadata = async () => {
      setCreateEventMetadata(null);
      setCreateEventMetadataError(null);
      setCreateEventMetadataLoading(true);

      try {
        const url = await buildGamificationUrl(
          `/webhooks/events/${encodeURIComponent(createForm.event)}/metadata`,
        );
        const response = await fetchApi.fetch(url, {
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        const result = (await response.json()) as WebhookEventMetadata;
        setCreateEventMetadata({
          event: result.event,
          labels: Array.isArray(result.labels) ? result.labels : [],
          template:
            result.template &&
            !Array.isArray(result.template) &&
            typeof result.template === 'object'
              ? result.template
              : {},
        });
      } catch (eventMetadataError) {
        if (abortController.signal.aborted) {
          return;
        }

        setCreateEventMetadataError(
          eventMetadataError instanceof Error
            ? eventMetadataError.message
            : 'An unknown error occurred',
        );
      } finally {
        if (!abortController.signal.aborted) {
          setCreateEventMetadataLoading(false);
        }
      }
    };

    loadEventMetadata();

    return () => {
      abortController.abort();
    };
  }, [buildGamificationUrl, createForm.event, fetchApi, isCreateOpen]);

  const getData = useCallback(
    async ({
      offset,
      pageSize,
      signal,
    }: {
      offset: number;
      pageSize: number;
      signal: AbortSignal;
    }) => {
      const page = Math.floor(offset / pageSize) + 1;
      const url = await buildGamificationUrl('/webhooks', {
        page: String(page),
        limit: String(pageSize),
      });
      const response = await fetchApi.fetch(url, { signal });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const result = await response.json();
      const rows: Webhook[] = Array.isArray(result.data)
        ? result.data.map((webhook: WebhookApiResponse) =>
            normalizeWebhook(webhook),
          )
        : [];

      return {
        data: rows.map(
          (webhook: Webhook): WebhookTableRow => ({
            id: webhook.id,
            webhook,
          }),
        ),
        totalCount: Number(result.pagination?.total ?? 0),
      };
    },
    [buildGamificationUrl, fetchApi],
  );

  const { tableProps, reload } = useTable<WebhookTableRow>({
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

  const handleCreateSubmit = async () => {
    const validationError = validateWebhookForm(createForm);
    if (validationError) {
      setCreateError(validationError);
      return;
    }

    setCreateLoading(true);
    setCreateError(null);

    try {
      const url = await buildGamificationUrl('/webhooks');
      const response = await fetchApi.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildWebhookPayload(createForm)),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      resetCreateDialog();
      reload();
    } catch (createWebhookError) {
      setCreateError(
        createWebhookError instanceof Error
          ? createWebhookError.message
          : 'An unknown error occurred',
      );
    } finally {
      setCreateLoading(false);
    }
  };

  const handleViewWebhook = (webhook: Webhook) => {
    setViewWebhook(webhook);
  };

  const handleEditWebhook = (webhook: Webhook) => {
    setEditWebhook(webhook);
    setEditForm(createWebhookFormData(webhook));
    setEditError(null);
  };

  const handleEditSubmit = async () => {
    if (!editWebhook) {
      return;
    }

    const validationError = validateWebhookForm(editForm);
    if (validationError) {
      setEditError(validationError);
      return;
    }

    setEditLoading(true);
    setEditError(null);

    try {
      const url = await buildGamificationUrl(`/webhooks/${editWebhook.id}`);
      const response = await fetchApi.fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildWebhookPayload(editForm)),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const updatedWebhook = normalizeWebhook(
        (await response.json()) as WebhookApiResponse,
      );

      setViewWebhook(current =>
        current?.id === updatedWebhook.id ? updatedWebhook : current,
      );
      resetEditDialog();
      reload();
    } catch (saveWebhookError) {
      setEditError(
        saveWebhookError instanceof Error
          ? saveWebhookError.message
          : 'An unknown error occurred',
      );
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteWebhook = (webhook: Webhook) => {
    setDeleteWebhook(webhook);
    setDeleteError(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteWebhook) {
      return;
    }

    setDeleteLoading(true);
    setDeleteError(null);

    try {
      const deletedWebhookId = deleteWebhook.id;
      const url = await buildGamificationUrl(`/webhooks/${deletedWebhookId}`);
      const response = await fetchApi.fetch(url, { method: 'DELETE' });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setViewWebhook(current =>
        current?.id === deletedWebhookId ? null : current,
      );
      resetDeleteDialog();
      reload();
    } catch (deleteWebhookError) {
      setDeleteError(
        deleteWebhookError instanceof Error
          ? deleteWebhookError.message
          : 'An unknown error occurred',
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <WebhookFormDialog
        isOpen={isCreateOpen}
        mode="create"
        formData={createForm}
        error={createError}
        eventMetadata={createEventMetadata}
        eventMetadataError={createEventMetadataError}
        eventMetadataLoading={createEventMetadataLoading}
        loading={createLoading}
        onClose={resetCreateDialog}
        onSubmit={handleCreateSubmit}
        onChange={handleCreateChange}
      />

      <WebhookFormDialog
        isOpen={editWebhook !== null}
        mode="edit"
        formData={editForm}
        error={editError}
        eventMetadata={null}
        eventMetadataError={null}
        eventMetadataLoading={false}
        loading={editLoading}
        webhookTitle={editWebhook?.title}
        onClose={resetEditDialog}
        onSubmit={handleEditSubmit}
        onChange={handleEditChange}
      />

      <WebhookDeleteDialog
        isOpen={deleteWebhook !== null}
        webhook={deleteWebhook}
        error={deleteError}
        loading={deleteLoading}
        onClose={resetDeleteDialog}
        onConfirm={handleConfirmDelete}
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
                <JsonHighlight value={viewWebhook?.payload ?? {}} />
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
