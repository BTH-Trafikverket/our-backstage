import { useEffect, useState } from 'react';
import type { InfoCardVariants } from '@backstage/core-components';
import {
  Alert,
  Box,
  ButtonIcon,
  Card,
  CardBody,
  CardHeader,
  Flex,
  Grid,
  Skeleton,
  Text,
  Tooltip,
  TooltipTrigger,
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

const BADGE_FETCH_LIMIT = 100;
const BADGE_GRID_BUTTON_SIZE = '3.25rem';
const BADGE_GRID_VIEWPORT_HEIGHT = `calc((${BADGE_GRID_BUTTON_SIZE} * 2) + var(--bui-space-3) + 4px)`;

const formatBadgeDate = (value?: string | null) => {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

const PrizeIcon = () => (
  <svg
    aria-hidden
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{
      width: '1.375rem',
      height: '1.375rem',
    }}
  >
    <path d="M8 21h8" />
    <path d="M12 17v4" />
    <path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
    <path d="M16 6h2a2 2 0 0 1 0 4h-2" />
    <path d="M8 6H6a2 2 0 0 0 0 4h2" />
  </svg>
);

const renderLoadingState = () => (
  <Box aria-hidden style={{ height: BADGE_GRID_VIEWPORT_HEIGHT }}>
    <Grid.Root columns="4" gap="3" style={{ justifyItems: 'center' }}>
      {Array.from({ length: 8 }).map((_, index) => (
        <Grid.Item key={index}>
          <Skeleton height={52} width={52} rounded />
        </Grid.Item>
      ))}
    </Grid.Root>
  </Box>
);

const getBadgeCompletionText = (value?: string | null) => {
  const formatted = formatBadgeDate(value);

  return formatted ? `Completed ${formatted}` : 'Completion date unavailable';
};

const renderEarnedBadgesGrid = (badges: BadgeProgressBadge[]) => (
  <Box
    role="region"
    aria-label="Earned badges list"
    style={{
      height: BADGE_GRID_VIEWPORT_HEIGHT,
      overflowY: 'auto',
      overflowX: 'hidden',
      paddingRight: 'var(--bui-space-1)',
      scrollbarGutter: 'stable',
    }}
  >
    <Grid.Root columns="4" gap="3" style={{ justifyItems: 'center' }}>
      {badges.map(badge => (
        <Grid.Item key={badge.id}>
          <TooltipTrigger delay={0}>
            <ButtonIcon
              aria-label={`${badge.title} badge`}
              variant="secondary"
              size="medium"
              icon={<PrizeIcon />}
              style={{
                width: BADGE_GRID_BUTTON_SIZE,
                height: BADGE_GRID_BUTTON_SIZE,
                borderRadius: '999px',
                border: '1px solid var(--bui-border-1)',
                backgroundColor: 'var(--bui-bg-neutral-2)',
                color: 'var(--bui-bg-solid)',
                opacity: badge.archived_at ? 0.72 : 1,
              }}
            />
            <Tooltip placement="top">
              <Flex direction="column" gap="1">
                <Text weight="bold">{badge.title}</Text>
                <Text variant="body-small">{badge.xp_reward} XP</Text>
                <Text variant="body-small" color="secondary">
                  {getBadgeCompletionText(badge.earnedAt)}
                </Text>
              </Flex>
            </Tooltip>
          </TooltipTrigger>
        </Grid.Item>
      ))}
    </Grid.Root>
  </Box>
);

export const BadgesCard = ({
  subjectRef,
  title = 'Earned badges',
  variant: _variant = 'gridItem',
  emptyMessage = 'No earned badges yet.',
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
        const { token } = await identityApi.getCredentials();
        const headers = token
          ? { Authorization: `Bearer ${token}` }
          : undefined;
        const fetchPage = async (page: number) => {
          const url = new URL(`${baseUrl}/badges/progress`);
          url.searchParams.set('subjectRef', subjectRef);
          url.searchParams.set('status', 'earned');
          url.searchParams.set('sortBy', 'earned_at');
          url.searchParams.set('order', 'desc');
          url.searchParams.set('limit', String(BADGE_FETCH_LIMIT));
          url.searchParams.set('page', String(page));

          const response = await fetchApi.fetch(url.toString(), {
            headers,
          });

          if (!response.ok) {
            const text = await response.text();
            throw new Error(
              `${response.status} ${response.statusText}: ${text}`,
            );
          }

          return (await response.json()) as BadgeProgressResponse;
        };

        const firstPage = await fetchPage(1);
        const remainingPageNumbers = Array.from(
          { length: Math.max(0, firstPage.pagination.pages - 1) },
          (_, index) => index + 2,
        );
        const remainingPages =
          remainingPageNumbers.length > 0
            ? await Promise.all(remainingPageNumbers.map(fetchPage))
            : [];
        const badges = [firstPage, ...remainingPages].flatMap(
          page => page.badges,
        );
        const json: BadgeProgressResponse = {
          ...firstPage,
          badges,
          pagination: {
            ...firstPage.pagination,
            total: badges.length,
          },
        };

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

  const earnedBadges = data?.badges.filter(badge => badge.isEarned) ?? [];

  return (
    <Card
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <CardHeader>
        <Text weight="bold">{title}</Text>
      </CardHeader>
      <CardBody
        style={{
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
        }}
      >
        {loading ? renderLoadingState() : null}

        {!loading && error ? (
          <Alert
            status="danger"
            icon
            title="Unable to load earned badges"
            description={error}
          />
        ) : null}

        {!loading && !error && earnedBadges.length === 0 ? (
          <Flex
            align="center"
            justify="center"
            style={{ minHeight: BADGE_GRID_VIEWPORT_HEIGHT }}
          >
            <Text color="secondary">{emptyMessage}</Text>
          </Flex>
        ) : null}

        {!loading && !error && earnedBadges.length > 0
          ? renderEarnedBadgesGrid(earnedBadges)
          : null}
      </CardBody>
    </Card>
  );
};

export const EntityBadgesCard = (props: EntityBadgesCardProps) => {
  const { entity } = useEntity();
  const subjectRef = stringifyEntityRef(entity);

  return <BadgesCard {...props} subjectRef={subjectRef} />;
};
