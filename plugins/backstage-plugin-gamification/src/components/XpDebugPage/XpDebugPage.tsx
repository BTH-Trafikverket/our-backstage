import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Page, Content, InfoCard, Progress } from '@backstage/core-components';
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
  progress: number;
};

export const XpDebugPage = () => {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const identityApi = useApi(identityApiRef);
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [data, setData] = useState<XpStatus | null>(null);

  const userRef = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('userRef')?.trim() || undefined;
  }, [location.search]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        setLoading(true);
        setError(undefined);

        const baseUrl = await discoveryApi.getBaseUrl(
          'backstage-backend-gamification',
        );

        const url = new URL(`${baseUrl}/xp`);
        if (userRef) url.searchParams.set('userRef', userRef);

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
  }, [discoveryApi, fetchApi, identityApi, userRef]);

  let body: JSX.Element;

  if (loading) {
    body = <Progress />;
  } else if (error) {
    body = <pre style={{ whiteSpace: 'pre-wrap' }}>{error}</pre>;
  } else if (!data) {
    body = <Typography>No data</Typography>;
  } else {
    const progressPct = data.progress > 1 ? data.progress : data.progress * 100;

    body = (
      <Box>
        <Box display="flex" justifyContent="space-between" mb={1}>
          <Typography variant="h5">{data.totalXp} XP</Typography>
          <Typography variant="body1">Level {data.level}</Typography>
        </Box>

        <LinearProgress variant="determinate" value={progressPct} />

        <Box mt={1}>
          <Typography variant="body2">
            {data.xpIntoLevel}/{data.nextLevelXp} XP i nivån
          </Typography>
          <Typography variant="body2" color="textSecondary">
            {data.xpToNextLevel} XP kvar till nästa level
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Page themeId="home">
      <Content>
        <InfoCard title="XP Profile">{body}</InfoCard>
      </Content>
    </Page>
  );
};
