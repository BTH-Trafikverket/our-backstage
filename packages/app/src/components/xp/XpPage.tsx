import { Content, Header, Page } from '@backstage/core-components';
import { Grid } from '@material-ui/core';
import { XpLevelCard } from '@internal/backstage-plugin-backstage-plugin-gamification';

export const XpPage = () => {
  return (
    <Page themeId="home">
      <Header title="XP" subtitle="Gamification" />
      <Content>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <XpLevelCard title="Level & XP" />
          </Grid>
        </Grid>
      </Content>
    </Page>
  );
};
