import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { useApi, fetchApiRef } from '@backstage/core-plugin-api';
import { Alert } from '@material-ui/lab';

type QuestLite = {
  id: string;
  title: string;
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
  created_at?: string;
  updated_at?: string;
};

type BadgesAdminPageProps = {
  isAdmin: boolean;
  onToggleDemo?: () => void;
  isDemoMode?: boolean;
};

type BadgeFormData = {
  title: string;
  description: string;
  criterias: { quest_id: string; target_count: string }[]; // string för input/validering
};

const API_BASE = 'http://localhost:7007/api/backstage-backend-gamification';

export const BadgesAdminPage = ({
  isAdmin,
  onToggleDemo,
  isDemoMode = false,
}: BadgesAdminPageProps) => {
  const fetchApi = useApi(fetchApiRef);

  const [badges, setBadges] = useState<Badge[]>([]);
  const [quests, setQuests] = useState<QuestLite[]>([]);
  const questsById = useMemo(
    () => new Map(quests.map(q => [q.id, q.title])),
    [quests],
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<BadgeFormData>({
    title: '',
    description: '',
    criterias: [{ quest_id: '', target_count: '' }],
  });

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);
  const [editForm, setEditForm] = useState<BadgeFormData>({
    title: '',
    description: '',
    criterias: [{ quest_id: '', target_count: '' }],
  });

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [badgeToDelete, setBadgeToDelete] = useState<Badge | null>(null);

  const fetchQuestsLite = useCallback(async () => {
    // Vi använder quests som dropdown-data för criteria-input.
    // Återanvänder er befintliga endpoint (/quests/me) som ni redan kör i QuestsAdminPage.
    const resp = await fetchApi.fetch(`${API_BASE}/quests/me`);
    if (!resp.ok) {
      throw new Error(`Fel quests: ${resp.status} ${resp.statusText}`);
    }
    const data = (await resp.json()) as any[];
    return (data || []).map(q => ({
      id: String(q.id),
      title: String(q.title),
    })) as QuestLite[];
  }, [fetchApi]);

  const fetchBadges = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [questsLite, badgesResp] = await Promise.all([
        fetchQuestsLite().catch(() => [] as QuestLite[]),
        fetchApi.fetch(`${API_BASE}/badges`),
      ]);

      setQuests(questsLite);

      if (!badgesResp.ok) {
        const t = await badgesResp.text().catch(() => '');
        throw new Error(
          `Fel badges: ${badgesResp.status} ${badgesResp.statusText} ${t}`,
        );
      }

      const badgeData = (await badgesResp.json()) as Badge[];
      setBadges(badgeData || []);
    } catch (e: any) {
      setError(e?.message ?? 'Ett okänt fel inträffade');
      setBadges([]);
    } finally {
      setLoading(false);
    }
  }, [fetchApi, fetchQuestsLite]);

  useEffect(() => {
    fetchBadges();
  }, [fetchBadges]);

  // ---------- Criteria helpers ----------
  const addCriteriaRow = (setter: (updater: any) => void) => {
    setter((prev: BadgeFormData) => ({
      ...prev,
      criterias: [...prev.criterias, { quest_id: '', target_count: '' }],
    }));
  };

  const removeCriteriaRow = (setter: (updater: any) => void, idx: number) => {
    setter((prev: BadgeFormData) => {
      if (prev.criterias.length <= 1) return prev;
      return {
        ...prev,
        criterias: prev.criterias.filter((_, i) => i !== idx),
      };
    });
  };

  const updateCriteriaField = (
    setter: (updater: any) => void,
    idx: number,
    field: 'quest_id' | 'target_count',
    value: string,
  ) => {
    setter((prev: BadgeFormData) => ({
      ...prev,
      criterias: prev.criterias.map((c, i) =>
        i === idx ? { ...c, [field]: value } : c,
      ),
    }));
  };

  // ---------- Validation ----------
  const validateBadgeForm = (form: BadgeFormData): string | null => {
    if (!form.title.trim()) return 'Title är obligatorisk';
    if (!form.description.trim()) return 'Description är obligatorisk';

    if (!form.criterias.length) return 'Minst ett kriterium krävs';

    for (let i = 0; i < form.criterias.length; i++) {
      const c = form.criterias[i];

      if (!c.quest_id) return `Kriterium ${i + 1}: Välj en quest`;

      const n = parseInt(c.target_count, 10);
      if (!c.target_count || Number.isNaN(n) || n < 1) {
        return `Kriterium ${i + 1}: Target count måste vara minst 1`;
      }
    }

    const ids = form.criterias.map(c => c.quest_id);
    const uniq = new Set(ids);
    if (uniq.size !== ids.length) {
      return 'Du har valt samma quest flera gånger i kriterierna';
    }

    return null;
  };

  // ---------- Create ----------
  const openCreate = () => {
    setCreateError(null);
    setCreateForm({
      title: '',
      description: '',
      criterias: [{ quest_id: '', target_count: '' }],
    });
    setCreateOpen(true);
  };

  const closeCreate = () => {
    if (!createLoading) {
      setCreateOpen(false);
      setCreateError(null);
    }
  };

  const submitCreate = async () => {
    const validation = validateBadgeForm(createForm);
    if (validation) {
      setCreateError(validation);
      return;
    }

    setCreateLoading(true);
    setCreateError(null);

    try {
      const body = {
        title: createForm.title.trim(),
        description: createForm.description.trim(),
        criterias: createForm.criterias.map(c => ({
          quest_id: c.quest_id,
          target_count: parseInt(c.target_count, 10),
        })),
      };

      const resp = await fetchApi.fetch(`${API_BASE}/badges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(
          errJson.message || `Fel: ${resp.status} ${resp.statusText}`,
        );
      }

      setCreateOpen(false);
      await fetchBadges();
    } catch (e: any) {
      setCreateError(e?.message ?? 'Ett okänt fel inträffade');
    } finally {
      setCreateLoading(false);
    }
  };

  // ---------- Edit ----------
  const openEdit = (badge: Badge) => {
    setSelectedBadge(badge);
    setEditError(null);

    const criterias = (badge.criterias?.length ? badge.criterias : []).map(
      c => ({
        quest_id: c.quest_id,
        target_count: String(c.target_count),
      }),
    );

    setEditForm({
      title: badge.title ?? '',
      description: badge.description ?? '',
      criterias: criterias.length
        ? criterias
        : [{ quest_id: '', target_count: '' }],
    });

    setEditOpen(true);
  };

  const closeEdit = () => {
    if (!editLoading) {
      setEditOpen(false);
      setSelectedBadge(null);
      setEditError(null);
    }
  };

  const submitEdit = async () => {
    if (!selectedBadge) return;

    const validation = validateBadgeForm(editForm);
    if (validation) {
      setEditError(validation);
      return;
    }

    setEditLoading(true);
    setEditError(null);

    try {
      const body = {
        title: editForm.title.trim(),
        description: editForm.description.trim(),
        criterias: editForm.criterias.map(c => ({
          quest_id: c.quest_id,
          target_count: parseInt(c.target_count, 10),
        })),
      };

      const resp = await fetchApi.fetch(
        `${API_BASE}/badges/${selectedBadge.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(
          errJson.message || `Fel: ${resp.status} ${resp.statusText}`,
        );
      }

      setEditOpen(false);
      await fetchBadges();
    } catch (e: any) {
      setEditError(e?.message ?? 'Ett okänt fel inträffade');
    } finally {
      setEditLoading(false);
    }
  };

  // ---------- Delete ----------
  const openDelete = (badge: Badge) => {
    setBadgeToDelete(badge);
    setDeleteError(null);
    setDeleteOpen(true);
  };

  const closeDelete = () => {
    if (!deleteLoading) {
      setDeleteOpen(false);
      setBadgeToDelete(null);
      setDeleteError(null);
    }
  };

  const confirmDelete = async () => {
    if (!badgeToDelete) return;

    setDeleteLoading(true);
    setDeleteError(null);

    try {
      const resp = await fetchApi.fetch(
        `${API_BASE}/badges/${badgeToDelete.id}`,
        {
          method: 'DELETE',
        },
      );

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(
          errJson.message || `Fel: ${resp.status} ${resp.statusText}`,
        );
      }

      setDeleteOpen(false);
      await fetchBadges();
    } catch (e: any) {
      setDeleteError(e?.message ?? 'Ett okänt fel inträffade');
    } finally {
      setDeleteLoading(false);
    }
  };

  // ---------- Render helpers ----------
  const renderCriteriaSummary = (criterias: BadgeCriteria[]) => {
    if (!criterias?.length) {
      return (
        <Typography variant="caption" color="textSecondary">
          Inga kriterier
        </Typography>
      );
    }

    const shown = criterias.slice(0, 2);
    const remaining = criterias.length - shown.length;

    return (
      <Box>
        {shown.map((c, idx) => (
          <Typography
            key={`${c.quest_id}-${idx}`}
            variant="caption"
            display="block"
          >
            • {questsById.get(c.quest_id) ?? c.quest_id}: {c.target_count}x
          </Typography>
        ))}
        {remaining > 0 && (
          <Typography variant="caption" color="textSecondary">
            +{remaining} till
          </Typography>
        )}
      </Box>
    );
  };

  return (
    <>
      {/* CREATE BADGE DIALOG */}
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
              setCreateForm(p => ({ ...p, title: e.target.value }));
              setCreateError(null);
            }}
            disabled={createLoading}
          />

          <TextField
            fullWidth
            label="Description"
            margin="dense"
            multiline
            minRows={3}
            value={createForm.description}
            onChange={e => {
              setCreateForm(p => ({ ...p, description: e.target.value }));
              setCreateError(null);
            }}
            disabled={createLoading}
          />

          <Box mt={2} mb={1}>
            <Typography variant="subtitle2">Criterias</Typography>
            <Typography variant="caption" color="textSecondary">
              Välj quest + hur många gånger den måste klaras.
            </Typography>
          </Box>

          {createForm.criterias.map((c, idx) => (
            <Box
              key={idx}
              display="flex"
              alignItems="center"
              style={{ gap: 12 }}
              mb={1}
            >
              <TextField
                select
                label="Quest"
                margin="dense"
                value={c.quest_id}
                onChange={e =>
                  updateCriteriaField(
                    setCreateForm,
                    idx,
                    'quest_id',
                    e.target.value,
                  )
                }
                disabled={createLoading}
                style={{ flex: 1 }}
              >
                <MenuItem value="">
                  <em>Välj quest</em>
                </MenuItem>
                {quests.map(q => (
                  <MenuItem key={q.id} value={q.id}>
                    {q.title}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                label="Count"
                margin="dense"
                type="number"
                inputProps={{ min: 1 }}
                value={c.target_count}
                onChange={e =>
                  updateCriteriaField(
                    setCreateForm,
                    idx,
                    'target_count',
                    e.target.value,
                  )
                }
                disabled={createLoading}
                style={{ width: 140 }}
              />

              <Button
                onClick={() => removeCriteriaRow(setCreateForm, idx)}
                disabled={createLoading || createForm.criterias.length <= 1}
              >
                Remove
              </Button>
            </Box>
          ))}

          <Box mt={1}>
            <Button
              startIcon={<AddIcon />}
              onClick={() => addCriteriaRow(setCreateForm)}
              disabled={createLoading}
              size="small"
            >
              Add criteria
            </Button>
          </Box>
        </DialogContent>

        <DialogActions>
          <Button onClick={closeCreate} disabled={createLoading}>
            Cancel
          </Button>
          <Button
            onClick={submitCreate}
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
              'Create Badge'
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* EDIT BADGE DIALOG */}
      <Dialog open={editOpen} onClose={closeEdit} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Badge: {selectedBadge?.title}</DialogTitle>
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
              setEditForm(p => ({ ...p, title: e.target.value }));
              setEditError(null);
            }}
            disabled={editLoading}
          />

          <TextField
            fullWidth
            label="Description"
            margin="dense"
            multiline
            minRows={3}
            value={editForm.description}
            onChange={e => {
              setEditForm(p => ({ ...p, description: e.target.value }));
              setEditError(null);
            }}
            disabled={editLoading}
          />

          <Box mt={2} mb={1}>
            <Typography variant="subtitle2">Criterias</Typography>
            <Typography variant="caption" color="textSecondary">
              Välj quest + hur många gånger den måste klaras.
            </Typography>
          </Box>

          {editForm.criterias.map((c, idx) => (
            <Box
              key={idx}
              display="flex"
              alignItems="center"
              style={{ gap: 12 }}
              mb={1}
            >
              <TextField
                select
                label="Quest"
                margin="dense"
                value={c.quest_id}
                onChange={e =>
                  updateCriteriaField(
                    setEditForm,
                    idx,
                    'quest_id',
                    e.target.value,
                  )
                }
                disabled={editLoading}
                style={{ flex: 1 }}
              >
                <MenuItem value="">
                  <em>Välj quest</em>
                </MenuItem>
                {quests.map(q => (
                  <MenuItem key={q.id} value={q.id}>
                    {q.title}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                label="Count"
                margin="dense"
                type="number"
                inputProps={{ min: 1 }}
                value={c.target_count}
                onChange={e =>
                  updateCriteriaField(
                    setEditForm,
                    idx,
                    'target_count',
                    e.target.value,
                  )
                }
                disabled={editLoading}
                style={{ width: 140 }}
              />

              <Button
                onClick={() => removeCriteriaRow(setEditForm, idx)}
                disabled={editLoading || editForm.criterias.length <= 1}
              >
                Remove
              </Button>
            </Box>
          ))}

          <Box mt={1}>
            <Button
              startIcon={<AddIcon />}
              onClick={() => addCriteriaRow(setEditForm)}
              disabled={editLoading}
              size="small"
            >
              Add criteria
            </Button>
          </Box>
        </DialogContent>

        <DialogActions>
          <Button onClick={closeEdit} disabled={editLoading}>
            Cancel
          </Button>
          <Button
            onClick={submitEdit}
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

      {/* DELETE BADGE DIALOG */}
      <Dialog open={deleteOpen} onClose={closeDelete} maxWidth="sm" fullWidth>
        <DialogTitle>Delete Badge?</DialogTitle>
        <DialogContent>
          {deleteError && (
            <Alert severity="error" style={{ marginBottom: 16 }}>
              {deleteError}
            </Alert>
          )}
          <Typography>
            Are you sure you want to delete "{badgeToDelete?.title}"? This
            action cannot be undone.
          </Typography>
        </DialogContent>

        <DialogActions>
          <Button onClick={closeDelete} disabled={deleteLoading}>
            Cancel
          </Button>
          <Button
            onClick={confirmDelete}
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

      {/* PAGE BODY */}
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <InfoCard>
            <ContentHeader title="Badges">
              <SupportButton>
                Skapa och hantera badges (admin) eller se badges (user).
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
                  {isDemoMode ? 'Demo: Visa motsatt vy' : 'Aktivera demo-läge'}
                </Button>
              )}
            </ContentHeader>

            {loading && (
              <div style={{ textAlign: 'center', padding: 20 }}>
                <CircularProgress />
                <Typography variant="body2" style={{ marginTop: 8 }}>
                  Laddar badges...
                </Typography>
              </div>
            )}

            {error && (
              <Alert severity="error" style={{ marginBottom: 16 }}>
                {error}
              </Alert>
            )}

            {!loading && !error && badges.length === 0 && (
              <Typography variant="body2">
                Inga badges hittades.
                {isAdmin ? ' Skapa en ny badge via admin-panelen.' : ''}
              </Typography>
            )}

            {!loading && !error && badges.length > 0 && (
              <TableContainer component={Paper} style={{ marginTop: 16 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell style={{ width: '20%' }}>Title</TableCell>
                      <TableCell style={{ width: '40%' }}>
                        Description
                      </TableCell>
                      <TableCell style={{ width: '30%' }}>Criterias</TableCell>
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
                          ) : (
                            <span />
                          )}
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
