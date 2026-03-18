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
import type { Quest } from './types';

type QuestDeleteDialogProps = {
  isOpen: boolean;
  quest: Quest | null;
  error: string | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export const QuestDeleteDialog = ({
  isOpen,
  quest,
  error,
  loading,
  onClose,
  onConfirm,
}: QuestDeleteDialogProps) => {
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
      <DialogHeader>Delete quest</DialogHeader>
      <DialogBody>
        <Flex direction="column" gap="4">
          {error ? (
            <Alert
              status="danger"
              icon
              title="Could not delete quest"
              description={error}
            />
          ) : null}

          <Box p="4">
            <Text>
              Delete &quot;{quest?.title}&quot; permanently? Existing progress
              rows and rewards tied to this quest definition may also be
              affected.
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
            Delete quest
          </Button>
        </Flex>
      </DialogFooter>
    </Dialog>
  );
};
