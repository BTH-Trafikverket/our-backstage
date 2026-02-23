import {
  Typography,
  Grid,
  IconButton,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
} from '@material-ui/core';
import EditIcon from '@material-ui/icons/Edit';
import DeleteIcon from '@material-ui/icons/Delete';
import {
  ContentHeader,
  InfoCard,
  SupportButton,
} from '@backstage/core-components';

type QuestsAdminPageProps = {
  isAdmin: boolean;
  onToggleAdmin: () => void;
};

export const QuestsAdminPage = ({
  isAdmin,
  onToggleAdmin,
}: QuestsAdminPageProps) => {
  const quests = [
    {
      id: 'q1',
      title: 'Upload to techdocs',
      description: 'Earn XP by publishing techdocs',
      interval: 1,
      xpReward: 50,
      status: 'available',
    },
    {
      id: 'q2',
      title: 'Fix flaky tests',
      description: 'Stabilize a flaky test suite',
      interval: 2,
      xpReward: 100,
      status: 'ongoing',
    },
    {
      id: 'q3',
      title: 'Refactor legacy module',
      description: 'Clean up old code paths',
      interval: 3,
      xpReward: 200,
      status: 'completed',
    },
  ];
  const availableQuests = quests.filter(q => q.status === 'available');
  const ongoingQuests = quests.filter(q => q.status === 'ongoing');
  const adminQuests = quests;

  return (
    <>
      <ContentHeader title="Quests">
        <SupportButton>
          Skapa och hantera quests (admin) eller se tillgangliga quests (user).
        </SupportButton>
        <Button variant="outlined" color="primary" onClick={onToggleAdmin}>
          {isAdmin ? 'Visa icke-admin' : 'Visa admin'}
        </Button>
      </ContentHeader>
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <InfoCard title="Quests">
            <Typography variant="body2">
              Lista over tillgangliga och pagående quests kommer har.
            </Typography>
            {isAdmin ? (
              <TableContainer component={Paper} style={{ marginTop: 16 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Title</TableCell>
                      <TableCell>Description</TableCell>
                      <TableCell align="right">Interval</TableCell>
                      <TableCell align="right">XP Reward</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {adminQuests.map(quest => (
                      <TableRow key={quest.id}>
                        <TableCell>{quest.title}</TableCell>
                        <TableCell>{quest.description}</TableCell>
                        <TableCell align="right">{quest.interval}</TableCell>
                        <TableCell align="right">{quest.xpReward}</TableCell>
                        <TableCell>{quest.status}</TableCell>
                        <TableCell align="right">
                          <Tooltip title="Edit (TODO)">
                            <IconButton size="small" color="primary">
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete (TODO)">
                            <IconButton size="small" color="secondary">
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <>
                <Typography variant="subtitle2" style={{ marginTop: 16 }}>
                  Tillgängliga quests
                </Typography>
                <TableContainer component={Paper} style={{ marginTop: 8 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Title</TableCell>
                        <TableCell>Description</TableCell>
                        <TableCell align="right">Interval</TableCell>
                        <TableCell align="right">XP Reward</TableCell>
                        <TableCell align="right">Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {availableQuests.map(quest => (
                        <TableRow key={quest.id}>
                          <TableCell>{quest.title}</TableCell>
                          <TableCell>{quest.description}</TableCell>
                          <TableCell align="right">{quest.interval}</TableCell>
                          <TableCell align="right">{quest.xpReward}</TableCell>
                          <TableCell align="right">
                            <Button
                              size="small"
                              variant="outlined"
                              color="primary"
                            >
                              Take quest
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>

                <Typography variant="subtitle2" style={{ marginTop: 16 }}>
                  Pågående quests
                </Typography>
                <TableContainer component={Paper} style={{ marginTop: 8 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Title</TableCell>
                        <TableCell>Description</TableCell>
                        <TableCell align="right">Interval</TableCell>
                        <TableCell align="right">XP Reward</TableCell>
                        <TableCell align="right">Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {ongoingQuests.map(quest => (
                        <TableRow key={quest.id}>
                          <TableCell>{quest.title}</TableCell>
                          <TableCell>{quest.description}</TableCell>
                          <TableCell align="right">{quest.interval}</TableCell>
                          <TableCell align="right">{quest.xpReward}</TableCell>
                          <TableCell align="right">
                            <Button
                              size="small"
                              variant="outlined"
                              color="primary"
                            >
                              Complete
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}
          </InfoCard>
        </Grid>
      </Grid>
    </>
  );
};
