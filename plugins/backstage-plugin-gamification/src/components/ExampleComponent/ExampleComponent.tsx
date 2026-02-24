import { useState } from 'react';
import { Grid, List, ListItem, ListItemText } from '@material-ui/core';
import {
  Header,
  Page,
  Content,
  HeaderLabel,
  InfoCard,
} from '@backstage/core-components';
import { Link, Routes, Route } from 'react-router-dom';
import { HomePage } from '../HomePage';
import { QuestsAdminPage } from '../QuestsAdminPage';

export const ExampleComponent = () => {
  const [isAdmin, setIsAdmin] = useState(true);

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
                      <ListItemText primary="Home" />
                    </ListItem>
                    <ListItem
                      button
                      component={Link}
                      to="/backstage-plugin-gamification/quests"
                    >
                      <ListItemText primary="Quests" />
                    </ListItem>
                    <ListItem button>
                      <ListItemText primary="Leaderboard" />
                    </ListItem>
                    <ListItem button>
                      <ListItemText primary="Badges" />
                    </ListItem>
                  </List>
                </InfoCard>
              </Grid>
            </Grid>
          </Grid>

          <Grid item xs={12} sm={9}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route
                path="quests"
                element={
                  <QuestsAdminPage
                    isAdmin={isAdmin}
                    onToggleAdmin={() => setIsAdmin(prev => !prev)}
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
