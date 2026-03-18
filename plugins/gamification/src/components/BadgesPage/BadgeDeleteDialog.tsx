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
import type { Badge } from './types';

type BadgeDeleteDialogProps = {
  isOpen: boolean;
  badge: Badge | null;
  error: string | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export const BadgeDeleteDialog = ({
  isOpen,
  badge,
  error,
  loading,
  onClose,
  onConfirm,
}: BadgeDeleteDialogProps) => (
  <Dialog
    isOpen={isOpen}
    onOpenChange={open => {
      if (!open && !loading) {
        onClose();
      }
    }}
    width={520}
  >
    <DialogHeader>Archive badge</DialogHeader>
    <DialogBody>
      <Flex direction="column" gap="4">
        {error ? (
          <Alert
            status="danger"
            icon
            title="Could not archive badge"
            description={error}
          />
        ) : null}

        <Box p="4">
          <Text>
            Archive &quot;{badge?.title}&quot;? It will no longer appear as an
            active badge, but existing reward history will remain.
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
          Archive badge
        </Button>
      </Flex>
    </DialogFooter>
  </Dialog>
);
