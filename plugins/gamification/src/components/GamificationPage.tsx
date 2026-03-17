import { useEffect, useState } from 'react';
import { Grid, List, ListItem, ListItemText } from '@material-ui/core';
import {
  Content,
  Header,
  HeaderLabel,
  InfoCard,
  Page,
} from '@backstage/core-components';
import {
  configApiRef,
  identityApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { Link, Route, Routes } from 'react-router-dom';
import { BadgesAdminPage } from './BadgesAdminPage';
import { QuestsAdminPage } from './QuestsAdminPage';

export const GamificationPage = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const identityApi = useApi(identityApiRef);
  const configApi = useApi(configApiRef);

  useEffect(() => {
    const checkAdminRole = async () => {
      try {
        const identity = await identityApi.getBackstageIdentity();
        const adminGroups = new Set(
          (
            configApi.getOptionalStringArray('gamification.admin.groups') ?? []
          ).map(ref => ref.toLocaleLowerCase('en-US')),
        );

        setIsAdmin(
          identity.ownershipEntityRefs?.some(ref =>
            adminGroups.has(ref.toLocaleLowerCase('en-US')),
          ) ?? false,
        );
      } catch {
        setIsAdmin(false);
      }
    };

    checkAdminRole();
  }, [configApi, identityApi]);

  const effectiveIsAdmin = demoMode ? !isAdmin : isAdmin;

  return (
    <Page themeId="tool">
      <Header title="Gamification" subtitle="Quests, badges, and progress">
        <HeaderLabel label="Scope" value="Users and teams" />
        <HeaderLabel label="Plugin" value="Gamification" />
      </Header>

      <Content>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={3}>
            <InfoCard title="Gamification">
              <List dense>
                <ListItem button component={Link} to="/gamification">
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
                <ListItem button component={Link} to="/gamification/badges">
                  <ListItemText primary="Badges" />
                </ListItem>
              </List>
            </InfoCard>
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
