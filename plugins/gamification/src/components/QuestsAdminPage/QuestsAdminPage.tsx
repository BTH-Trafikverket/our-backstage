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
  FormControl,
  FormControlLabel,
  FormLabel,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Chip,
} from '@material-ui/core';
import EditIcon from '@material-ui/icons/Edit';
import DeleteIcon from '@material-ui/icons/Delete';
import AddIcon from '@material-ui/icons/Add';
import {
  ContentHeader,
  InfoCard,
  SupportButton,
} from '@backstage/core-components';
import {
  useApi,
  fetchApiRef,
  discoveryApiRef,
  identityApiRef,
} from '@backstage/core-plugin-api';
import { Alert } from '@material-ui/lab';

type Quest = {
  id: string;
  title: string;
  description: string;
  target_count: number;
  xp_reward: number;
  subject_type?: 'user' | 'team';
  completion_policy: 'ONE_TIME' | 'REPEATABLE';
  cooldown_days: number | null;
  created_at?: string;
  updated_at?: string;

  subject_ref?: string | null;
  completion_count: number;
  progress_toward_target: number;
  next_milestone: number;
};

interface CreateQuestFormData {
  title: string;
  description: string;
  target_count: string;
  xp_reward: string;
  /** 'user' | 'team' – kept as string for form input compatibility */
  subject_type: string;
  /** 'ONE_TIME' | 'REPEATABLE' – kept as string for form input compatibility */
  completion_policy: string;
  cooldown_days: string;
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
  const discoveryApi = useApi(discoveryApiRef);
  const identityApi = useApi(identityApiRef);
  const pluginId = 'gamification';

  const buildGamificationUrl = useCallback(
    async (path: string, query?: Record<string, string>) => {
      const baseUrl = await discoveryApi.getBaseUrl(pluginId);
      const url = new URL(
        `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`,
      );

      if (query) {
        for (const [k, v] of Object.entries(query)) {
          if (v !== undefined && v !== null && `${v}`.trim() !== '') {
            url.searchParams.set(k, `${v}`);
          }
        }
      }

      return url.toString();
    },
    [discoveryApi],
  );
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');
  const [audienceFilter, setAudienceFilter] = useState<
    'all' | 'individual' | 'team'
  >('all');
  const [statusFilter, setStatusFilter] = useState<
    'active' | 'completed' | 'all'
  >('active');
  const [teamFilter, setTeamFilter] = useState<string>('');
  const [teamOptions, setTeamOptions] = useState<string[]>([]);
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(10);
  const [total, setTotal] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [sortBy, setSortBy] = useState<'created_at' | 'title' | 'xp_reward'>(
    'created_at',
  );
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');

  // Create quest dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateQuestFormData>({
    title: '',
    description: '',
    target_count: '',
    xp_reward: '',
    subject_type: 'user',
    completion_policy: 'REPEATABLE',
    cooldown_days: '',
  });

  // Edit quest dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [selectedQuest, setSelectedQuest] = useState<Quest | null>(null);
  const [editFormData, setEditFormData] = useState<CreateQuestFormData>({
    title: '',
    description: '',
    target_count: '',
    xp_reward: '',
    subject_type: 'user',
    completion_policy: 'REPEATABLE',
    cooldown_days: '',
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
      const url = await buildGamificationUrl('/quests/me', {
        ...(search.trim() ? { search: search.trim() } : {}),
        audience: audienceFilter,
        status: statusFilter,
        ...(audienceFilter === 'team' && teamFilter
          ? { team: teamFilter }
          : {}),
        sortBy,
        order,
        page: String(page),
        limit: String(limit),
      });

      const response = await fetchApi.fetch(url);

      if (!response.ok) {
        throw new Error(`Error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      // Handle paginated response
      if (result && result.data && result.pagination) {
        setQuests(result.data || []);
        setTotal(result.pagination.total || 0);
        setTotalPages(result.pagination.totalPages || 1);
      } else if (Array.isArray(result)) {
        // Fallback for non-paginated response
        setQuests(result);
        setTotal(result.length);
        setTotalPages(1);
      } else {
        setQuests([]);
        setTotal(0);
        setTotalPages(1);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'An unknown error occurred',
      );
      setQuests([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [
    fetchApi,
    search,
    audienceFilter,
    statusFilter,
    teamFilter,
    sortBy,
    order,
    page,
    limit,
    buildGamificationUrl,
  ]);

  useEffect(() => {
    fetchQuests();
  }, [fetchQuests]);

  // Reset to page 1 when filters/search/sort change
  useEffect(() => {
    setPage(1);
  }, [search, audienceFilter, statusFilter, teamFilter, sortBy, order]);

  useEffect(() => {
    let mounted = true;

    const loadTeams = async () => {
      try {
        const identity = await identityApi.getBackstageIdentity();
        const refs = identity.ownershipEntityRefs ?? [];
        const teams = refs.filter(ref =>
          ref.toLocaleLowerCase('en-US').startsWith('group:'),
        );
        if (!mounted) {
          return;
        }
        setTeamOptions(teams);
        if (teams.length > 0 && !teamFilter) {
          setTeamFilter(teams[0]);
        }
      } catch {
        if (!mounted) {
          return;
        }
        setTeamOptions([]);
      }
    };

    loadTeams();

    return () => {
      mounted = false;
    };
  }, [identityApi, teamFilter]);

  const handleInputChange = (
    field: keyof CreateQuestFormData,
    value: string,
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setCreateError(null);
  };

  const handleCreateQuest = async () => {
    // Validation
    if (!formData.title.trim()) {
      setCreateError('Title is required');
      return;
    }
    if (!formData.description.trim()) {
      setCreateError('Description is required');
      return;
    }
    if (!formData.target_count || parseInt(formData.target_count, 10) < 1) {
      setCreateError('Target count must be at least 1');
      return;
    }
    if (!formData.xp_reward || parseInt(formData.xp_reward, 10) < 1) {
      setCreateError('XP Reward must be at least 1');
      return;
    }
    setCreateLoading(true);
    setCreateError(null);

    try {
      const url = await buildGamificationUrl('/quests');

      const response = await fetchApi.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          xp_reward: parseInt(formData.xp_reward, 10),
          subject_type: formData.subject_type,
          completion_policy: formData.completion_policy,
          target_count: parseInt(formData.target_count, 10),
          ...(formData.completion_policy === 'REPEATABLE' && {
            cooldown_days: formData.cooldown_days
              ? parseInt(formData.cooldown_days, 10)
              : null,
          }),
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message ||
            `Error: ${response.status} ${response.statusText}`,
        );
      }

      // Reset form and close dialog
      setFormData({
        title: '',
        description: '',
        target_count: '',
        xp_reward: '',
        subject_type: 'user',
        completion_policy: 'REPEATABLE',
        cooldown_days: '',
      });
      setDialogOpen(false);

      // Refresh quest list
      await fetchQuests();
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : 'An unknown error occurred',
      );
    } finally {
      setCreateLoading(false);
    }
  };

  const handleCloseDialog = () => {
    if (!createLoading) {
      setDialogOpen(false);
      setCreateError(null);
      setFormData({
        title: '',
        description: '',
        target_count: '',
        xp_reward: '',
        subject_type: 'user',
        completion_policy: 'REPEATABLE',
        cooldown_days: '',
      });
    }
  };

  // Edit quest handlers
  const handleOpenEditDialog = (quest: Quest) => {
    setSelectedQuest(quest);
    setEditFormData({
      title: quest.title,
      description: quest.description,
      target_count: quest.target_count.toString(),
      xp_reward: quest.xp_reward.toString(),
      subject_type: quest.subject_type ?? 'user',
      completion_policy: quest.completion_policy ?? 'REPEATABLE',
      cooldown_days: quest.cooldown_days?.toString() ?? '',
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
        target_count: '',
        xp_reward: '',
        subject_type: 'user',
        completion_policy: 'REPEATABLE',
        cooldown_days: '',
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

    // Validation
    if (!editFormData.title.trim()) {
      setEditError('Title is required');
      return;
    }
    if (!editFormData.description.trim()) {
      setEditError('Description is required');
      return;
    }
    if (
      !editFormData.target_count ||
      parseInt(editFormData.target_count, 10) < 1
    ) {
      setEditError('Target count must be at least 1');
      return;
    }
    if (!editFormData.xp_reward || parseInt(editFormData.xp_reward, 10) < 1) {
      setEditError('XP Reward must be at least 1');
      return;
    }
    setEditLoading(true);
    setEditError(null);

    try {
      const url = await buildGamificationUrl(`/quests/${selectedQuest.id}`);

      const response = await fetchApi.fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editFormData.title,
          description: editFormData.description,
          xp_reward: parseInt(editFormData.xp_reward, 10),
          subject_type: editFormData.subject_type,
          completion_policy: editFormData.completion_policy,
          target_count: parseInt(editFormData.target_count, 10),
          ...(editFormData.completion_policy === 'REPEATABLE' && {
            cooldown_days: editFormData.cooldown_days
              ? parseInt(editFormData.cooldown_days, 10)
              : null,
          }),
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message ||
            `Error: ${response.status} ${response.statusText}`,
        );
      }

      // Close dialog and refresh
      setEditDialogOpen(false);
      await fetchQuests();
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : 'An unknown error occurred',
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
      const url = await buildGamificationUrl(`/quests/${questToDelete.id}`);

      const response = await fetchApi.fetch(url, { method: 'DELETE' });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message ||
            `Error: ${response.status} ${response.statusText}`,
        );
      }

      // Close dialog and refresh
      setDeleteDialogOpen(false);
      await fetchQuests();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : 'An unknown error occurred',
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  const adminQuests = quests;
  const getQuestProgress = (quest: Quest) => {
    return {
      current: quest.progress_toward_target,
      target: quest.target_count,
    };
  };
  const getQuestSubjectType = (quest: Quest) => quest.subject_type ?? 'user';
  const formatSubjectName = (subjectRef?: string | null) => {
    if (!subjectRef) {
      return null;
    }

    const entityName = subjectRef.split('/').pop() ?? subjectRef;
    return entityName
      .split(/[-_]/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  };

  const renderSubject = (quest: Quest) => {
    const subjectType = getQuestSubjectType(quest);
    const subjectName = formatSubjectName(quest.subject_ref);
    let label = 'All users';

    if (subjectType === 'team') {
      label = subjectName ?? 'All teams';
    } else if (subjectName) {
      label = subjectName;
    }

    return (
      <Chip
        label={label}
        size="small"
        color={subjectType === 'team' ? 'primary' : 'default'}
      />
    );
  };

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
          <FormControl
            component="fieldset"
            style={{ marginTop: 12, width: '100%' }}
          >
            <FormLabel component="legend">Quest Scope</FormLabel>
            <RadioGroup
              row
              value={formData.subject_type}
              onChange={e =>
                handleInputChange(
                  'subject_type',
                  e.target.value as 'user' | 'team',
                )
              }
            >
              <FormControlLabel
                value="user"
                control={<Radio color="primary" disabled={createLoading} />}
                label="User"
              />
              <FormControlLabel
                value="team"
                control={<Radio color="primary" disabled={createLoading} />}
                label="Team"
              />
            </RadioGroup>
          </FormControl>
          <FormControl
            component="fieldset"
            style={{ marginTop: 12, width: '100%' }}
          >
            <FormLabel component="legend">Completion Policy</FormLabel>
            <RadioGroup
              row
              value={formData.completion_policy}
              onChange={e =>
                handleInputChange(
                  'completion_policy',
                  e.target.value as 'ONE_TIME' | 'REPEATABLE',
                )
              }
            >
              <FormControlLabel
                value="REPEATABLE"
                control={<Radio color="primary" disabled={createLoading} />}
                label="Repeatable"
              />
              <FormControlLabel
                value="ONE_TIME"
                control={<Radio color="primary" disabled={createLoading} />}
                label="One-time"
              />
            </RadioGroup>
          </FormControl>
          <TextField
            fullWidth
            label="Target Count"
            margin="dense"
            type="number"
            inputProps={{ min: 1 }}
            value={formData.target_count}
            onChange={e => handleInputChange('target_count', e.target.value)}
            disabled={createLoading}
            helperText="How many completions before XP is awarded (1 = every time)."
          />
          {formData.completion_policy === 'REPEATABLE' && (
            <TextField
              fullWidth
              label="Cooldown (days)"
              margin="dense"
              type="number"
              inputProps={{ min: 1 }}
              value={formData.cooldown_days}
              onChange={e => handleInputChange('cooldown_days', e.target.value)}
              disabled={createLoading}
              helperText="Optional: days users must wait after earning XP before re-completing."
            />
          )}
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
                Creating...
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
          <FormControl
            component="fieldset"
            style={{ marginTop: 12, width: '100%' }}
          >
            <FormLabel component="legend">Quest Scope</FormLabel>
            <RadioGroup
              row
              value={editFormData.subject_type}
              onChange={e =>
                handleEditInputChange(
                  'subject_type',
                  e.target.value as 'user' | 'team',
                )
              }
            >
              <FormControlLabel
                value="user"
                control={<Radio color="primary" disabled={editLoading} />}
                label="User"
              />
              <FormControlLabel
                value="team"
                control={<Radio color="primary" disabled={editLoading} />}
                label="Team"
              />
            </RadioGroup>
          </FormControl>
          <FormControl
            component="fieldset"
            style={{ marginTop: 12, width: '100%' }}
          >
            <FormLabel component="legend">Completion Policy</FormLabel>
            <RadioGroup
              row
              value={editFormData.completion_policy}
              onChange={e =>
                handleEditInputChange(
                  'completion_policy',
                  e.target.value as 'ONE_TIME' | 'REPEATABLE',
                )
              }
            >
              <FormControlLabel
                value="REPEATABLE"
                control={<Radio color="primary" disabled={editLoading} />}
                label="Repeatable"
              />
              <FormControlLabel
                value="ONE_TIME"
                control={<Radio color="primary" disabled={editLoading} />}
                label="One-time"
              />
            </RadioGroup>
          </FormControl>
          <TextField
            fullWidth
            label="Target Count"
            margin="dense"
            type="number"
            inputProps={{ min: 1 }}
            value={editFormData.target_count}
            onChange={e =>
              handleEditInputChange('target_count', e.target.value)
            }
            disabled={editLoading}
          />
          {editFormData.completion_policy === 'REPEATABLE' && (
            <TextField
              fullWidth
              label="Cooldown (days)"
              margin="dense"
              type="number"
              inputProps={{ min: 1 }}
              value={editFormData.cooldown_days}
              onChange={e =>
                handleEditInputChange('cooldown_days', e.target.value)
              }
              disabled={editLoading}
              helperText="Optional: days users must wait after earning XP before re-completing."
            />
          )}
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
                Saving...
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
                Deleting...
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
                Create and manage quests (admin) or view available quests
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
                  {isDemoMode ? 'Demo: Switch view' : 'Enable demo mode'}
                </Button>
              )}
            </ContentHeader>
            <TextField
              placeholder="Search quests..."
              variant="outlined"
              size="small"
              fullWidth
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ marginBottom: 16 }}
            />
            <Box display="flex" style={{ marginBottom: 16 }}>
              <FormControl
                variant="outlined"
                size="small"
                style={{ minWidth: 180 }}
              >
                <InputLabel id="audience-filter-label">
                  Filter by audience
                </InputLabel>
                <Select
                  labelId="audience-filter-label"
                  value={audienceFilter}
                  onChange={e =>
                    setAudienceFilter(
                      e.target.value as 'all' | 'individual' | 'team',
                    )
                  }
                  label="Filter by audience"
                >
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="individual">Individual</MenuItem>
                  <MenuItem value="team">Team</MenuItem>
                </Select>
              </FormControl>

              {audienceFilter === 'team' && (
                <FormControl
                  variant="outlined"
                  size="small"
                  style={{ minWidth: 260 }}
                  disabled={teamOptions.length === 0}
                >
                  <InputLabel id="team-filter-label">Team</InputLabel>
                  <Select
                    labelId="team-filter-label"
                    value={teamFilter}
                    onChange={e => setTeamFilter(e.target.value as string)}
                    label="Team"
                  >
                    {teamOptions.map(team => (
                      <MenuItem key={team} value={team}>
                        {team}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              <FormControl
                variant="outlined"
                size="small"
                style={{ minWidth: 180 }}
              >
                <InputLabel id="status-filter-label">Status</InputLabel>
                <Select
                  labelId="status-filter-label"
                  value={statusFilter}
                  onChange={e =>
                    setStatusFilter(
                      e.target.value as 'active' | 'completed' | 'all',
                    )
                  }
                  label="Status"
                >
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="completed">Completed</MenuItem>
                  <MenuItem value="all">All</MenuItem>
                </Select>
              </FormControl>

              <FormControl
                variant="outlined"
                size="small"
                style={{ minWidth: 180, marginLeft: 8 }}
              >
                <InputLabel id="sort-by-label">Sort by</InputLabel>
                <Select
                  labelId="sort-by-label"
                  value={sortBy}
                  onChange={e =>
                    setSortBy(
                      e.target.value as 'created_at' | 'title' | 'xp_reward',
                    )
                  }
                  label="Sort by"
                >
                  <MenuItem value="created_at">Created</MenuItem>
                  <MenuItem value="title">Title</MenuItem>
                  <MenuItem value="xp_reward">XP Reward</MenuItem>
                </Select>
              </FormControl>

              <FormControl
                variant="outlined"
                size="small"
                style={{ minWidth: 140, marginLeft: 8 }}
              >
                <InputLabel id="order-label">Order</InputLabel>
                <Select
                  labelId="order-label"
                  value={order}
                  onChange={e => setOrder(e.target.value as 'asc' | 'desc')}
                  label="Order"
                >
                  <MenuItem value="asc">Ascending</MenuItem>
                  <MenuItem value="desc">Descending</MenuItem>
                </Select>
              </FormControl>
            </Box>
            {loading && (
              <div style={{ textAlign: 'center', padding: 20 }}>
                <CircularProgress />
                <Typography variant="body2" style={{ marginTop: 8 }}>
                  Loading quests...
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
                No quests found.{' '}
                {search
                  ? 'Try a different search.'
                  : 'Create a new quest from the admin panel.'}
              </Typography>
            )}
            {!loading && !error && quests.length > 0 && (
              <>
                {isAdmin ? (
                  <>
                    <TableContainer component={Paper} style={{ marginTop: 16 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell style={{ width: '18%' }}>
                              Title
                            </TableCell>
                            <TableCell style={{ width: '14%' }}>
                              Subject
                            </TableCell>
                            <TableCell style={{ width: '12%' }}>Type</TableCell>
                            <TableCell style={{ width: '21%' }}>
                              Description
                            </TableCell>
                            <TableCell align="center" style={{ width: '12%' }}>
                              XP Reward
                            </TableCell>
                            <TableCell align="right" style={{ width: '15%' }}>
                              Progress
                            </TableCell>
                            <TableCell align="right" style={{ width: '8%' }}>
                              Actions
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {adminQuests.map(quest => {
                            const progress = getQuestProgress(quest);
                            const isCompleted =
                              quest.completion_policy === 'ONE_TIME' &&
                              quest.completion_count >= quest.target_count;
                            const percent =
                              (progress.current / progress.target) * 100;
                            return (
                              <TableRow key={quest.id}>
                                <TableCell>{quest.title}</TableCell>
                                <TableCell>{renderSubject(quest)}</TableCell>
                                <TableCell>
                                  {quest.completion_policy === 'ONE_TIME' ? (
                                    <Chip
                                      label="One-time"
                                      size="small"
                                      color="secondary"
                                    />
                                  ) : (
                                    <Chip
                                      label={
                                        quest.cooldown_days
                                          ? `Every ${quest.cooldown_days}d`
                                          : 'Repeatable'
                                      }
                                      size="small"
                                    />
                                  )}
                                </TableCell>
                                <TableCell>{quest.description}</TableCell>
                                <TableCell align="center">
                                  {quest.xp_reward}
                                </TableCell>
                                <TableCell align="right">
                                  <Box minWidth={120} textAlign="right">
                                    <LinearProgress
                                      variant="determinate"
                                      value={Math.min(
                                        100,
                                        Math.max(0, percent),
                                      )}
                                    />
                                    <Typography variant="caption">
                                      {isCompleted
                                        ? '\u2713 Completed'
                                        : `${progress.current}/${progress.target}`}
                                    </Typography>
                                  </Box>
                                </TableCell>
                                <TableCell align="right">
                                  <Tooltip title="Edit">
                                    <IconButton
                                      size="small"
                                      color="primary"
                                      onClick={() =>
                                        handleOpenEditDialog(quest)
                                      }
                                    >
                                      <EditIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Delete">
                                    <IconButton
                                      size="small"
                                      color="secondary"
                                      onClick={() =>
                                        handleOpenDeleteDialog(quest)
                                      }
                                    >
                                      <DeleteIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>

                    <Box
                      display="flex"
                      justifyContent="center"
                      alignItems="center"
                      mt={2}
                      style={{ gap: 16 }}
                    >
                      <Button
                        variant="outlined"
                        size="small"
                        disabled={page === 1}
                        onClick={() => setPage(p => p - 1)}
                      >
                        Previous
                      </Button>
                      <Typography variant="body2">
                        Page {page} of {Math.max(1, totalPages)} ({total}{' '}
                        quests)
                      </Typography>
                      <Button
                        variant="outlined"
                        size="small"
                        disabled={page >= Math.max(1, totalPages)}
                        onClick={() => setPage(p => p + 1)}
                      >
                        Next
                      </Button>
                    </Box>
                  </>
                ) : (
                  <>
                    <TableContainer component={Paper} style={{ marginTop: 16 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell style={{ width: '18%' }}>
                              Title
                            </TableCell>
                            <TableCell style={{ width: '14%' }}>
                              Subject
                            </TableCell>
                            <TableCell style={{ width: '12%' }}>Type</TableCell>
                            <TableCell style={{ width: '21%' }}>
                              Description
                            </TableCell>
                            <TableCell align="center" style={{ width: '15%' }}>
                              XP Reward
                            </TableCell>
                            <TableCell align="right" style={{ width: '20%' }}>
                              Progress
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {quests.map(quest => {
                            const progress = getQuestProgress(quest);
                            const isCompleted =
                              quest.completion_policy === 'ONE_TIME' &&
                              quest.completion_count >= quest.target_count;
                            const percent =
                              (progress.current / progress.target) * 100;
                            return (
                              <TableRow key={quest.id}>
                                <TableCell>{quest.title}</TableCell>
                                <TableCell>{renderSubject(quest)}</TableCell>
                                <TableCell>
                                  {quest.completion_policy === 'ONE_TIME' ? (
                                    <Chip
                                      label="One-time"
                                      size="small"
                                      color="secondary"
                                    />
                                  ) : (
                                    <Chip
                                      label={
                                        quest.cooldown_days
                                          ? `Every ${quest.cooldown_days}d`
                                          : 'Repeatable'
                                      }
                                      size="small"
                                    />
                                  )}
                                </TableCell>
                                <TableCell>{quest.description}</TableCell>
                                <TableCell align="center">
                                  {quest.xp_reward}
                                </TableCell>
                                <TableCell align="right">
                                  <Box minWidth={120} textAlign="right">
                                    <LinearProgress
                                      variant="determinate"
                                      value={Math.min(
                                        100,
                                        Math.max(0, percent),
                                      )}
                                    />
                                    <Typography variant="caption">
                                      {isCompleted
                                        ? '\u2713 Completed'
                                        : `${progress.current}/${progress.target}`}
                                    </Typography>
                                  </Box>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>

                    <Box
                      display="flex"
                      justifyContent="center"
                      alignItems="center"
                      style={{ gap: 16 }}
                      mt={2}
                    >
                      <Button
                        variant="outlined"
                        size="small"
                        disabled={page === 1}
                        onClick={() => setPage(p => p - 1)}
                      >
                        Previous
                      </Button>
                      <Typography variant="body2">
                        Page {page} of {Math.max(1, totalPages)} ({total}{' '}
                        quests)
                      </Typography>
                      <Button
                        variant="outlined"
                        size="small"
                        disabled={page >= Math.max(1, totalPages)}
                        onClick={() => setPage(p => p + 1)}
                      >
                        Next
                      </Button>
                    </Box>
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
