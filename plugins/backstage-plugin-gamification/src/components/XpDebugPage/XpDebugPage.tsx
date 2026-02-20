import React from 'react';
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
import { useLocation } from 'react-router-dom';

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

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | undefined>();
  const [data, setData] = React.useState<XpStatus | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        setLoading(true);
        setError(undefined);

        // IMPORTANT: this must match your BACKEND pluginId
        const baseUrl = await discoveryApi.getBaseUrl(
          'backstage-backend-gamification',
        );

        const params = new URLSearchParams(location.search);
        const userRef = params.get('userRef')?.trim();

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
  }, [discoveryApi, fetchApi, identityApi, location.search]);

  return (
    <Page themeId="home">
      <Header title="Gamification XP" subtitle="Debug view for XP payload" />
      <Content>
        <InfoCard title="XP status">
          {loading ? (
            <Progress />
          ) : error ? (
            <pre style={{ whiteSpace: 'pre-wrap' }}>{error}</pre>
          ) : (
            <pre style={{ whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </InfoCard>
      </Content>
    </Page>
  );
};
