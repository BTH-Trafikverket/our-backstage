import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Page,
  Header,
  Content,
  InfoCard,
  Progress,
} from '@backstage/core-components';
import {
  discoveryApiRef,
  fetchApiRef,
  identityApiRef,
  useApi,
} from '@backstage/core-plugin-api';

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

        // Must match BACKEND pluginId
        const baseUrl = await discoveryApi.getBaseUrl(
          'backstage-backend-gamification',
        );

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
  }, [discoveryApi, fetchApi, identityApi, userRef]);

  let body: JSX.Element;
  if (loading) {
    body = <Progress />;
  } else if (error) {
    body = <pre style={{ whiteSpace: 'pre-wrap' }}>{error}</pre>;
  } else {
    body = (
      <pre style={{ whiteSpace: 'pre-wrap' }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  }

  return (
    <Page themeId="home">
      <Header title="Gamification XP" subtitle="Debug view for XP payload" />
      <Content>
        <InfoCard title="XP status">{body}</InfoCard>
      </Content>
    </Page>
  );
};
