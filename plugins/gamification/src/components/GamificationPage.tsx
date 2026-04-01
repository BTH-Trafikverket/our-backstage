import { useEffect, useState } from 'react';
import { Box, Container, FullPage, PluginHeader, Text } from '@backstage/ui';
import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminPage } from './AdminPage';
import { BadgesPage } from './BadgesPage';
import { LeaderboardPage } from './LeaderboardPage';
import { QuestsPage } from './QuestsPage';
import { TestPage } from './TestPage';

export const GamificationRootPage = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const isLocalPreviewEnabled = process.env.NODE_ENV !== 'production';

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

  const effectiveIsAdmin =
    isLocalPreviewEnabled && demoMode ? !isAdmin : isAdmin;
  const handleToggleDemoMode = () => {
    if (!isLocalPreviewEnabled) {
      return;
    }

    setDemoMode(prev => !prev);
  };
  const tabs = [
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
    ...(isAdmin
      ? [
          {
            id: 'admin',
            label: 'Admin',
            href: '/gamification/admin',
          },
        ]
      : []),
  ];

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
            id: 'leaderboard',
            label: 'Leaderboard',
            href: '/gamification/leaderboard',
          },
          {
            id: 'test',
            label: 'Test',
            href: '/gamification/test',
          },
        ]}
        customActions={
          <Text variant="body-medium" color="secondary">
            Progress and recognition
          </Text>
        }
      />

      <Container>
        <Box style={{ paddingTop: '1.5rem', paddingBottom: '1.5rem' }}>
          <Routes>
            <Route
              index
              element={
                <QuestsPage
                  isAdmin={effectiveIsAdmin}
                  onToggleDemo={
                    isLocalPreviewEnabled ? handleToggleDemoMode : undefined
                  }
                  isDemoMode={isLocalPreviewEnabled ? demoMode : false}
                />
              }
            />
            <Route
              path="badges"
              element={
                <BadgesPage
                  isAdmin={effectiveIsAdmin}
                  onToggleDemo={
                    isLocalPreviewEnabled ? handleToggleDemoMode : undefined
                  }
                  isDemoMode={isLocalPreviewEnabled ? demoMode : false}
                />
              }
            />
            <Route
              path="leaderboard"
              element={
                <LeaderboardPage
                  isAdmin={effectiveIsAdmin}
                  actualIsAdmin={isAdmin}
                  onToggleDemo={
                    isLocalPreviewEnabled ? handleToggleDemoMode : undefined
                  }
                  isDemoMode={isLocalPreviewEnabled ? demoMode : false}
                />
              }
            />
            <Route path="test" element={<TestPage isAdmin={isAdmin} />} />
          </Routes>
        </Box>
      </Container>
    </FullPage>
  );
};
