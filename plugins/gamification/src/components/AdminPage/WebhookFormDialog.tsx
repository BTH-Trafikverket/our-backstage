import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  Text,
  TextField,
} from '@backstage/ui';
import { useState, type ReactNode } from 'react';
import {
  WEBHOOK_EVENTS,
  type WebhookEventMetadata,
  type WebhookFormData,
} from './types';

type WebhookFormDialogProps = {
  isOpen: boolean;
  mode: 'create' | 'edit';
  formData: WebhookFormData;
  error: string | null;
  loading: boolean;
  eventMetadata: WebhookEventMetadata | null;
  eventMetadataError: string | null;
  eventMetadataLoading: boolean;
  webhookTitle?: string;
  onClose: () => void;
  onSubmit: () => void;
  onChange: (field: keyof WebhookFormData, value: string) => void;
};

export const WebhookFormDialog = ({
  isOpen,
  mode,
  formData,
  error,
  loading,
  eventMetadata,
  eventMetadataError,
  eventMetadataLoading,
  webhookTitle,
  onClose,
  onSubmit,
  onChange,
}: WebhookFormDialogProps) => {
  const [eventsOpen, setEventsOpen] = useState(false);
  const title =
    mode === 'create'
      ? 'Create Webhook'
      : `Edit webhook${webhookTitle ? `: ${webhookTitle}` : ''}`;
  const submitLabel = mode === 'create' ? 'Create Webhook' : 'Save changes';

  const eventsLabel =
    WEBHOOK_EVENTS.find(e => e.id === formData.event)?.label ?? 'Select event';
  let eventMetadataContent: ReactNode = null;

  if (eventMetadataLoading) {
    eventMetadataContent = (
      <Text variant="body-small" color="secondary">
        Loading available placeholders...
      </Text>
    );
  } else if (eventMetadataError) {
    eventMetadataContent = (
      <Text
        variant="body-small"
        style={{ color: 'var(--bui-fg-danger, #b42318)' }}
      >
        Unable to load placeholders: {eventMetadataError}
      </Text>
    );
  } else if (eventMetadata?.labels.length) {
    eventMetadataContent = (
      <Flex gap="2" style={{ flexWrap: 'wrap' }}>
        {eventMetadata.labels.map(label => (
          <Box
            key={label}
            as="span"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '2px 8px',
              borderRadius: 999,
              background: 'var(--bui-bg-solid, rgba(127, 127, 127, 0.12))',
              fontFamily:
                'ui-monospace, SFMono-Regular, SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {label}
          </Box>
        ))}
      </Flex>
    );
  } else {
    eventMetadataContent = (
      <Text variant="body-small" color="secondary">
        No placeholders available for this event.
      </Text>
    );
  }

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={open => {
        if (!open && !loading) onClose();
      }}
      width={980}
    >
      <DialogHeader>{title}</DialogHeader>
      <DialogBody>
        <Box p="4">
          <Flex direction="column" gap="4">
            {error && (
              <Alert status="danger" icon title="Error" description={error} />
            )}

            <TextField
              label="Title"
              placeholder="e.g., Production Webhook"
              value={formData.title}
              onChange={value => onChange('title', value)}
              isDisabled={loading}
              isRequired
              size="medium"
            />

            <TextField
              label="Description"
              placeholder="What is this webhook for?"
              value={formData.description}
              onChange={value => onChange('description', value)}
              isDisabled={loading}
              size="medium"
            />

            <TextField
              label="Webhook URL"
              placeholder="https://example.com/webhook"
              value={formData.url}
              onChange={value => onChange('url', value)}
              isDisabled={loading}
              isRequired
              size="medium"
            />

            <Box>
              <Text
                variant="body-small"
                weight="bold"
                style={{ marginBottom: 6, display: 'block' }}
              >
                Event
              </Text>
              <Box
                style={{
                  border:
                    '1px solid var(--bui-input-border, rgba(127,127,127,0.4))',
                  borderRadius: 8,
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  aria-expanded={eventsOpen}
                  aria-haspopup="listbox"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    textAlign: 'left',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'transparent',
                    border: 'none',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    color: 'inherit',
                    fontSize: 14,
                  }}
                  disabled={loading}
                  onClick={() => setEventsOpen(o => !o)}
                >
                  <span>{eventsLabel}</span>
                  <span aria-hidden="true">{eventsOpen ? '▲' : '▼'}</span>
                </button>
                {eventsOpen && (
                  <Flex
                    direction="column"
                    style={{
                      borderTop:
                        '1px solid var(--bui-input-border, rgba(127,127,127,0.2))',
                    }}
                  >
                    {WEBHOOK_EVENTS.map(event => (
                      <label
                        key={event.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 12px',
                          cursor: 'pointer',
                          fontSize: 14,
                        }}
                      >
                        <input
                          type="radio"
                          name="webhook-event"
                          value={event.id}
                          checked={formData.event === event.id}
                          onChange={() => {
                            onChange('event', event.id);
                            setEventsOpen(false);
                          }}
                          disabled={loading}
                        />
                        {event.label}
                      </label>
                    ))}
                  </Flex>
                )}
              </Box>

              {formData.event ? (
                <Box
                  style={{
                    marginTop: 10,
                    padding: 12,
                    border:
                      '1px solid var(--bui-border, rgba(127, 127, 127, 0.3))',
                    borderRadius: 8,
                    background:
                      'var(--bui-bg-surface-2, rgba(127, 127, 127, 0.06))',
                  }}
                >
                  <Flex direction="column" gap="2">
                    <Text variant="body-small" weight="bold">
                      Available placeholders
                    </Text>
                    {eventMetadataContent}
                  </Flex>
                </Box>
              ) : null}
            </Box>

            <Flex direction="column" gap="1">
              <Text variant="body-small" weight="bold">
                Payload (JSON)
              </Text>
              <textarea
                value={formData.payload}
                onChange={e => onChange('payload', e.target.value)}
                disabled={loading}
                rows={16}
                placeholder='{"key": "value"}'
                style={{
                  width: '100%',
                  minHeight: 360,
                  fontFamily: 'monospace',
                  fontSize: 13,
                  lineHeight: 1.5,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border:
                    '1px solid var(--bui-input-border, rgba(127,127,127,0.4))',
                  background: 'var(--bui-bg-base, transparent)',
                  color: 'inherit',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </Flex>
          </Flex>
        </Box>
      </DialogBody>
      <DialogFooter>
        <Flex justify="end" gap="2">
          <Button variant="secondary" isDisabled={loading} onPress={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={loading} onPress={onSubmit}>
            {submitLabel}
          </Button>
        </Flex>
      </DialogFooter>
    </Dialog>
  );
};
