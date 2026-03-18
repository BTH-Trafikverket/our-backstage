import { useEffect, useState } from 'react';
import { Box, Container, FullPage, PluginHeader, Text } from '@backstage/ui';
import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { Route, Routes } from 'react-router-dom';
import { BadgesPage } from './BadgesPage';
import { QuestsPage } from './QuestsPage';
import { TestPage } from './TestPage';

export const GamificationRootPage = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  useEffect(() => {
    const checkAdminRole = async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl('gamification');
        const response = await fetchApi.fetch(`${baseUrl}/quests/admin-status`);

        if (!response.ok) {
          throw new Error(response.statusText);
        }

        const result = await response.json();
        setIsAdmin(Boolean(result?.isAdmin));
      } catch {
        setIsAdmin(false);
      }
    };

    checkAdminRole();
  }, [discoveryApi, fetchApi]);

  const effectiveIsAdmin = demoMode ? !isAdmin : isAdmin;

  return (
    <FullPage>
      <PluginHeader
        title="Gamification"
        tabs={[
          {
            id: 'quests',
            label: 'Quests',
            href: '/gamification',
          },
          {
            id: 'badges',
            label: 'Badges',
            href: '/gamification/badges',
          },
          {
            id: 'test',
            label: 'Test',
            href: '/gamification/test',
          },
        ]}
        customActions={
          <Text variant="body-medium" color="secondary">
            Users and teams
          </Text>
        }
      />

      <Container>
        <Box style={{ paddingTop: '1.5rem', paddingBottom: '1.5rem' }}>
          <Routes>
            <Route
              path="/"
              element={
                <QuestsPage
                  isAdmin={effectiveIsAdmin}
                  onToggleDemo={() => setDemoMode(prev => !prev)}
                  isDemoMode={demoMode}
                />
              }
            />
            <Route
              path="/badges"
              element={
                <BadgesPage
                  isAdmin={effectiveIsAdmin}
                  onToggleDemo={() => setDemoMode(prev => !prev)}
                  isDemoMode={demoMode}
                />
              }
            />
            <Route path="/test" element={<TestPage isAdmin={isAdmin} />} />
          </Routes>
        </Box>
      </Container>
    </FullPage>
  );
};
