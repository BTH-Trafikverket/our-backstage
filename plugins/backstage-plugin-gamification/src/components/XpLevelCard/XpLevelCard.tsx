import { useEffect, useState } from 'react';
import { InfoCard, Progress } from '@backstage/core-components';
import {
  discoveryApiRef,
  fetchApiRef,
  identityApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { LinearProgress, Typography, Box } from '@material-ui/core';

type XpStatus = {
  userRef: string;
  totalXp: number;
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  xpIntoLevel: number;
  xpToNextLevel: number;
  progress: number; // vanligtvis 0..1, men vi hanterar även 0..100
};

type Props = {
  title?: string;
  userRef?: string;

  /**
   * Din backend discovery pluginId (måste matcha backend-registreringen).
   * Default här är samma som du använde i XpDebugPage.
   */
  discoveryId?: string;
};

export const XpLevelCard = (props: Props) => {
  const {
    title = 'Level & XP',
    userRef,
    discoveryId = 'backstage-backend-gamification',
  } = props;

  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const identityApi = useApi(identityApiRef);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [data, setData] = useState<XpStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        setLoading(true);
        setError(undefined);

        const baseUrl = await discoveryApi.getBaseUrl(discoveryId);

        const url = new URL(`${baseUrl}/xp`);
        if (userRef) {
          url.searchParams.set('userRef', userRef);
        }

        const { token } = await identityApi.getCredentials();

        const resp = await fetchApi.fetch(url.toString(), {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });

        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(`${resp.status} ${resp.statusText}: ${text}`);
        }

        const json = (await resp.json()) as XpStatus;
        if (!cancelled) setData(json);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [discoveryApi, fetchApi, identityApi, userRef, discoveryId]);

  // progress kan komma som 0..1 eller 0..100 — vi normaliserar till 0..100
  const progressPct = !data
    ? 0
    : data.progress > 1
    ? Math.max(0, Math.min(100, data.progress))
    : Math.max(0, Math.min(1, data.progress)) * 100;

  return (
    <InfoCard title={title}>
      {loading ? (
        <Progress />
      ) : error ? (
        <pre style={{ whiteSpace: 'pre-wrap' }}>{error}</pre>
      ) : !data ? (
        <Typography variant="body2">No data</Typography>
      ) : (
        <Box>
          <Box display="flex" justifyContent="space-between" mb={1}>
            <Typography variant="h6">Level {data.level}</Typography>
            <Typography variant="body2">{data.totalXp} XP</Typography>
          </Box>

          <LinearProgress variant="determinate" value={progressPct} />

          <Box display="flex" justifyContent="space-between" mt={1}>
            <Typography variant="body2">
              {data.currentLevelXp}/{data.nextLevelXp} i nivån
            </Typography>
            <Typography variant="body2">
              {data.xpToNextLevel} XP kvar
            </Typography>
          </Box>

          <Typography variant="caption" color="textSecondary">
            {data.userRef}
          </Typography>
        </Box>
      )}
    </InfoCard>
  );
};
