import { useEffect, useMemo, useState } from 'react';
import {
  InfoCard,
  Progress,
  type InfoCardVariants,
} from '@backstage/core-components';
import {
  discoveryApiRef,
  fetchApiRef,
  identityApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import {
  LinearProgress,
  Typography,
  Box,
  Tooltip,
  IconButton,
} from '@material-ui/core';
import InfoOutlinedIcon from '@material-ui/icons/InfoOutlined';

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

export const EntityXpCard = (props: {
  title?: string;
  variant?: InfoCardVariants;
}) => {
  const { title = 'Level and XP', variant = 'gridItem' } = props;

  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const identityApi = useApi(identityApiRef);

  const { entity } = useEntity();
  const userRef = useMemo(() => stringifyEntityRef(entity), [entity]);

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
        url.searchParams.set('userRef', userRef);

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
    body = <Typography color="error">{error}</Typography>;
  } else if (!data) {
    body = <Typography>No data</Typography>;
  } else {
    const progressPct = Math.max(0, Math.min(100, data.progress * 100));
    const levelTotal = data.xpIntoLevel + data.xpToNextLevel;

    body = (
      <Box>
        <Box mb={1} display="flex" alignItems="center">
          <Typography variant="h4">Level {data.level}</Typography>

          <Tooltip title={`${data.totalXp} XP total`} arrow placement="right">
            <span>
              <IconButton
                size="small"
                aria-label="Show total XP"
                style={{ marginLeft: 8 }}
              >
                <InfoOutlinedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>

        <LinearProgress variant="determinate" value={progressPct} />

        <Box mt={1}>
          <Typography variant="body2">
            {data.xpIntoLevel}/{levelTotal} XP in this level
          </Typography>
          <Typography variant="body2" color="textSecondary">
            {data.xpToNextLevel} XP until next level
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <InfoCard title={title} variant={variant}>
      {body}
    </InfoCard>
  );
};
