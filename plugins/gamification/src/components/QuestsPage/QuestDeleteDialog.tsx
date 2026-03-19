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
      <DialogHeader>Archive quest</DialogHeader>
      <DialogBody>
        <Flex direction="column" gap="4">
          {error ? (
            <Alert
              status="danger"
              icon
              title="Could not archive quest"
              description={error}
            />
          ) : null}

          <Box p="4">
            <Text>
              Archive &quot;{quest?.title}&quot;? It will no longer appear as an
              active quest or accept new progress, but existing progress and XP
              history will be preserved.
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
            Archive quest
          </Button>
        </Flex>
      </DialogFooter>
    </Dialog>
  );
};
