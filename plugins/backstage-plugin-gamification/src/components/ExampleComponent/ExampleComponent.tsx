import {
  Typography,
  Grid,
  Box,
  List,
  ListItem,
  ListItemText,
  Divider,
} from '@material-ui/core';
import {
  InfoCard,
  Header,
  Page,
  Content,
  ContentHeader,
  HeaderLabel,
  SupportButton,
} from '@backstage/core-components';
import { Link, Routes, Route } from 'react-router-dom';
import { HomePage } from '../HomePage';
import { QuestsAdminPage } from '../QuestsAdminPage';
import EmojiEventsIcon from '@material-ui/icons/EmojiEvents';

export const ExampleComponent = () => {
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
            <Box sx={{ border: '1px solid #e0e0e0', borderRadius: 1 }}>
              <Box sx={{ p: 2, display: 'flex', alignItems: 'center' }}>
                <EmojiEventsIcon />
                <Typography variant="h6">Gamification</Typography>
              </Box>
              <Divider />
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
            </Box>
          </Grid>

          <Grid item xs={12} sm={9}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="quests" element={<QuestsAdminPage />} />
            </Routes>
          </Grid>
        </Grid>
      </Content>
    </Page>
  );
};
