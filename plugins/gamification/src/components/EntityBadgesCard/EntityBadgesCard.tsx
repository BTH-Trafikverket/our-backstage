import { useEffect, useState } from 'react';
import type { InfoCardVariants } from '@backstage/core-components';
import {
  Alert,
  Box,
  Card,
  CardBody,
  CardHeader,
  Flex,
  Skeleton,
  Tag,
  TagGroup,
  Text,
} from '@backstage/ui';
import {
  discoveryApiRef,
  fetchApiRef,
  identityApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { useEntity } from '@backstage/plugin-catalog-react';

export type BadgeProgressBadge = {
  id: string;
  title: string;
  description: string;
  xp_reward: number;
  isEarned: boolean;
  earnedAt?: string | null;
  progressSubjectRef?: string | null;
  progress?: {
    completedRequirements: number;
    totalRequirements: number;
    percent: number;
  };
  criterias: Array<{
    quest_id: string;
    target_count: number;
    quest_title?: string;
    progress?: {
      current: number;
      target: number;
      percent: number;
      done: boolean;
    };
  }>;
  created_at?: string;
  updated_at?: string;
  archived_at?: string | null;
};

type BadgeProgressResponse = {
  subjectRefs: string[];
  badges: BadgeProgressBadge[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
};

export type BadgesCardProps = {
  subjectRef: string;
  title?: string;
  variant?: InfoCardVariants;
  emptyMessage?: string;
};

export type EntityBadgesCardProps = Omit<BadgesCardProps, 'subjectRef'>;

const formatBadgeDate = (value?: string | null) => {
  if (!value) {
    return 'Not earned yet';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Not earned yet';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

const renderProgressBar = (percent: number) => (
  <Box
    aria-hidden
    style={{
      width: '100%',
      height: '0.5rem',
      borderRadius: '999px',
      overflow: 'hidden',
      backgroundColor: 'var(--bui-bg-neutral-2)',
    }}
  >
    <Box
      style={{
        width: `${Math.max(0, Math.min(100, percent))}%`,
        height: '100%',
        borderRadius: '999px',
        backgroundColor: 'var(--bui-bg-solid)',
      }}
    />
  </Box>
);

const renderLoadingState = () => (
  <Flex direction="column" gap="3">
    {Array.from({ length: 3 }).map((_, index) => (
      <Flex key={index} direction="column" gap="2">
        <Skeleton height={22} width="45%" rounded />
        <Skeleton height={18} width="100%" rounded />
        <Skeleton height={8} width="100%" rounded />
      </Flex>
    ))}
  </Flex>
);

const renderBadgeRow = (badge: BadgeProgressBadge, isLast: boolean) => {
  const completedRequirements = badge.progress?.completedRequirements ?? 0;
  const totalRequirements = badge.progress?.totalRequirements ?? 0;
  const percent = badge.progress?.percent ?? 0;
  const statusLabel = badge.isEarned ? 'Earned' : 'In progress';
  const hasProgress = totalRequirements > 0;

  return (
    <Flex
      key={badge.id}
      direction="column"
      gap="3"
      style={{
        paddingBottom: isLast ? 0 : 'var(--bui-space-4)',
        borderBottom: isLast ? 'none' : '1px solid var(--bui-border-1)',
      }}
    >
      <Flex justify="between" align="start" gap="3">
        <Flex direction="column" gap="1" style={{ minWidth: 0, flex: 1 }}>
          <Text weight="bold">{badge.title}</Text>
          <Text color="secondary">{badge.description}</Text>
        </Flex>

        <Flex direction="column" align="end" gap="1">
          <Text weight="bold">{badge.xp_reward} XP</Text>
          <Text variant="body-small" color="secondary">
            Reward
          </Text>
        </Flex>
      </Flex>

      <TagGroup aria-label={`Status for ${badge.title}`}>
        <Tag id={`${badge.id}-status`}>{statusLabel}</Tag>
        {badge.archived_at ? (
          <Tag id={`${badge.id}-archived`}>Archived</Tag>
        ) : null}
        {badge.progressSubjectRef ? (
          <Tag id={`${badge.id}-subject`}>
            {badge.progressSubjectRef.split('/').pop() ??
              badge.progressSubjectRef}
          </Tag>
        ) : null}
      </TagGroup>

      {hasProgress ? (
        <Flex direction="column" gap="2">
          {renderProgressBar(percent)}
          <Flex justify="between" gap="3" style={{ flexWrap: 'wrap' }}>
            <Text variant="body-small" color="secondary">
              {completedRequirements}/{totalRequirements} requirements
            </Text>
            <Text variant="body-small" color="secondary">
              {badge.isEarned
                ? `Earned ${formatBadgeDate(badge.earnedAt)}`
                : `${percent}% complete`}
            </Text>
          </Flex>
        </Flex>
      ) : (
        <Text variant="body-small" color="secondary">
          {badge.isEarned
            ? `Earned ${formatBadgeDate(badge.earnedAt)}`
            : 'No criteria progress yet.'}
        </Text>
      )}
    </Flex>
  );
};

export const BadgesCard = ({
  subjectRef,
  title = 'Badge progress',
  variant: _variant = 'gridItem',
  emptyMessage = 'No badge progress yet.',
}: BadgesCardProps) => {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const identityApi = useApi(identityApiRef);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [data, setData] = useState<BadgeProgressResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        setLoading(true);
        setError(undefined);

        const baseUrl = await discoveryApi.getBaseUrl('gamification');
        const url = new URL(`${baseUrl}/badges/progress`);
        url.searchParams.set('subjectRef', subjectRef);

        const { token } = await identityApi.getCredentials();
        const resp = await fetchApi.fetch(url.toString(), {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });

        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(`${resp.status} ${resp.statusText}: ${text}`);
        }

        const json = (await resp.json()) as BadgeProgressResponse;
        if (!cancelled) {
          setData(json);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? String(e));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [discoveryApi, fetchApi, identityApi, subjectRef]);

  return (
    <Card style={{ height: '100%' }}>
      <CardHeader>
        <Text weight="bold">{title}</Text>
      </CardHeader>
      <CardBody>
        {loading ? renderLoadingState() : null}

        {!loading && error ? (
          <Alert
            status="danger"
            icon
            title="Unable to load badge progress"
            description={error}
          />
        ) : null}

        {!loading && !error && (!data || data.badges.length === 0) ? (
          <Text color="secondary">{emptyMessage}</Text>
        ) : null}

        {!loading && !error && data && data.badges.length > 0 ? (
          <Flex direction="column" gap="4">
            {data.badges.map((badge, index) =>
              renderBadgeRow(badge, index === data.badges.length - 1),
            )}
          </Flex>
        ) : null}
      </CardBody>
    </Card>
  );
};

export const EntityBadgesCard = (props: EntityBadgesCardProps) => {
  const { entity } = useEntity();
  const subjectRef = stringifyEntityRef(entity);

  return <BadgesCard {...props} subjectRef={subjectRef} />;
};
