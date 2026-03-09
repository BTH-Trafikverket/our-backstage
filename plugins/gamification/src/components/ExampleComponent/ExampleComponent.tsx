import { useState, useEffect } from 'react';
import { Grid, List, ListItem, ListItemText } from '@material-ui/core';
import {
  Header,
  Page,
  Content,
  HeaderLabel,
  InfoCard,
} from '@backstage/core-components';
import { Link, Routes, Route } from 'react-router-dom';
import { QuestsAdminPage } from '../QuestsAdminPage';
import { BadgesAdminPage } from '../BadgesAdminPage';
import { useApi, identityApiRef } from '@backstage/core-plugin-api';

export const ExampleComponent = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const identityApi = useApi(identityApiRef);

  useEffect(() => {
    const checkAdminRole = async () => {
      try {
        const identity = await identityApi.getBackstageIdentity();
        const isUserAdmin =
          identity.ownershipEntityRefs?.includes('group:default/admin') ??
          false;
        setIsAdmin(isUserAdmin);
      } catch (error) {
        // Failed to check admin role, default to non-admin
        setIsAdmin(false);
      }
    };

    checkAdminRole();
  }, [identityApi]);

  const effectiveIsAdmin = demoMode ? !isAdmin : isAdmin;

  return (
    <Page themeId="tool">
      <Header
        title="Welcome to backstage-plugin-gamification!"
        subtitle="Optional subtitle"
      >
        <HeaderLabel label="Owner" value="Team X" />
        <HeaderLabel label="Lifecycle" value="Alpha" />
      </Header>

      <Content>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={3}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <InfoCard title="Gamification">
                  <List dense>
                    <ListItem
                      button
                      component={Link}
                      to="/backstage-plugin-gamification"
                    >
                      <ListItemText primary="Quests" />
                    </ListItem>

                    <ListItem disabled>
                      <ListItemText
                        primary="Leaderboard"
                        primaryTypographyProps={{
                          style: { textDecoration: 'line-through' },
                        }}
                      />
                    </ListItem>

                    <ListItem
                      button
                      component={Link}
                      to="/backstage-plugin-gamification/badges"
                    >
                      <ListItemText primary="Badges" />
                    </ListItem>
                  </List>
                </InfoCard>
              </Grid>
            </Grid>
          </Grid>

          <Grid item xs={12} sm={9}>
            <Routes>
              <Route
                path="/"
                element={
                  <QuestsAdminPage
                    isAdmin={effectiveIsAdmin}
                    onToggleDemo={() => setDemoMode(prev => !prev)}
                    isDemoMode={demoMode}
                  />
                }
              />

              <Route
                path="/badges"
                element={
                  <BadgesAdminPage
                    isAdmin={effectiveIsAdmin}
                    onToggleDemo={() => setDemoMode(prev => !prev)}
                    isDemoMode={demoMode}
                  />
                }
              />
            </Routes>
          </Grid>
        </Grid>
      </Content>
    </Page>
  );
};
