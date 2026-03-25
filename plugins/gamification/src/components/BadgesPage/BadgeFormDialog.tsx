import { useEffect, useState } from 'react';
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
import type { BadgeFormData, BadgeSubjectType, QuestLite } from './types';
import {
  getBadgeSubjectTypeLabel,
  getCompatibleQuests,
  getQuestById,
} from './utils';

const QUEST_SELECT_BODY_CLASS = 'gamification-badge-quest-select-open';

const QuestSelectPopoverStyles = () => (
  <style>
    {`
      body.${QUEST_SELECT_BODY_CLASS} .bui-SelectPopover {
        height: 15rem;
        overflow: hidden;
      }

      body.${QUEST_SELECT_BODY_CLASS} .bui-SelectList {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
      }
    `}
  </style>
);

type QuestCriteriaSelectProps = {
  criteriaIndex: number;
  subjectType: BadgeSubjectType;
  selectedQuestId: string;
  quests: QuestLite[];
  loading: boolean;
  onSelectionChange: (value: string) => void;
};

const QuestCriteriaSelect = ({
  criteriaIndex,
  subjectType,
  selectedQuestId,
  quests,
  loading,
  onSelectionChange,
}: QuestCriteriaSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      document.body.classList.remove(QUEST_SELECT_BODY_CLASS);
      return undefined;
    }

    document.body.classList.add(QUEST_SELECT_BODY_CLASS);

    return () => {
      document.body.classList.remove(QUEST_SELECT_BODY_CLASS);
    };
  }, [isOpen]);

  const subjectLabel =
    getBadgeSubjectTypeLabel(subjectType).toLocaleLowerCase('en-US');

  return (
    <>
      <QuestSelectPopoverStyles />
      <Select
        label="Quest"
        size="medium"
        searchable
        searchPlaceholder={`Search ${subjectLabel} quests`}
        selectedKey={selectedQuestId || undefined}
        placeholder={`Select a ${subjectLabel} quest`}
        aria-label={`Quest for criterion ${criteriaIndex + 1}`}
        isDisabled={loading || quests.length === 0}
        onOpenChange={setIsOpen}
        onSelectionChange={key => onSelectionChange(key ? String(key) : '')}
        options={quests.map(quest => ({
          value: quest.id,
          label: quest.title,
        }))}
      />
    </>
  );
};

type BadgeFormDialogProps = {
  isOpen: boolean;
  mode: 'create' | 'edit';
  formData: BadgeFormData;
  quests: QuestLite[];
  error: string | null;
  loading: boolean;
  badgeTitle?: string;
  onClose: () => void;
  onSubmit: () => void;
  onChange: (field: keyof BadgeFormData, value: string) => void;
  onSubjectTypeChange: (value: BadgeSubjectType) => void;
  onAddCriteria: () => void;
  onRemoveCriteria: (index: number) => void;
  onCriteriaChange: (
    index: number,
    field: 'quest_id' | 'target_count',
    value: string,
  ) => void;
};

export const BadgeFormDialog = ({
  isOpen,
  mode,
  formData,
  quests,
  error,
  loading,
  badgeTitle,
  onClose,
  onSubmit,
  onChange,
  onSubjectTypeChange,
  onAddCriteria,
  onRemoveCriteria,
  onCriteriaChange,
}: BadgeFormDialogProps) => {
  const title =
    mode === 'create'
      ? 'Create badge'
      : `Edit badge${badgeTitle ? `: ${badgeTitle}` : ''}`;
  const submitLabel = mode === 'create' ? 'Create badge' : 'Save changes';
  const compatibleQuests = getCompatibleQuests(quests, formData.subject_type);

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={open => {
        if (!open && !loading) {
          onClose();
        }
      }}
      width={780}
    >
      <DialogHeader>{title}</DialogHeader>
      <DialogBody>
        <Flex direction="column" gap="5">
          {error ? (
            <Alert
              status="danger"
              icon
              title="Could not save badge"
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
                placeholder="Name the badge"
              />

              <TextField
                label="Description"
                value={formData.description}
                onChange={value => onChange('description', value)}
                isDisabled={loading}
                isRequired
                size="medium"
                placeholder="What does this badge represent?"
              />
            </Flex>
          </Box>

          <Box p="4">
            <Flex direction="column" gap="4">
              <Text weight="bold">Rewards</Text>

              <Flex gap="5" style={{ flexWrap: 'wrap' }}>
                <Box style={{ flex: '1 1 16rem' }}>
                  <Text
                    as="label"
                    variant="body-small"
                    color="secondary"
                    weight="bold"
                  >
                    Badge type
                  </Text>
                  <Flex gap="2" mt="3" style={{ flexWrap: 'wrap' }}>
                    {(['user', 'team'] as const).map(value => (
                      <Button
                        key={value}
                        size="small"
                        variant={
                          formData.subject_type === value
                            ? 'primary'
                            : 'secondary'
                        }
                        isDisabled={loading}
                        onPress={() => onSubjectTypeChange(value)}
                      >
                        {getBadgeSubjectTypeLabel(value)}
                      </Button>
                    ))}
                  </Flex>
                </Box>

                <Box style={{ flex: '1 1 12rem', maxWidth: '14rem' }}>
                  <TextField
                    label="XP reward"
                    value={formData.xp_reward}
                    onChange={value => onChange('xp_reward', value)}
                    isDisabled={loading}
                    isRequired
                    size="medium"
                    inputMode="numeric"
                    placeholder="25"
                  />
                </Box>
              </Flex>
            </Flex>
          </Box>

          <Box p="4">
            <Flex direction="column" gap="4">
              <Flex justify="between" align="center" gap="3">
                <Text weight="bold">Criteria</Text>
                <Button
                  size="small"
                  variant="secondary"
                  onPress={onAddCriteria}
                  isDisabled={loading}
                >
                  Add criterion
                </Button>
              </Flex>

              {formData.criterias.map((criteria, index) => {
                const selectedQuest = getQuestById(quests, criteria.quest_id);
                const isOneTime =
                  selectedQuest?.completion_policy === 'ONE_TIME';
                let helperText = `Choose a ${getBadgeSubjectTypeLabel(
                  formData.subject_type,
                ).toLocaleLowerCase('en-US')} quest.`;

                if (criteria.quest_id) {
                  helperText = isOneTime
                    ? 'One-time quests always require exactly one completion.'
                    : 'Repeatable quests can require multiple completions.';
                }

                return (
                  <Box key={index} p="4">
                    <Flex direction="column" gap="3">
                      <Flex gap="3" style={{ flexWrap: 'wrap' }}>
                        <Box style={{ flex: '1 1 18rem', minWidth: '16rem' }}>
                          <QuestCriteriaSelect
                            criteriaIndex={index}
                            subjectType={formData.subject_type}
                            selectedQuestId={criteria.quest_id}
                            quests={compatibleQuests}
                            loading={loading}
                            onSelectionChange={value =>
                              onCriteriaChange(index, 'quest_id', value)
                            }
                          />
                        </Box>

                        <Box style={{ flex: '0 0 10rem' }}>
                          <TextField
                            label="Count"
                            value={
                              isOneTime ? '1' : criteria.target_count || '1'
                            }
                            onChange={value =>
                              onCriteriaChange(index, 'target_count', value)
                            }
                            isDisabled={loading || isOneTime}
                            size="medium"
                            inputMode="numeric"
                            placeholder="1"
                          />
                        </Box>

                        <Flex align="end">
                          <Button
                            size="small"
                            variant="tertiary"
                            destructive
                            onPress={() => onRemoveCriteria(index)}
                            isDisabled={
                              loading || formData.criterias.length <= 1
                            }
                          >
                            Remove
                          </Button>
                        </Flex>
                      </Flex>

                      <Text color="secondary" variant="body-small">
                        {helperText}
                      </Text>
                    </Flex>
                  </Box>
                );
              })}
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
