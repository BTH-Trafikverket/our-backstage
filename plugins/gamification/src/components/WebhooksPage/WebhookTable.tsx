import {
  Button,
  Cell,
  Flex,
  Table,
  Text,
  type TableProps,
} from '@backstage/ui';
import { WEBHOOK_EVENTS, type WebhookTableRow } from './types';

type WebhookTableProps = {
  tableProps: Omit<TableProps<WebhookTableRow>, 'columnConfig' | 'emptyState'>;
  onViewWebhook: (webhook: WebhookTableRow['webhook']) => void;
  onEditWebhook: (webhook: WebhookTableRow['webhook']) => void;
  onDeleteWebhook: (webhook: WebhookTableRow['webhook']) => void;
};

const formatEventLabel = (eventId: string): string => {
  return (
    WEBHOOK_EVENTS.find(eventOption => eventOption.id === eventId)?.label ??
    eventId
  );
};

const getColumns = (
  onViewWebhook: (webhook: WebhookTableRow['webhook']) => void,
  onEditWebhook: (webhook: WebhookTableRow['webhook']) => void,
  onDeleteWebhook: (webhook: WebhookTableRow['webhook']) => void,
) =>
  [
    {
      id: 'title',
      label: 'Title',
      isRowHeader: true,
      isSortable: true,
      defaultWidth: '1.4fr',
      minWidth: 180,
      cell: (item: WebhookTableRow) => <Cell>{item.webhook.title}</Cell>,
    },
    {
      id: 'description',
      label: 'Description',
      isSortable: true,
      defaultWidth: '2fr',
      minWidth: 260,
      cell: (item: WebhookTableRow) => <Cell>{item.webhook.description}</Cell>,
    },
    {
      id: 'events',
      label: 'Events',
      defaultWidth: '2fr',
      minWidth: 260,
      cell: (item: WebhookTableRow) => (
        <Cell>
          {item.webhook.events.length
            ? item.webhook.events.map(formatEventLabel).join(', ')
            : '-'}
        </Cell>
      ),
    },
    {
      id: 'actions',
      label: 'Action',
      width: 280,
      cell: (item: WebhookTableRow) => (
        <Cell>
          <Flex justify="end" gap="2" style={{ width: '100%' }}>
            <Button
              size="small"
              variant="secondary"
              onPress={() => onViewWebhook(item.webhook)}
            >
              View
            </Button>
            <Button
              size="small"
              variant="secondary"
              onPress={() => onEditWebhook(item.webhook)}
            >
              Edit
            </Button>
            <Button
              size="small"
              variant="tertiary"
              destructive
              onPress={() => onDeleteWebhook(item.webhook)}
            >
              Delete
            </Button>
          </Flex>
        </Cell>
      ),
    },
  ] as const;

export const WebhookTable = ({
  tableProps,
  onViewWebhook,
  onEditWebhook,
  onDeleteWebhook,
}: WebhookTableProps) => {
  const emptyState = (
    <Flex
      direction="column"
      align="center"
      justify="center"
      gap="2"
      style={{ minHeight: '20rem', width: '100%' }}
    >
      <Text weight="bold">No webhooks to show.</Text>
      <Text color="secondary">Created webhooks will appear here.</Text>
    </Flex>
  );

  return (
    <Table
      columnConfig={getColumns(onViewWebhook, onEditWebhook, onDeleteWebhook)}
      emptyState={emptyState}
      {...tableProps}
    />
  );
};
