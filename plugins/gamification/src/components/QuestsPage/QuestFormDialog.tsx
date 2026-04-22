import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  Select,
  Text,
  TextField,
} from '@backstage/ui';
import type { QuestFormData } from './types';
import {
  catalogConditionOptions,
  completionPolicyOptions,
  questModeOptions,
  subjectTypeOptions,
} from './utils';

type QuestFormDialogProps = {
  isOpen: boolean;
  mode: 'create' | 'edit';
  formData: QuestFormData;
  error: string | null;
  loading: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onChange: (field: keyof QuestFormData, value: string) => void;
  questTitle?: string;
};

export const QuestFormDialog = ({
  isOpen,
  mode,
  formData,
  error,
  loading,
  onClose,
  onSubmit,
  onChange,
  questTitle,
}: QuestFormDialogProps) => {
  const title =
    mode === 'create'
      ? 'Create quest'
      : `Edit quest${questTitle ? `: ${questTitle}` : ''}`;
  const submitLabel = mode === 'create' ? 'Create quest' : 'Save changes';
  const hasReminder =
    Boolean(formData.reminder_description.trim()) ||
    Boolean(formData.reminder_day.trim());

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={open => {
        if (!open && !loading) {
          onClose();
        }
      }}
      width={760}
    >
      <DialogHeader>{title}</DialogHeader>
      <DialogBody>
        <Flex direction="column" gap="5">
          {error ? (
            <Alert
              status="danger"
              icon
              title="Could not save quest"
              description={error}
            />
          ) : null}

          <Box p="4">
            <Flex direction="column" gap="4">
              <Text weight="bold">Basics</Text>

              <TextField
                label="Title"
                value={formData.title}
                onChange={value => onChange('title', value)}
                isDisabled={loading}
                isRequired
                size="medium"
                placeholder="Name the quest"
              />

              <TextField
                label="Description"
                value={formData.description}
                onChange={value => onChange('description', value)}
                isDisabled={loading}
                isRequired
                size="medium"
                placeholder="Explain what should be done"
              />
            </Flex>
          </Box>

          <Box p="4">
            <Flex direction="column" gap="4">
              <Text weight="bold">Quest mode</Text>

              <Flex gap="2" style={{ flexWrap: 'wrap' }}>
                {questModeOptions.map(option => (
                  <Button
                    key={option.value}
                    size="small"
                    variant={
                      formData.quest_mode === option.value
                        ? 'primary'
                        : 'secondary'
                    }
                    isDisabled={loading}
                    onPress={() => onChange('quest_mode', option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </Flex>

              {formData.quest_mode === 'catalog' ? (
                <Box>
                  <Flex direction="column" gap="4">
                    <Text weight="bold">Catalog configuration</Text>

                    <Box>
                      <Text
                        as="label"
                        variant="body-small"
                        color="secondary"
                        weight="bold"
                      >
                        Catalog condition
                      </Text>
                      <Select
                        label="Select a catalog condition"
                        selectedKey={formData.catalog_condition}
                        onSelectionChange={key =>
                          onChange('catalog_condition', key ? String(key) : '')
                        }
                        isDisabled={loading}
                        options={catalogConditionOptions}
                      />
                    </Box>
                  </Flex>
                </Box>
              ) : null}

              <Box>
                <Flex direction="column" gap="3">
                  <Text weight="bold">Reminder (optional)</Text>

                  {!hasReminder ? (
                    <Flex>
                      <Button
                        size="small"
                        variant="secondary"
                        isDisabled={loading}
                        onPress={() => onChange('reminder_day', '7')}
                      >
                        + Add a reminder
                      </Button>
                    </Flex>
                  ) : (
                    <Flex direction="column" gap="3">
                      <TextField
                        label="Reminder description"
                        description="Example: Du verkar ha missat veckans dokumentation, gor klart <quest-link> sa far du 50xp"
                        value={formData.reminder_description}
                        onChange={value =>
                          onChange('reminder_description', value)
                        }
                        isDisabled={loading}
                        isRequired
                        size="medium"
                        placeholder="Write reminder text"
                      />

                      <Box style={{ maxWidth: '14rem' }}>
                        <TextField
                          label="Reminder day"
                          description="How often to send (days)"
                          value={formData.reminder_day}
                          onChange={value => onChange('reminder_day', value)}
                          isDisabled={loading}
                          isRequired
                          size="medium"
                          inputMode="numeric"
                          placeholder="7"
                        />
                      </Box>

                      <Flex>
                        <Button
                          size="small"
                          variant="tertiary"
                          isDisabled={loading}
                          onPress={() => {
                            onChange('reminder_description', '');
                            onChange('reminder_day', '');
                          }}
                        >
                          Remove reminder
                        </Button>
                      </Flex>
                    </Flex>
                  )}
                </Flex>
              </Box>
            </Flex>
          </Box>

          <Box p="4">
            <Flex direction="column" gap="4">
              <Text weight="bold">Rules</Text>

              <Flex gap="5" style={{ flexWrap: 'wrap' }}>
                <Box style={{ flex: '1 1 16rem' }}>
                  <Text
                    as="label"
                    variant="body-small"
                    color="secondary"
                    weight="bold"
                  >
                    Scope
                  </Text>
                  <Flex gap="2" mt="3" style={{ flexWrap: 'wrap' }}>
                    {subjectTypeOptions.map(option => (
                      <Button
                        key={option.value}
                        size="small"
                        variant={
                          formData.subject_type === option.value
                            ? 'primary'
                            : 'secondary'
                        }
                        isDisabled={loading}
                        onPress={() => onChange('subject_type', option.value)}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </Flex>
                </Box>

                <Box style={{ flex: '1 1 18rem' }}>
                  <Text
                    as="label"
                    variant="body-small"
                    color="secondary"
                    weight="bold"
                  >
                    Reward policy
                  </Text>
                  <Flex gap="2" mt="3" style={{ flexWrap: 'wrap' }}>
                    {completionPolicyOptions.map(option => (
                      <Button
                        key={option.value}
                        size="small"
                        variant={
                          formData.completion_policy === option.value
                            ? 'primary'
                            : 'secondary'
                        }
                        isDisabled={loading}
                        onPress={() =>
                          onChange('completion_policy', option.value)
                        }
                      >
                        {option.label}
                      </Button>
                    ))}
                  </Flex>
                </Box>
              </Flex>
            </Flex>
          </Box>

          <Box p="4">
            <Flex direction="column" gap="4">
              <Text weight="bold">Rewards</Text>

              <Flex gap="4" style={{ flexWrap: 'wrap' }}>
                <Box style={{ flex: '1 1 12rem', maxWidth: '14rem' }}>
                  <TextField
                    label="Target"
                    description="Completions needed"
                    value={formData.target_count}
                    onChange={value => onChange('target_count', value)}
                    isDisabled={loading}
                    isRequired
                    size="medium"
                    inputMode="numeric"
                    placeholder="3"
                  />
                </Box>

                <Box style={{ flex: '1 1 12rem', maxWidth: '14rem' }}>
                  <TextField
                    label="XP reward"
                    description="XP per payout"
                    value={formData.xp_reward}
                    onChange={value => onChange('xp_reward', value)}
                    isDisabled={loading}
                    isRequired
                    size="medium"
                    inputMode="numeric"
                    placeholder="50"
                  />
                </Box>

                {formData.completion_policy === 'REPEATABLE' ? (
                  <Box style={{ flex: '1 1 12rem', maxWidth: '14rem' }}>
                    <TextField
                      label="Cooldown"
                      description="Days between payouts"
                      value={formData.cooldown_days}
                      onChange={value => onChange('cooldown_days', value)}
                      isDisabled={loading}
                      size="medium"
                      inputMode="numeric"
                      placeholder="Optional"
                    />
                  </Box>
                ) : null}
              </Flex>
            </Flex>
          </Box>
        </Flex>
      </DialogBody>
      <DialogFooter>
        <Flex justify="end" gap="2">
          <Button variant="secondary" onPress={onClose} isDisabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" onPress={onSubmit} loading={loading}>
            {submitLabel}
          </Button>
        </Flex>
      </DialogFooter>
    </Dialog>
  );
};
