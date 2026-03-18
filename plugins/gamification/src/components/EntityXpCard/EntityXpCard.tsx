import { useEffect, useMemo, useState } from 'react';
import type { InfoCardVariants } from '@backstage/core-components';
import {
  Alert,
  Box,
  Card,
  CardBody,
  CardHeader,
  Flex,
  Skeleton,
  Text,
} from '@backstage/ui';
import {
  discoveryApiRef,
  fetchApiRef,
  identityApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef } from '@backstage/catalog-model';

type XpStatus = {
  subjectRef: string;
  totalXp: number;
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  xpIntoLevel: number;
  xpToNextLevel: number;
  progress: number;
};

type EntityXpCardProps = {
  title?: string;
  variant?: InfoCardVariants;
};

const renderLoadingState = () => (
  <Flex direction="column" gap="4">
    <Flex justify="between" align="end" gap="3">
      <Skeleton height={40} width={132} rounded />
      <Skeleton height={24} width={88} rounded />
    </Flex>
    <Skeleton height={10} width="100%" rounded />
    <Flex justify="between" gap="3">
      <Skeleton height={20} width={148} rounded />
      <Skeleton height={20} width={132} rounded />
    </Flex>
  </Flex>
);

const renderProgressBar = (progress: number) => (
  <Box
    aria-hidden
    style={{
      width: '100%',
      height: '0.625rem',
      borderRadius: '999px',
      overflow: 'hidden',
      backgroundColor: 'var(--bui-bg-neutral-2)',
    }}
  >
    <Box
      style={{
        width: `${Math.max(0, Math.min(100, progress * 100))}%`,
        height: '100%',
        borderRadius: '999px',
        backgroundColor: 'var(--bui-bg-solid)',
      }}
    />
  </Box>
);

export const EntityXpCard = ({
  title = 'Level and XP',
  variant: _variant = 'gridItem',
}: EntityXpCardProps) => {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const identityApi = useApi(identityApiRef);

  const { entity } = useEntity();
  const subjectRef = useMemo(() => stringifyEntityRef(entity), [entity]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [data, setData] = useState<XpStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        setLoading(true);
        setError(undefined);

        const baseUrl = await discoveryApi.getBaseUrl('gamification');
        const url = new URL(`${baseUrl}/xp`);
        url.searchParams.set('subjectRef', subjectRef);

        const { token } = await identityApi.getCredentials();
        const resp = await fetchApi.fetch(url.toString(), {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });

        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(`${resp.status} ${resp.statusText}: ${text}`);
        }

        const json = (await resp.json()) as XpStatus;
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

  const levelSpan = data ? data.nextLevelXp - data.currentLevelXp : 0;

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
            title="Unable to load XP"
            description={error}
          />
        ) : null}

        {!loading && !error && !data ? (
          <Text color="secondary">No XP data available.</Text>
        ) : null}

        {!loading && !error && data ? (
          <Flex direction="column" gap="4">
            <Flex justify="between" align="end" gap="3">
              <Flex direction="column" gap="1">
                <Text
                  as="div"
                  weight="bold"
                  style={{
                    fontSize: '1.875rem',
                    lineHeight: 1,
                  }}
                >
                  Level {data.level}
                </Text>
              </Flex>

              <Flex direction="column" align="end" gap="1">
                <Text weight="bold">{data.totalXp} XP</Text>
                <Text variant="body-small" color="secondary">
                  Total earned
                </Text>
              </Flex>
            </Flex>

            {renderProgressBar(data.progress)}

            <Flex justify="between" gap="3" style={{ flexWrap: 'wrap' }}>
              <Flex direction="column" gap="1">
                <Text weight="bold">
                  {data.xpIntoLevel}/{levelSpan} XP
                </Text>
              </Flex>

              <Flex direction="column" gap="1" align="end">
                <Text weight="bold">{data.xpToNextLevel} XP</Text>
                <Text variant="body-small" color="secondary">
                  Until level {data.level + 1}
                </Text>
              </Flex>
            </Flex>
          </Flex>
        ) : null}
      </CardBody>
    </Card>
  );
};
