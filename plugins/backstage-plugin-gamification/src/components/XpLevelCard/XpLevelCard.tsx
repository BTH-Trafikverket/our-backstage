import { useEffect, useMemo, useState } from 'react';
import { InfoCard, Progress } from '@backstage/core-components';
import {
  configApiRef,
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
  progress: number; // 0..1
};

export const XpLevelCard = (props: { title?: string }) => {
  const { title = 'Level & XP' } = props;

  const configApi = useApi(configApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const identityApi = useApi(identityApiRef);

  const serviceId = useMemo(() => {
    // ✅ Kan styras i app-config.yaml:
    // gamification:
    //   discoveryServiceId: backstage-backend-gamification
    return (
      configApi.getOptionalString('gamification.discoveryServiceId') ??
      'backstage-backend-gamification'
    );
  }, [configApi]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [debugUrl, setDebugUrl] = useState<string | undefined>();
  const [data, setData] = useState<XpStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        setLoading(true);
        setError(undefined);
        setData(null);

        const baseUrl = await discoveryApi.getBaseUrl(serviceId);
        const url = `${baseUrl}/xp`;
        setDebugUrl(url);

        const { token } = await identityApi.getCredentials();

        const resp = await fetchApi.fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });

        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(
            `XP request failed.\n` +
              `serviceId: ${serviceId}\n` +
              `url: ${url}\n` +
              `status: ${resp.status} ${resp.statusText}\n` +
              (text ? `body: ${text}` : ''),
          );
        }

        const json = (await resp.json()) as XpStatus;
        if (!cancelled) setData(json);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [discoveryApi, fetchApi, identityApi, serviceId]);

  const pct = useMemo(() => {
    const p = data?.progress ?? 0;
    const clamped = Math.max(0, Math.min(1, Number.isFinite(p) ? p : 0));
    return Math.round(clamped * 100);
  }, [data]);

  return (
    <InfoCard title={title}>
      {/* ✅ Visar alltid debug-info så du vet att komponenten renderas */}
      <Typography variant="caption" color="textSecondary">
        gamification serviceId: <b>{serviceId}</b>
        {debugUrl ? (
          <>
            {' '}
            — url: <b>{debugUrl}</b>
          </>
        ) : null}
      </Typography>

      {loading ? (
        <Box mt={2}>
          <Progress />
        </Box>
      ) : error ? (
        <Box mt={2}>
          <Typography variant="body2" color="error">
            Could not load XP.
          </Typography>
          <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{error}</pre>
        </Box>
      ) : !data ? (
        <Box mt={2}>
          <Typography variant="body2">No data</Typography>
        </Box>
      ) : (
        <Box mt={2}>
          <Box display="flex" justifyContent="space-between" mb={1}>
            <Typography variant="h6">Level {data.level}</Typography>
            <Typography variant="body2">{data.totalXp} XP total</Typography>
          </Box>

          <LinearProgress variant="determinate" value={pct} />

          <Box display="flex" justifyContent="space-between" mt={1}>
            <Typography variant="body2">
              {data.xpIntoLevel} XP into level
            </Typography>
            <Typography variant="body2">
              {data.xpToNextLevel} XP to next
            </Typography>
          </Box>

          <Typography variant="caption" color="textSecondary">
            Range: {data.currentLevelXp} → {data.nextLevelXp} ({pct}%)
          </Typography>
        </Box>
      )}
    </InfoCard>
  );
};
