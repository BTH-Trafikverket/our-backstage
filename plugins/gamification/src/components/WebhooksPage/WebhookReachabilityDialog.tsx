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
import type { WebhookReachabilityWarning } from './types';

type WebhookReachabilityDialogProps = {
  isOpen: boolean;
  warning: WebhookReachabilityWarning | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export const WebhookReachabilityDialog = ({
  isOpen,
  warning,
  loading,
  onClose,
  onConfirm,
}: WebhookReachabilityDialogProps) => (
  <Dialog
    isOpen={isOpen}
    onOpenChange={open => {
      if (!open && !loading) {
        onClose();
      }
    }}
    width={560}
  >
    <DialogHeader>Endpoint not responding</DialogHeader>
    <DialogBody>
      <Flex direction="column" gap="4">
        <Alert
          status="warning"
          icon
          title="The webhook endpoint did not pass the health check"
          description={warning?.message ?? ''}
        />

        <Box p="4">
          <Flex direction="column" gap="3">
            <Text>
              The target URL is allowed by policy, but it is not responding
              correctly right now. This might mean the endpoint is down or that
              the URL was entered incorrectly.
            </Text>
            <Text style={{ wordBreak: 'break-all' }}>{warning?.url ?? ''}</Text>
            <Text>
              Save the webhook anyway, or go back and correct the endpoint
              first.
            </Text>
          </Flex>
        </Box>
      </Flex>
    </DialogBody>
    <DialogFooter>
      <Flex justify="end" gap="2">
        <Button variant="secondary" onPress={onClose} isDisabled={loading}>
          Go back
        </Button>
        <Button variant="primary" onPress={onConfirm} loading={loading}>
          Save anyway
        </Button>
      </Flex>
    </DialogFooter>
  </Dialog>
);
