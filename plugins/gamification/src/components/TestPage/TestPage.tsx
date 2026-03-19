import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import {
  Alert,
  Box,
  Button,
  Flex,
  HeaderPage,
  Select,
  Tag,
  TagGroup,
  Text,
  TextField,
} from '@backstage/ui';
import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import type { Quest } from '../QuestsPage/types';
import { normalizeQuest, readErrorMessage } from '../QuestsPage/utils';

type ResolutionMode = 'githubLogin' | 'githubId' | 'email' | 'entityRef';

type GithubUser = {
  entityRef: string;
  displayName: string;
  githubLogin: string;
  githubId?: string;
  email?: string;
  picture?: string;
};

type QuestEventPayload = {
  eventId: string;
  questId: string;
  subjectRef?: string;
  actor?: {
    entityRef?: string;
    provider?: string;
    id?: string;
    login?: string;
    email?: string;
  };
};

type QuestEventResponse = {
  duplicate?: boolean;
  blocked?: boolean;
  reason?: string;
  subjectRef?: string;
  questId?: string;
  completionCount?: number;
};

type TestPageProps = {
  isAdmin: boolean;
};

const createEventId = () => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `evt-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

const formatJson = (value: unknown) => JSON.stringify(value, null, 2);

const getOutcomeCopy = (response: QuestEventResponse | null) => {
  if (!response) {
    return {
      title: 'Ready to send',
      description:
        'Choose a GitHub-linked user, attach a quest, and fire the completion event.',
      accent: 'linear-gradient(135deg, #0f766e 0%, #155e75 100%)',
    };
  }

  if (response.duplicate) {
    return {
      title: 'Duplicate event',
      description:
        'The backend recognized this event ID and skipped a second completion.',
      accent: 'linear-gradient(135deg, #92400e 0%, #b45309 100%)',
    };
  }

  if (response.blocked) {
    return {
      title: 'Blocked by quest policy',
      description:
        response.reason ||
        'The quest rejected the event because of a completion policy or cooldown.',
      accent: 'linear-gradient(135deg, #991b1b 0%, #b91c1c 100%)',
    };
  }

  return {
    title: 'Quest progress recorded',
    description: response.subjectRef
      ? `The event resolved to ${response.subjectRef}.`
      : 'The quest event completed successfully.',
    accent: 'linear-gradient(135deg, #166534 0%, #15803d 100%)',
  };
};

const getResolutionOptions = (user: GithubUser | undefined) => {
  const options: Array<{ value: ResolutionMode; label: string }> = [];

  if (user?.githubLogin) {
    options.push({ value: 'githubLogin', label: 'GitHub login' });
  }

  if (user?.githubId) {
    options.push({ value: 'githubId', label: 'GitHub id' });
  }

  if (user?.email) {
    options.push({ value: 'email', label: 'Email' });
  }

  options.push({ value: 'entityRef', label: 'Catalog entity ref' });

  return options;
};

const buildPayload = (params: {
  eventId: string;
  questId: string;
  user: GithubUser;
  resolutionMode: ResolutionMode;
}): QuestEventPayload => {
  const { eventId, questId, user, resolutionMode } = params;

  if (resolutionMode === 'githubId' && user.githubId) {
    return {
      eventId,
      questId,
      actor: {
        provider: 'github',
        id: user.githubId,
      },
    };
  }

  if (resolutionMode === 'email' && user.email) {
    return {
      eventId,
      questId,
      actor: {
        provider: 'github',
        email: user.email,
      },
    };
  }

  if (resolutionMode === 'entityRef') {
    return {
      eventId,
      questId,
      actor: {
        entityRef: user.entityRef,
      },
    };
  }

  return {
    eventId,
    questId,
    actor: {
      provider: 'github',
      login: user.githubLogin,
    },
  };
};

const getPreferredUserRef = (users: GithubUser[]) => {
  const preferredUser = users.find(
    user => user.githubLogin.toLocaleLowerCase('en-US') === 'skz911',
  );

  return preferredUser?.entityRef ?? users[0]?.entityRef ?? '';
};

const sectionStyle: CSSProperties = {
  borderRadius: '0.75rem',
  border: '1px solid var(--bui-border)',
  background: 'var(--bui-bg-surface-1)',
};

const mutedCodeStyle: CSSProperties = {
  margin: 0,
  padding: '1rem',
  borderRadius: '0.75rem',
  border: '1px solid var(--bui-border)',
  background: 'var(--bui-bg-surface-2)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontSize: '0.85rem',
  lineHeight: 1.6,
};

export const TestPage = ({ isAdmin }: TestPageProps) => {
  const fetchApi = useApi(fetchApiRef);
  const discoveryApi = useApi(discoveryApiRef);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [users, setUsers] = useState<GithubUser[]>([]);
  const [quests, setQuests] = useState<Quest[]>([]);

  const [selectedUserRef, setSelectedUserRef] = useState('');
  const [selectedQuestId, setSelectedQuestId] = useState('');
  const [resolutionMode, setResolutionMode] =
    useState<ResolutionMode>('githubLogin');
  const [eventId, setEventId] = useState(createEventId());

  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [response, setResponse] = useState<QuestEventResponse | null>(null);

  const buildGamificationUrl = useCallback(
    async (path: string) => {
      const baseUrl = await discoveryApi.getBaseUrl('gamification');
      return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    },
    [discoveryApi],
  );

  const loadData = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      setUsers([]);
      setQuests([]);
      return;
    }

    setLoading(true);
    setLoadError(null);

    try {
      const [usersUrl, questsUrl] = await Promise.all([
        buildGamificationUrl('/quests/test/users'),
        buildGamificationUrl('/quests?page=1&limit=1000'),
      ]);

      const [usersResponse, questsResponse] = await Promise.all([
        fetchApi.fetch(usersUrl),
        fetchApi.fetch(questsUrl),
      ]);

      if (!usersResponse.ok) {
        throw new Error(await readErrorMessage(usersResponse));
      }

      if (!questsResponse.ok) {
        throw new Error(await readErrorMessage(questsResponse));
      }

      const usersPayload = await usersResponse.json();
      const questsPayload = await questsResponse.json();

      const nextUsers = Array.isArray(usersPayload.users)
        ? usersPayload.users
        : [];
      const nextQuests = (
        Array.isArray(questsPayload.data) ? questsPayload.data : []
      )
        .map(normalizeQuest)
        .filter((quest: Quest) => (quest.subject_type ?? 'user') === 'user');

      setUsers(nextUsers);
      setQuests(nextQuests);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'Failed to load demo data',
      );
      setUsers([]);
      setQuests([]);
    } finally {
      setLoading(false);
    }
  }, [buildGamificationUrl, fetchApi, isAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!users.length) {
      setSelectedUserRef('');
      return;
    }

    const selectedUserStillExists = users.some(
      user => user.entityRef === selectedUserRef,
    );

    if (!selectedUserStillExists) {
      setSelectedUserRef(getPreferredUserRef(users));
    }
  }, [selectedUserRef, users]);

  useEffect(() => {
    if (!quests.length) {
      setSelectedQuestId('');
      return;
    }

    const selectedQuestStillExists = quests.some(
      quest => quest.id === selectedQuestId,
    );

    if (!selectedQuestStillExists) {
      setSelectedQuestId(quests[0].id);
    }
  }, [quests, selectedQuestId]);

  const selectedUser = users.find(user => user.entityRef === selectedUserRef);
  const selectedQuest = quests.find(quest => quest.id === selectedQuestId);
  const resolutionOptions = getResolutionOptions(selectedUser);

  useEffect(() => {
    if (!resolutionOptions.length) {
      return;
    }

    const modeStillAvailable = resolutionOptions.some(
      option => option.value === resolutionMode,
    );

    if (!modeStillAvailable) {
      setResolutionMode(resolutionOptions[0].value);
    }
  }, [resolutionMode, resolutionOptions]);

  const payloadPreview =
    selectedQuest && selectedUser
      ? buildPayload({
          eventId,
          questId: selectedQuest.id,
          user: selectedUser,
          resolutionMode,
        })
      : null;
  const outcomeCopy = getOutcomeCopy(response);

  const handleSubmit = async () => {
    if (!selectedQuest || !selectedUser || !payloadPreview) {
      setSubmitError('Select a GitHub user and a quest before sending.');
      return;
    }

    setSubmitLoading(true);
    setSubmitError(null);

    try {
      const url = await buildGamificationUrl('/quests/test/events');
      const submitResponse = await fetchApi.fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payloadPreview),
      });

      if (!submitResponse.ok) {
        throw new Error(await readErrorMessage(submitResponse));
      }

      const result = await submitResponse.json();
      const nextResponse = result as QuestEventResponse;

      setResponse(nextResponse);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Failed to send event',
      );
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <Flex direction="column" gap="4">
      <HeaderPage
        title="Test"
        customActions={
          isAdmin ? (
            <Flex gap="2" style={{ flexWrap: 'wrap' }}>
              <Button
                size="small"
                variant="secondary"
                onPress={() => setEventId(createEventId())}
              >
                New event ID
              </Button>
              <Button
                size="small"
                variant="tertiary"
                onPress={loadData}
                isDisabled={loading}
              >
                Refresh data
              </Button>
            </Flex>
          ) : undefined
        }
      />

      {!isAdmin ? (
        <Alert
          status="danger"
          icon
          title="Admin access is required"
          description="This test console proxies quest events through an admin-only backend route."
        />
      ) : null}

      {loadError ? (
        <Alert
          status="danger"
          icon
          title="Unable to load demo data"
          description={loadError}
        />
      ) : null}

      <Box
        style={{
          maxWidth: '56rem',
        }}
      >
        <Box p="5" style={sectionStyle}>
          <Flex direction="column" gap="5">
            <Flex direction="column" gap="2">
              <Text weight="bold" style={{ fontSize: '1.15rem' }}>
                Quest completion demo
              </Text>
              <Text color="secondary">
                Send a quest event from the UI using the same backend logic as
                the service endpoint. Keep the same event ID to show duplicate
                handling, or generate a new one for a fresh completion.
              </Text>
            </Flex>

            {submitError ? (
              <Alert
                status="danger"
                icon
                title="Could not send quest event"
                description={submitError}
              />
            ) : null}

            <Box
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
                gap: '1rem',
              }}
            >
              <Select
                label="GitHub user"
                searchable
                size="medium"
                selectedKey={selectedUserRef || undefined}
                onSelectionChange={key => {
                  setSelectedUserRef(key ? String(key) : '');
                  setSubmitError(null);
                }}
                isDisabled={loading || submitLoading || !users.length}
                options={[
                  {
                    value: '',
                    label: loading ? 'Loading users...' : 'Select a user',
                  },
                  ...users.map(user => ({
                    value: user.entityRef,
                    label: `${user.displayName} (@${user.githubLogin})`,
                  })),
                ]}
              />

              <Select
                label="Quest"
                size="medium"
                selectedKey={selectedQuestId || undefined}
                onSelectionChange={key => {
                  setSelectedQuestId(key ? String(key) : '');
                  setSubmitError(null);
                }}
                isDisabled={loading || submitLoading || !quests.length}
                options={[
                  {
                    value: '',
                    label: loading ? 'Loading quests...' : 'Select a quest',
                  },
                  ...quests.map(quest => ({
                    value: quest.id,
                    label: quest.title,
                  })),
                ]}
              />

              <Select
                label="Resolution mode"
                size="medium"
                selectedKey={resolutionMode}
                onSelectionChange={key => {
                  if (key) {
                    setResolutionMode(String(key) as ResolutionMode);
                    setSubmitError(null);
                  }
                }}
                isDisabled={loading || submitLoading}
                options={resolutionOptions.map(option => ({
                  value: option.value,
                  label: option.label,
                }))}
              />
            </Box>

            {selectedQuest || selectedUser ? (
              <Box
                p="4"
                style={{
                  ...sectionStyle,
                  background: 'var(--bui-bg-surface-2)',
                }}
              >
                <Flex direction="column" gap="2">
                  {selectedUser ? (
                    <Text color="secondary">
                      {`User: ${selectedUser.displayName} (@${selectedUser.githubLogin})`}
                    </Text>
                  ) : null}
                  {selectedQuest ? (
                    <Text color="secondary">
                      {`Quest: ${selectedQuest.title} • ${selectedQuest.xp_reward} XP`}
                    </Text>
                  ) : null}
                  {selectedQuest?.description ? (
                    <Text color="secondary">{selectedQuest.description}</Text>
                  ) : null}
                </Flex>
              </Box>
            ) : null}

            <Flex gap="3" align="end" style={{ flexWrap: 'wrap' }}>
              <Box style={{ flex: '1 1 24rem' }}>
                <TextField
                  label="Event ID"
                  value={eventId}
                  onChange={value => {
                    setEventId(value);
                    setSubmitError(null);
                  }}
                  isDisabled={submitLoading}
                  isRequired
                  size="medium"
                  placeholder="evt-demo-001"
                />
              </Box>

              <Button
                variant="primary"
                onPress={handleSubmit}
                loading={submitLoading}
                isDisabled={!payloadPreview || loading}
              >
                Trigger quest completion
              </Button>
            </Flex>
          </Flex>
        </Box>
      </Box>

      <Box
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)',
          gap: '1rem',
        }}
      >
        <Box p="4" style={sectionStyle}>
          <Flex direction="column" gap="3">
            <Text weight="bold">Request preview</Text>
            <Text color="secondary">
              This is the payload the page sends to the admin demo endpoint.
            </Text>
            <pre style={mutedCodeStyle}>
              {payloadPreview
                ? formatJson(payloadPreview)
                : 'Select a user and quest to build the payload.'}
            </pre>
          </Flex>
        </Box>

        <Box p="4" style={sectionStyle}>
          <Flex direction="column" gap="3">
            <Text weight="bold">Latest response</Text>
            <Text color="secondary">{outcomeCopy.title}</Text>
            <pre style={mutedCodeStyle}>
              {response ? formatJson(response) : 'No response yet.'}
            </pre>
            {response?.subjectRef ? (
              <TagGroup aria-label="Response metadata">
                <Tag id="test-response-subject">{response.subjectRef}</Tag>
                {typeof response.completionCount === 'number' ? (
                  <Tag id="test-response-count">
                    {`Completion ${response.completionCount}`}
                  </Tag>
                ) : null}
              </TagGroup>
            ) : null}
          </Flex>
        </Box>
      </Box>
    </Flex>
  );
};
