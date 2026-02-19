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
import { ExampleFetchComponent } from '../ExampleFetchComponent';
import EmojiEventsIcon from '@material-ui/icons/EmojiEvents';

export const ExampleComponent = () => (
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
        {/* Sidebar */}
        <Grid item xs={12} sm={3}>
          <Box sx={{ border: '1px solid #e0e0e0', borderRadius: 1 }}>
            <Box sx={{ p: 2, display: 'flex', alignItems: 'center' }}>
              <EmojiEventsIcon />
              <Typography variant="h6">Gamification</Typography>
            </Box>
            <Divider />
            <List dense>
              <ListItem button>
                <ListItemText primary="Leaderboard" />
              </ListItem>
              <ListItem button>
                <ListItemText primary="Quest" />
              </ListItem>
              <ListItem button>
                <ListItemText primary="Badges" />
              </ListItem>
            </List>
          </Box>
        </Grid>

        {/* Main Content */}
        <Grid item xs={12} sm={9}>
          <ContentHeader title="Plugin title">
            <SupportButton>
              A description of your plugin goes here.
            </SupportButton>
          </ContentHeader>
          <Grid container spacing={3} direction="column">
            <Grid item>
              <InfoCard title="Information card">
                <Typography variant="body1">
                  All content should be wrapped in a card like this.
                </Typography>
              </InfoCard>
            </Grid>
            <Grid item>
              <ExampleFetchComponent />
            </Grid>
          </Grid>
        </Grid>
      </Grid>
    </Content>
  </Page>
);
