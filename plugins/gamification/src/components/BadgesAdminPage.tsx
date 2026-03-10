import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Box,
  MenuItem,
} from '@material-ui/core';
import EditIcon from '@material-ui/icons/Edit';
import DeleteIcon from '@material-ui/icons/Delete';
import AddIcon from '@material-ui/icons/Add';
import {
  ContentHeader,
  InfoCard,
  SupportButton,
} from '@backstage/core-components';
import { Alert } from '@material-ui/lab';

type QuestLite = {
  id: string;
  title: string;
  completion_policy: 'ONE_TIME' | 'REPEATABLE';
};

type BadgeCriteria = {
  quest_id: string;
  target_count: number;
};

type Badge = {
  id: string;
  title: string;
  description: string;
  criterias: BadgeCriteria[];
};

type BadgeFormCriteria = {
  quest_id: string;
  target_count: string;
};

type BadgeFormData = {
  title: string;
  description: string;
  criterias: BadgeFormCriteria[];
};

type BadgesAdminPageProps = {
  isAdmin: boolean;
  onToggleDemo?: () => void;
  isDemoMode?: boolean;
};

const mockQuests: QuestLite[] = [
  { id: '1', title: 'Documentation', completion_policy: 'REPEATABLE' },
  { id: '2', title: 'Write New CI Tests', completion_policy: 'REPEATABLE' },
  { id: '3', title: 'Code Contribution', completion_policy: 'REPEATABLE' },
  { id: '4', title: 'Knowledge Sharing', completion_policy: 'ONE_TIME' },
];

const mockBadges: Badge[] = [
  {
    id: '1',
    title: 'Developers',
    description: 'Complete developer related quests',
    criterias: [
      { quest_id: '1', target_count: 3 },
      { quest_id: '2', target_count: 1 },
    ],
  },
  {
    id: '2',
    title: 'System Explorers',
    description: 'Complete exploration and contribution quests',
    criterias: [
      { quest_id: '3', target_count: 2 },
      { quest_id: '4', target_count: 1 },
    ],
  },
];

const createEmptyForm = (): BadgeFormData => ({
  title: '',
  description: '',
  criterias: [{ quest_id: '', target_count: '1' }],
});

export const BadgesAdminPage = ({
  isAdmin,
  onToggleDemo,
  isDemoMode = false,
}: BadgesAdminPageProps) => {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [quests, setQuests] = useState<QuestLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<BadgeFormData>(
    createEmptyForm(),
  );

  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);
  const [editForm, setEditForm] = useState<BadgeFormData>(createEmptyForm());

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [badgeToDelete, setBadgeToDelete] = useState<Badge | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    try {
      setQuests(mockQuests);
      setBadges(mockBadges);
    } catch (e: any) {
      setError(e?.message ?? 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  const getQuestById = (questId: string) => {
    return quests.find(q => q.id === questId);
  };

  const getQuestTitle = (questId: string) => {
    const quest = getQuestById(questId);
    return quest ? quest.title : questId;
  };

  const addCriteriaRow = (setter: Dispatch<SetStateAction<BadgeFormData>>) => {
    setter(prev => ({
      ...prev,
      criterias: [...prev.criterias, { quest_id: '', target_count: '1' }],
    }));
  };

  const removeCriteriaRow = (
    setter: Dispatch<SetStateAction<BadgeFormData>>,
    idx: number,
  ) => {
    setter(prev => {
      if (prev.criterias.length <= 1) {
        return prev;
      }

      return {
        ...prev,
        criterias: prev.criterias.filter((_, i) => i !== idx),
      };
    });
  };

  const updateCriteriaField = (
    setter: Dispatch<SetStateAction<BadgeFormData>>,
    idx: number,
    field: 'quest_id' | 'target_count',
    value: string,
  ) => {
    setter(prev => ({
      ...prev,
      criterias: prev.criterias.map((c, i) => {
        if (i !== idx) {
          return c;
        }

        if (field === 'quest_id') {
          const selectedQuest = quests.find(q => q.id === value);
          const nextCount =
            selectedQuest?.completion_policy === 'ONE_TIME'
              ? '1'
              : c.target_count || '1';

          return {
            ...c,
            quest_id: value,
            target_count: nextCount,
          };
        }

        return {
          ...c,
          target_count: value,
        };
      }),
    }));
  };

  const validateBadgeForm = (form: BadgeFormData): string | null => {
    if (!form.title.trim()) return 'Title is required';
    if (!form.description.trim()) return 'Description is required';
    if (!form.criterias.length) return 'At least one criterion is required';

    const selectedIds = form.criterias
      .map(c => c.quest_id)
      .filter(id => id.trim() !== '');

    if (new Set(selectedIds).size !== selectedIds.length) {
      return 'You have selected the same quest multiple times in the criteria';
    }

    for (let i = 0; i < form.criterias.length; i++) {
      const criteria = form.criterias[i];

      if (!criteria.quest_id) {
        return `Criterion ${i + 1}: Select a quest`;
      }

      const quest = getQuestById(criteria.quest_id);
      const parsedCount = parseInt(criteria.target_count, 10);

      if (quest?.completion_policy === 'ONE_TIME') {
        if (parsedCount !== 1) {
          return `Criterion ${i + 1}: One-time quests must have a count of 1`;
        }
      } else if (
        !criteria.target_count ||
        Number.isNaN(parsedCount) ||
        parsedCount < 1
      ) {
        return `Criterion ${i + 1}: Count must be at least 1`;
      }
    }

    return null;
  };

  const openCreate = () => {
    setCreateError(null);
    setCreateForm(createEmptyForm());
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setCreateError(null);
  };

  const submitCreate = () => {
    const validation = validateBadgeForm(createForm);

    if (validation) {
      setCreateError(validation);
      return;
    }

    const newBadge: Badge = {
      id: String(Date.now()),
      title: createForm.title.trim(),
      description: createForm.description.trim(),
      criterias: createForm.criterias.map(c => ({
        quest_id: c.quest_id,
        target_count: parseInt(c.target_count, 10),
      })),
    };

    setBadges(prev => [newBadge, ...prev]);
    setCreateOpen(false);
    setCreateForm(createEmptyForm());
  };

  const openEdit = (badge: Badge) => {
    setSelectedBadge(badge);
    setEditError(null);
    setEditForm({
      title: badge.title,
      description: badge.description,
      criterias: badge.criterias.map(c => ({
        quest_id: c.quest_id,
        target_count: String(c.target_count),
      })),
    });
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setSelectedBadge(null);
    setEditError(null);
  };

  const submitEdit = () => {
    if (!selectedBadge) {
      return;
    }

    const validation = validateBadgeForm(editForm);

    if (validation) {
      setEditError(validation);
      return;
    }

    const updatedBadge: Badge = {
      ...selectedBadge,
      title: editForm.title.trim(),
      description: editForm.description.trim(),
      criterias: editForm.criterias.map(c => ({
        quest_id: c.quest_id,
        target_count: parseInt(c.target_count, 10),
      })),
    };

    setBadges(prev =>
      prev.map(badge => (badge.id === selectedBadge.id ? updatedBadge : badge)),
    );

    setEditOpen(false);
    setSelectedBadge(null);
  };

  const openDelete = (badge: Badge) => {
    setBadgeToDelete(badge);
    setDeleteOpen(true);
  };

  const closeDelete = () => {
    setDeleteOpen(false);
    setBadgeToDelete(null);
  };

  const confirmDelete = () => {
    if (!badgeToDelete) {
      return;
    }

    setBadges(prev => prev.filter(badge => badge.id !== badgeToDelete.id));
    setDeleteOpen(false);
    setBadgeToDelete(null);
  };

  const renderCriteriaSummary = (criterias: BadgeCriteria[]) => {
    if (!criterias.length) {
      return (
        <Typography variant="caption" color="textSecondary">
          Inga kriterier
        </Typography>
      );
    }

    return (
      <Box>
        {criterias.map((criteria, idx) => {
          const quest = getQuestById(criteria.quest_id);
          const policyText =
            quest?.completion_policy === 'ONE_TIME'
              ? 'One-time'
              : `Repeatable, ${criteria.target_count}x`;

          return (
            <Typography
              key={`${criteria.quest_id}-${idx}`}
              variant="caption"
              display="block"
            >
              • {getQuestTitle(criteria.quest_id)} — {policyText}
            </Typography>
          );
        })}
      </Box>
    );
  };

  const renderCriteriaRows = (
    form: BadgeFormData,
    setter: Dispatch<SetStateAction<BadgeFormData>>,
  ) => {
    return form.criterias.map((criteria, idx) => {
      const selectedQuest = quests.find(q => q.id === criteria.quest_id);
      const isOneTime = selectedQuest?.completion_policy === 'ONE_TIME';

      let helperText = 'Choose a quest';
      if (criteria.quest_id) {
        if (isOneTime) {
          helperText = 'This quest is One-time';
        } else {
          helperText = 'This quest is Repeatable';
        }
      }

      let completionPolicyValue = '';
      if (criteria.quest_id) {
        if (isOneTime) {
          completionPolicyValue = 'One-time';
        } else {
          completionPolicyValue = 'Repeatable';
        }
      }

      return (
        <Box
          key={idx}
          display="flex"
          alignItems="flex-start"
          style={{ gap: 12 }}
          mb={2}
        >
          <TextField
            select
            label="Quest"
            margin="dense"
            value={criteria.quest_id}
            onChange={e =>
              updateCriteriaField(setter, idx, 'quest_id', e.target.value)
            }
            helperText={helperText}
            style={{ flex: 1 }}
          >
            <MenuItem value="">
              <em>Select a quest</em>
            </MenuItem>
            {quests.map(q => {
              const policyLabel =
                q.completion_policy === 'ONE_TIME' ? 'One-time' : 'Repeatable';

              return (
                <MenuItem key={q.id} value={q.id}>
                  {q.title} — {policyLabel}
                </MenuItem>
              );
            })}
          </TextField>

          <TextField
            label="Completion Policy"
            margin="dense"
            value={completionPolicyValue}
            disabled
            style={{ width: 140 }}
          />

          {!isOneTime && criteria.quest_id && (
            <TextField
              label="Count"
              margin="dense"
              type="number"
              inputProps={{ min: 1 }}
              value={criteria.target_count}
              onChange={e =>
                updateCriteriaField(setter, idx, 'target_count', e.target.value)
              }
              style={{ width: 100 }}
            />
          )}

          <Button
            style={{ marginTop: 12 }}
            onClick={() => removeCriteriaRow(setter, idx)}
            disabled={form.criterias.length <= 1}
          >
            Remove
          </Button>
        </Box>
      );
    });
  };

  return (
    <>
      <Dialog open={createOpen} onClose={closeCreate} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Badge</DialogTitle>

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
            value={createForm.title}
            onChange={e => {
              setCreateForm(prev => ({ ...prev, title: e.target.value }));
              setCreateError(null);
            }}
          />

          <TextField
            fullWidth
            label="Description"
            margin="dense"
            multiline
            minRows={3}
            value={createForm.description}
            onChange={e => {
              setCreateForm(prev => ({
                ...prev,
                description: e.target.value,
              }));
              setCreateError(null);
            }}
          />

          <Box mt={3} mb={1}>
            <Typography variant="subtitle1">Criterias</Typography>
            <Typography variant="body2" color="textSecondary">
              Select a quest. One-time quests do not show a count.
            </Typography>
          </Box>

          {renderCriteriaRows(createForm, setCreateForm)}

          <Button
            startIcon={<AddIcon />}
            onClick={() => addCriteriaRow(setCreateForm)}
          >
            Add Criteria
          </Button>
        </DialogContent>

        <DialogActions>
          <Button onClick={closeCreate}>Cancel</Button>
          <Button onClick={submitCreate} color="primary" variant="contained">
            Create Badge
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editOpen} onClose={closeEdit} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Badge</DialogTitle>

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
            value={editForm.title}
            onChange={e => {
              setEditForm(prev => ({ ...prev, title: e.target.value }));
              setEditError(null);
            }}
          />

          <TextField
            fullWidth
            label="Description"
            margin="dense"
            multiline
            minRows={3}
            value={editForm.description}
            onChange={e => {
              setEditForm(prev => ({
                ...prev,
                description: e.target.value,
              }));
              setEditError(null);
            }}
          />

          <Box mt={3} mb={1}>
            <Typography variant="subtitle1">Criterias</Typography>
            <Typography variant="body2" color="textSecondary">
              Select a quest. One-time quests do not show a count.
            </Typography>
          </Box>

          {renderCriteriaRows(editForm, setEditForm)}

          <Button
            startIcon={<AddIcon />}
            onClick={() => addCriteriaRow(setEditForm)}
          >
            Add Criteria
          </Button>
        </DialogContent>

        <DialogActions>
          <Button onClick={closeEdit}>Cancel</Button>
          <Button onClick={submitEdit} color="primary" variant="contained">
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteOpen} onClose={closeDelete} maxWidth="sm" fullWidth>
        <DialogTitle>Delete Badge?</DialogTitle>

        <DialogContent>
          <Typography>
            Are you sure you want to delete "{badgeToDelete?.title}"?
          </Typography>
        </DialogContent>

        <DialogActions>
          <Button onClick={closeDelete}>Cancel</Button>
          <Button onClick={confirmDelete} color="secondary" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <InfoCard>
            <ContentHeader title="Badges">
              <SupportButton>
                Create and manage badges (admin) or view badges (user).
              </SupportButton>

              {isAdmin && (
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<AddIcon />}
                  onClick={openCreate}
                  style={{ marginRight: 8 }}
                >
                  Create Badge
                </Button>
              )}

              {onToggleDemo && (
                <Button
                  variant="outlined"
                  color="secondary"
                  onClick={onToggleDemo}
                  size="small"
                >
                  {isDemoMode ? 'Demo: Show opposite view' : 'Enable demo mode'}
                </Button>
              )}
            </ContentHeader>

            {loading && (
              <Box textAlign="center" p={2}>
                <Typography>Laddar badges...</Typography>
              </Box>
            )}

            {error && (
              <Alert severity="error" style={{ marginBottom: 16 }}>
                {error}
              </Alert>
            )}

            {!loading && !error && badges.length === 0 && (
              <Typography variant="body2">Inga badges hittades.</Typography>
            )}

            {!loading && !error && badges.length > 0 && (
              <TableContainer component={Paper} style={{ marginTop: 16 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell style={{ width: '20%' }}>Title</TableCell>
                      <TableCell style={{ width: '35%' }}>
                        Description
                      </TableCell>
                      <TableCell style={{ width: '35%' }}>Criterias</TableCell>
                      <TableCell align="right" style={{ width: '10%' }}>
                        {isAdmin ? 'Actions' : ''}
                      </TableCell>
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {badges.map(badge => (
                      <TableRow key={badge.id}>
                        <TableCell>{badge.title}</TableCell>
                        <TableCell>{badge.description}</TableCell>
                        <TableCell>
                          {renderCriteriaSummary(badge.criterias)}
                        </TableCell>
                        <TableCell align="right">
                          {isAdmin ? (
                            <>
                              <Tooltip title="Edit">
                                <IconButton
                                  size="small"
                                  color="primary"
                                  onClick={() => openEdit(badge)}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>

                              <Tooltip title="Delete">
                                <IconButton
                                  size="small"
                                  color="secondary"
                                  onClick={() => openDelete(badge)}
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </InfoCard>
        </Grid>
      </Grid>
    </>
  );
};
