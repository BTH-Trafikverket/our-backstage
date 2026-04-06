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
} from '@backstage/ui';
import type { Webhook } from './types';

type WebhookDeleteDialogProps = {
  isOpen: boolean;
  webhook: Webhook | null;
  error: string | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export const WebhookDeleteDialog = ({
  isOpen,
  webhook,
  error,
  loading,
  onClose,
  onConfirm,
}: WebhookDeleteDialogProps) => {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={open => {
        if (!open && !loading) {
          onClose();
        }
      }}
      width={520}
    >
      <DialogHeader>Delete webhook</DialogHeader>
      <DialogBody>
        <Flex direction="column" gap="4">
          {error ? (
            <Alert
              status="danger"
              icon
              title="Could not delete webhook"
              description={error}
            />
          ) : null}

          <Box p="4">
            <Text>
              Delete &quot;{webhook?.title}&quot;? This permanently removes the
              webhook configuration and any scheduled-run history tied to it.
            </Text>
          </Box>
        </Flex>
      </DialogBody>
      <DialogFooter>
        <Flex justify="end" gap="2">
          <Button variant="secondary" onPress={onClose} isDisabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            destructive
            onPress={onConfirm}
            loading={loading}
          >
            Delete webhook
          </Button>
        </Flex>
      </DialogFooter>
    </Dialog>
  );
};
