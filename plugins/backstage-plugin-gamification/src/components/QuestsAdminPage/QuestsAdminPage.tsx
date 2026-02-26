import { useState, useEffect, useCallback } from 'react';
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
  LinearProgress,
  Box,
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
  // Progress fields
  user_ref: string | null;
  completion_count: number;
  progress_in_interval: number;
  next_milestone: number;
};

interface CreateQuestFormData {
  title: string;
  description: string;
  interval: string;
  xp_reward: string;
}

type QuestsAdminPageProps = {
  isAdmin: boolean;
  onToggleDemo?: () => void;
  isDemoMode?: boolean;
};

export const QuestsAdminPage = ({
  isAdmin,
  onToggleDemo,
  isDemoMode = false,
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

  // Edit quest dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [selectedQuest, setSelectedQuest] = useState<Quest | null>(null);
  const [editFormData, setEditFormData] = useState<CreateQuestFormData>({
    title: '',
    description: '',
    interval: '',
    xp_reward: '',
  });

  // Delete quest dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [questToDelete, setQuestToDelete] = useState<Quest | null>(null);

  const fetchQuests = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetchApi.fetch(
        'http://localhost:7007/api/backstage-backend-gamification/quests/me',
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
  }, [fetchApi]);

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
    if (!formData.interval || parseInt(formData.interval, 10) < 1) {
      setCreateError('Interval måste vara minst 1');
      return;
    }
    if (!formData.xp_reward || parseInt(formData.xp_reward, 10) < 1) {
      setCreateError('XP Reward måste vara minst 1');
      return;
    }

    setCreateLoading(true);
    setCreateError(null);

    try {
      const response = await fetchApi.fetch(
        'http://localhost:7007/api/backstage-backend-gamification/quests/me',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: formData.title,
            description: formData.description,
            interval: parseInt(formData.interval, 10),
            xp_reward: parseInt(formData.xp_reward, 10),
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

  // Edit quest handlers
  const handleOpenEditDialog = (quest: Quest) => {
    setSelectedQuest(quest);
    setEditFormData({
      title: quest.title,
      description: quest.description,
      interval: quest.interval.toString(),
      xp_reward: quest.xp_reward.toString(),
    });
    setEditError(null);
    setEditDialogOpen(true);
  };

  const handleCloseEditDialog = () => {
    if (!editLoading) {
      setEditDialogOpen(false);
      setSelectedQuest(null);
      setEditError(null);
      setEditFormData({
        title: '',
        description: '',
        interval: '',
        xp_reward: '',
      });
    }
  };

  const handleEditInputChange = (
    field: keyof CreateQuestFormData,
    value: string,
  ) => {
    setEditFormData(prev => ({ ...prev, [field]: value }));
    setEditError(null);
  };

  const handleSaveEdit = async () => {
    if (!selectedQuest) return;

    // Validering
    if (!editFormData.title.trim()) {
      setEditError('Title är obligatorisk');
      return;
    }
    if (!editFormData.description.trim()) {
      setEditError('Description är obligatorisk');
      return;
    }
    if (!editFormData.interval || parseInt(editFormData.interval, 10) < 1) {
      setEditError('Interval måste vara minst 1');
      return;
    }
    if (!editFormData.xp_reward || parseInt(editFormData.xp_reward, 10) < 1) {
      setEditError('XP Reward måste vara minst 1');
      return;
    }

    setEditLoading(true);
    setEditError(null);

    try {
      const response = await fetchApi.fetch(
        `http://localhost:7007/api/backstage-backend-gamification/quests/${selectedQuest.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: editFormData.title,
            description: editFormData.description,
            interval: parseInt(editFormData.interval, 10),
            xp_reward: parseInt(editFormData.xp_reward, 10),
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `Fel: ${response.status} ${response.statusText}`,
        );
      }

      // Close dialog and refresh
      setEditDialogOpen(false);
      await fetchQuests();
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : 'Ett okänt fel inträffade',
      );
    } finally {
      setEditLoading(false);
    }
  };

  // Delete quest handlers
  const handleOpenDeleteDialog = (quest: Quest) => {
    setQuestToDelete(quest);
    setDeleteError(null);
    setDeleteDialogOpen(true);
  };

  const handleCloseDeleteDialog = () => {
    if (!deleteLoading) {
      setDeleteDialogOpen(false);
      setQuestToDelete(null);
      setDeleteError(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!questToDelete) return;

    setDeleteLoading(true);
    setDeleteError(null);

    try {
      const response = await fetchApi.fetch(
        `http://localhost:7007/api/backstage-backend-gamification/quests/${questToDelete.id}`,
        {
          method: 'DELETE',
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `Fel: ${response.status} ${response.statusText}`,
        );
      }

      // Close dialog and refresh
      setDeleteDialogOpen(false);
      await fetchQuests();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : 'Ett okänt fel inträffade',
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  const adminQuests = quests;
  const getQuestProgress = (quest: Quest) => ({
    current: quest.progress_in_interval,
    target: quest.interval,
  });

  return (
    <>
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

      {/* Edit Quest Dialog */}
      <Dialog
        open={editDialogOpen}
        onClose={handleCloseEditDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Edit Quest: {selectedQuest?.title}</DialogTitle>
        <DialogContent>
          {editError && (
            <Alert severity="error" style={{ marginBottom: 16 }}>
              {editError}
            </Alert>
          )}
          <TextField
            fullWidth
            label="Title"
            margin="dense"
            value={editFormData.title}
            onChange={e => handleEditInputChange('title', e.target.value)}
            disabled={editLoading}
          />
          <TextField
            fullWidth
            label="Description"
            margin="dense"
            multiline
            minRows={3}
            value={editFormData.description}
            onChange={e => handleEditInputChange('description', e.target.value)}
            disabled={editLoading}
          />
          <TextField
            fullWidth
            label="Interval"
            margin="dense"
            type="number"
            inputProps={{ min: 1 }}
            value={editFormData.interval}
            onChange={e => handleEditInputChange('interval', e.target.value)}
            disabled={editLoading}
            helperText="Hur ofta XP delas ut (1 = varje gång, 2 = varannan gång, etc.)"
          />
          <TextField
            fullWidth
            label="XP Reward"
            margin="dense"
            type="number"
            inputProps={{ min: 1 }}
            value={editFormData.xp_reward}
            onChange={e => handleEditInputChange('xp_reward', e.target.value)}
            disabled={editLoading}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseEditDialog} disabled={editLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleSaveEdit}
            color="primary"
            variant="contained"
            disabled={editLoading}
          >
            {editLoading ? (
              <>
                <CircularProgress size={16} style={{ marginRight: 8 }} />
                Sparar...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Quest Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleCloseDeleteDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete Quest?</DialogTitle>
        <DialogContent>
          {deleteError && (
            <Alert severity="error" style={{ marginBottom: 16 }}>
              {deleteError}
            </Alert>
          )}
          <Typography>
            Are you sure you want to delete "{questToDelete?.title}"? This
            action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog} disabled={deleteLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDelete}
            color="secondary"
            variant="contained"
            disabled={deleteLoading}
          >
            {deleteLoading ? (
              <>
                <CircularProgress size={16} style={{ marginRight: 8 }} />
                Tar bort...
              </>
            ) : (
              'Delete'
            )}
          </Button>
        </DialogActions>
      </Dialog>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <InfoCard>
            <ContentHeader title="Quests">
              <SupportButton>
                Skapa och hantera quests (admin) eller se tillgangliga quests
                (user).
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
              {onToggleDemo && (
                <Button
                  variant="outlined"
                  color="secondary"
                  onClick={onToggleDemo}
                  size="small"
                >
                  {isDemoMode ? 'Demo: Visa motsatt vy' : 'Aktivera demo-läge'}
                </Button>
              )}
            </ContentHeader>
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
                          <TableCell style={{ width: '20%' }}>Title</TableCell>
                          <TableCell style={{ width: '35%' }}>
                            Description
                          </TableCell>
                          <TableCell align="center" style={{ width: '15%' }}>
                            XP Reward
                          </TableCell>
                          <TableCell align="right" style={{ width: '20%' }}>
                            Progress
                          </TableCell>
                          <TableCell align="right" style={{ width: '10%' }}>
                            Actions
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {adminQuests.map(quest => (
                          <TableRow key={quest.id}>
                            <TableCell>{quest.title}</TableCell>
                            <TableCell>{quest.description}</TableCell>
                            <TableCell align="center">
                              {quest.xp_reward}
                            </TableCell>
                            <TableCell align="right">
                              {(() => {
                                const progress = getQuestProgress(quest);
                                const percent =
                                  (progress.current / progress.target) * 100;

                                return (
                                  <Box minWidth={120} textAlign="right">
                                    <LinearProgress
                                      variant="determinate"
                                      value={Math.min(
                                        100,
                                        Math.max(0, percent),
                                      )}
                                    />
                                    <Typography variant="caption">
                                      {progress.current}/{progress.target}
                                    </Typography>
                                  </Box>
                                );
                              })()}
                            </TableCell>
                            <TableCell align="right">
                              <Tooltip title="Edit">
                                <IconButton
                                  size="small"
                                  color="primary"
                                  onClick={() => handleOpenEditDialog(quest)}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete">
                                <IconButton
                                  size="small"
                                  color="secondary"
                                  onClick={() => handleOpenDeleteDialog(quest)}
                                >
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
                    <TableContainer component={Paper} style={{ marginTop: 16 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell style={{ width: '20%' }}>
                              Title
                            </TableCell>
                            <TableCell style={{ width: '30%' }}>
                              Description
                            </TableCell>
                            <TableCell align="center" style={{ width: '25%' }}>
                              XP Reward
                            </TableCell>
                            <TableCell align="right" style={{ width: '25%' }}>
                              Progress
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {quests.map(quest => (
                            <TableRow key={quest.id}>
                              <TableCell>{quest.title}</TableCell>
                              <TableCell>{quest.description}</TableCell>
                              <TableCell align="center">
                                {quest.xp_reward}
                              </TableCell>
                              <TableCell align="right">
                                {(() => {
                                  const progress = getQuestProgress(quest);
                                  const percent =
                                    (progress.current / progress.target) * 100;

                                  return (
                                    <Box minWidth={120} textAlign="right">
                                      <LinearProgress
                                        variant="determinate"
                                        value={Math.min(
                                          100,
                                          Math.max(0, percent),
                                        )}
                                      />
                                      <Typography variant="caption">
                                        {progress.current}/{progress.target}
                                      </Typography>
                                    </Box>
                                  );
                                })()}
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
