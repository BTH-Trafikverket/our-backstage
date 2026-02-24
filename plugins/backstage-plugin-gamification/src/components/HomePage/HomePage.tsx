import { Typography, Grid } from '@material-ui/core';
import {
  InfoCard,
  ContentHeader,
  SupportButton,
} from '@backstage/core-components';
import { ExampleFetchComponent } from '../ExampleFetchComponent';

export const HomePage = () => (
  <>
    <ContentHeader title="Plugin title">
      <SupportButton>A description of your plugin goes here.</SupportButton>
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
  </>
);
