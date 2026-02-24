import { useState, useEffect } from 'react';
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
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from '@material-ui/core';
import EditIcon from '@material-ui/icons/Edit';
import DeleteIcon from '@material-ui/icons/Delete';
import AddIcon from '@material-ui/icons/Add';
import {
  ContentHeader,
  InfoCard,
  SupportButton,
} from '@backstage/core-components';
import { useApi, fetchApiRef } from '@backstage/core-plugin-api';
import { Alert } from '@material-ui/lab';

type Quest = {
  id: string;
  title: string;
  description: string;
  interval: number;
  xp_reward: number;
  created_at?: string;
  updated_at?: string;
};

interface CreateQuestFormData {
  title: string;
  description: string;
  interval: string;
  xp_reward: string;
}

type QuestsAdminPageProps = {
  isAdmin: boolean;
  onToggleAdmin: () => void;
};

export const QuestsAdminPage = ({
  isAdmin,
  onToggleAdmin,
}: QuestsAdminPageProps) => {
  const fetchApi = useApi(fetchApiRef);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create quest dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateQuestFormData>({
    title: '',
    description: '',
    interval: '',
    xp_reward: '',
  });

  const fetchQuests = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetchApi.fetch(
        'http://localhost:7007/api/backstage-backend-gamification/quests',
      );

      if (!response.ok) {
        throw new Error(`Fel: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      setQuests(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ett okänt fel inträffade');
      setQuests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuests();
  }, [fetchQuests]);

  const handleInputChange = (
    field: keyof CreateQuestFormData,
    value: string,
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setCreateError(null);
  };

  const handleCreateQuest = async () => {
    // Validering
    if (!formData.title.trim()) {
      setCreateError('Title är obligatorisk');
      return;
    }
    if (!formData.description.trim()) {
      setCreateError('Description är obligatorisk');
      return;
    }
    if (!formData.interval || parseInt(formData.interval) < 1) {
      setCreateError('Interval måste vara minst 1');
      return;
    }
    if (!formData.xp_reward || parseInt(formData.xp_reward) < 1) {
      setCreateError('XP Reward måste vara minst 1');
      return;
    }

    setCreateLoading(true);
    setCreateError(null);

    try {
      const response = await fetchApi.fetch(
        'http://localhost:7007/api/backstage-backend-gamification/quests',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: formData.title,
            description: formData.description,
            interval: parseInt(formData.interval),
            xp_reward: parseInt(formData.xp_reward),
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `Fel: ${response.status} ${response.statusText}`,
        );
      }

      // Reset form and close dialog
      setFormData({ title: '', description: '', interval: '', xp_reward: '' });
      setDialogOpen(false);

      // Refresh quest list
      await fetchQuests();
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : 'Ett okänt fel inträffade',
      );
    } finally {
      setCreateLoading(false);
    }
  };

  const handleCloseDialog = () => {
    if (!createLoading) {
      setDialogOpen(false);
      setCreateError(null);
      setFormData({ title: '', description: '', interval: '', xp_reward: '' });
    }
  };

  const availableQuests = quests;
  const ongoingQuests: Quest[] = [];
  const adminQuests = quests;

  return (
    <>
      <ContentHeader title="Quests">
        <SupportButton>
          Skapa och hantera quests (admin) eller se tillgangliga quests (user).
        </SupportButton>
        {isAdmin && (
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => setDialogOpen(true)}
            style={{ marginRight: 8 }}
          >
            Create Quest
          </Button>
        )}
        <Button variant="outlined" color="primary" onClick={onToggleAdmin}>
          {isAdmin ? 'Visa icke-admin' : 'Visa admin'}
        </Button>
      </ContentHeader>

      {/* Create Quest Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create New Quest</DialogTitle>
        <DialogContent>
          {createError && (
            <Alert severity="error" style={{ marginBottom: 16 }}>
              {createError}
            </Alert>
          )}
          <TextField
            fullWidth
            label="Title"
            margin="dense"
            value={formData.title}
            onChange={e => handleInputChange('title', e.target.value)}
            disabled={createLoading}
          />
          <TextField
            fullWidth
            label="Description"
            margin="dense"
            multiline
            minRows={3}
            value={formData.description}
            onChange={e => handleInputChange('description', e.target.value)}
            disabled={createLoading}
          />
          <TextField
            fullWidth
            label="Interval"
            margin="dense"
            type="number"
            inputProps={{ min: 1 }}
            value={formData.interval}
            onChange={e => handleInputChange('interval', e.target.value)}
            disabled={createLoading}
            helperText="Hur ofta XP delas ut (1 = varje gång, 2 = varannan gång, etc.)"
          />
          <TextField
            fullWidth
            label="XP Reward"
            margin="dense"
            type="number"
            inputProps={{ min: 1 }}
            value={formData.xp_reward}
            onChange={e => handleInputChange('xp_reward', e.target.value)}
            disabled={createLoading}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={createLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateQuest}
            color="primary"
            variant="contained"
            disabled={createLoading}
          >
            {createLoading ? (
              <>
                <CircularProgress size={16} style={{ marginRight: 8 }} />
                Skapar...
              </>
            ) : (
              'Create Quest'
            )}
          </Button>
        </DialogActions>
      </Dialog>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <InfoCard title="Quests">
            {loading && (
              <div style={{ textAlign: 'center', padding: 20 }}>
                <CircularProgress />
                <Typography variant="body2" style={{ marginTop: 8 }}>
                  Laddar quests...
                </Typography>
              </div>
            )}
            {error && (
              <Alert severity="error" style={{ marginBottom: 16 }}>
                {error}
              </Alert>
            )}
            {!loading && !error && quests.length === 0 && (
              <Typography variant="body2">
                Inga quests hittades. Skapa en ny quest via admin-panelen.
              </Typography>
            )}
            {!loading && !error && quests.length > 0 && (
              <>
                {isAdmin ? (
                  <TableContainer component={Paper} style={{ marginTop: 16 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Title</TableCell>
                          <TableCell>Description</TableCell>
                          <TableCell align="right">Interval</TableCell>
                          <TableCell align="right">XP Reward</TableCell>
                          <TableCell align="right">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {adminQuests.map(quest => (
                          <TableRow key={quest.id}>
                            <TableCell>{quest.title}</TableCell>
                            <TableCell>{quest.description}</TableCell>
                            <TableCell align="right">
                              {quest.interval}
                            </TableCell>
                            <TableCell align="right">
                              {quest.xp_reward}
                            </TableCell>
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
                              <TableCell align="right">
                                {quest.interval}
                              </TableCell>
                              <TableCell align="right">
                                {quest.xp_reward}
                              </TableCell>
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
                              <TableCell align="right">
                                {quest.interval}
                              </TableCell>
                              <TableCell align="right">
                                {quest.xp_reward}
                              </TableCell>
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
              </>
            )}
          </InfoCard>
        </Grid>
      </Grid>
    </>
  );
};
