import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
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
  Chip,
  FormControl,
  InputLabel,
  Select,
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
  archived_at?: string | null;
  isEarned?: boolean;
  earnedAt?: string | null;
};

type BadgeProgressResponse = {
  subjectRefs: string[];
  badges: Badge[];
  pagination?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
};

type PaginatedBadgeResponse = {
  data: Badge[];
  pagination: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
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

const createEmptyForm = (): BadgeFormData => ({
  title: '',
  description: '',
  criterias: [{ quest_id: '', target_count: '1' }],
});

async function readErrorMessage(response: Response): Promise<string> {
  const body = await response.text();

  if (!body) {
    return `Error: ${response.status} ${response.statusText}`;
  }

  try {
    const parsed = JSON.parse(body);
    return parsed.error?.message ?? parsed.message ?? body;
  } catch {
    return body;
  }
}

export const BadgesAdminPage = ({
  isAdmin,
  onToggleDemo,
  isDemoMode = false,
}: BadgesAdminPageProps) => {
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

  const [badges, setBadges] = useState<Badge[]>([]);
  const [quests, setQuests] = useState<QuestLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [audienceFilter, setAudienceFilter] = useState<
    'all' | 'individual' | 'team'
  >('all');
  const [teamFilter, setTeamFilter] = useState('');
  const [teamOptions, setTeamOptions] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState<'created_at' | 'title' | 'xp_reward'>(
    'created_at',
  );
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');

  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<BadgeFormData>(
    createEmptyForm(),
  );

  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);
  const [editForm, setEditForm] = useState<BadgeFormData>(createEmptyForm());

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [badgeToDelete, setBadgeToDelete] = useState<Badge | null>(null);

  const fetchBadges = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const url = await buildGamificationUrl(
        isAdmin ? '/badges' : '/badges/progress',
        {
          ...(search.trim() ? { search: search.trim() } : {}),
          audience: audienceFilter,
          ...(audienceFilter === 'team' && teamFilter
            ? { team: teamFilter }
            : {}),
          sortBy,
          order,
          page: String(page),
          limit: String(limit),
        },
      );
      const response = await fetchApi.fetch(url);

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const result = await response.json();

      if (result && Array.isArray(result.data) && result.pagination) {
        const paginated = result as PaginatedBadgeResponse;
        setBadges(paginated.data ?? []);
        setTotal(paginated.pagination.total ?? 0);
        setTotalPages(paginated.pagination.totalPages ?? 1);
      } else if (isAdmin && Array.isArray(result)) {
        const rows = result as Badge[];
        setBadges(rows);
        setTotal(rows.length);
        setTotalPages(1);
      } else {
        const progress = result as BadgeProgressResponse;
        const rows = progress.badges ?? [];
        setBadges(rows);
        setTotal(progress.pagination?.total ?? rows.length);
        setTotalPages(progress.pagination?.totalPages ?? 1);
      }
    } catch (e: any) {
      setError(e?.message ?? 'An unknown error occurred');
      setBadges([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [
    audienceFilter,
    buildGamificationUrl,
    fetchApi,
    isAdmin,
    limit,
    order,
    page,
    search,
    sortBy,
    teamFilter,
  ]);

  const fetchQuests = useCallback(async () => {
    try {
      const url = await buildGamificationUrl(
        isAdmin ? '/quests' : '/quests/me',
        isAdmin ? undefined : { audience: 'all', status: 'all', limit: '1000' },
      );
      const response = await fetchApi.fetch(url);

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const result = await response.json();
      const questRows = Array.isArray(result) ? result : result.data ?? [];
      const byId = new Map<string, QuestLite>();

      for (const quest of questRows) {
        if (!quest?.id || !quest?.title || !quest?.completion_policy) {
          continue;
        }

        byId.set(quest.id, {
          id: quest.id,
          title: quest.title,
          completion_policy: quest.completion_policy,
        });
      }

      setQuests(Array.from(byId.values()));
    } catch (e: any) {
      setQuests([]);
      setError(prev => prev ?? e?.message ?? 'Failed to load quests');
    }
  }, [buildGamificationUrl, fetchApi, isAdmin]);

  useEffect(() => {
    fetchBadges();
  }, [fetchBadges]);

  useEffect(() => {
    fetchQuests();
  }, [fetchQuests]);

  useEffect(() => {
    setPage(1);
  }, [search, audienceFilter, teamFilter, sortBy, order]);

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
    if (createLoading) {
      return;
    }

    setCreateOpen(false);
    setCreateError(null);
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
      const url = await buildGamificationUrl('/badges');
      const response = await fetchApi.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: createForm.title.trim(),
          description: createForm.description.trim(),
          criterias: createForm.criterias.map(c => ({
            quest_id: c.quest_id,
            target_count: parseInt(c.target_count, 10),
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setCreateOpen(false);
      setCreateForm(createEmptyForm());
      await fetchBadges();
    } catch (e: any) {
      setCreateError(e?.message ?? 'An unknown error occurred');
    } finally {
      setCreateLoading(false);
    }
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
    if (editLoading) {
      return;
    }

    setEditOpen(false);
    setSelectedBadge(null);
    setEditError(null);
  };

  const submitEdit = async () => {
    if (!selectedBadge) {
      return;
    }

    const validation = validateBadgeForm(editForm);

    if (validation) {
      setEditError(validation);
      return;
    }

    setEditLoading(true);
    setEditError(null);

    try {
      const url = await buildGamificationUrl(`/badges/${selectedBadge.id}`);
      const response = await fetchApi.fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editForm.title.trim(),
          description: editForm.description.trim(),
          criterias: editForm.criterias.map(c => ({
            quest_id: c.quest_id,
            target_count: parseInt(c.target_count, 10),
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setEditOpen(false);
      setSelectedBadge(null);
      await fetchBadges();
    } catch (e: any) {
      setEditError(e?.message ?? 'An unknown error occurred');
    } finally {
      setEditLoading(false);
    }
  };

  const openDelete = (badge: Badge) => {
    setDeleteError(null);
    setBadgeToDelete(badge);
    setDeleteOpen(true);
  };

  const closeDelete = () => {
    if (deleteLoading) {
      return;
    }

    setDeleteOpen(false);
    setDeleteError(null);
    setBadgeToDelete(null);
  };

  const confirmDelete = async () => {
    if (!badgeToDelete) {
      return;
    }

    setDeleteLoading(true);
    setDeleteError(null);

    try {
      const url = await buildGamificationUrl(`/badges/${badgeToDelete.id}`);
      const response = await fetchApi.fetch(url, { method: 'DELETE' });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setDeleteOpen(false);
      setBadgeToDelete(null);
      await fetchBadges();
    } catch (e: any) {
      setDeleteError(e?.message ?? 'An unknown error occurred');
    } finally {
      setDeleteLoading(false);
    }
  };

  const renderCriteriaSummary = (criterias: BadgeCriteria[]) => {
    if (!criterias.length) {
      return (
        <Typography variant="caption" color="textSecondary">
          No criteria
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
              {getQuestTitle(criteria.quest_id)} - {policyText}
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
        helperText = isOneTime
          ? 'This quest is One-time'
          : 'This quest is Repeatable';
      }

      let completionPolicyValue = '';
      if (criteria.quest_id) {
        completionPolicyValue = isOneTime ? 'One-time' : 'Repeatable';
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
                  {q.title} - {policyLabel}
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

  const getBadgeStatusLabel = (badge: Badge) => {
    if (isAdmin) {
      return badge.archived_at ? 'Archived' : 'Active';
    }

    if (badge.isEarned) {
      return badge.archived_at ? 'Earned, archived' : 'Earned';
    }

    return 'In progress';
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
            <Typography variant="subtitle1">Criteria</Typography>
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
          <Button onClick={closeCreate} disabled={createLoading}>
            Cancel
          </Button>
          <Button
            onClick={submitCreate}
            color="primary"
            variant="contained"
            disabled={createLoading}
          >
            {createLoading ? 'Creating...' : 'Create Badge'}
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
            <Typography variant="subtitle1">Criteria</Typography>
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
          <Button onClick={closeEdit} disabled={editLoading}>
            Cancel
          </Button>
          <Button
            onClick={submitEdit}
            color="primary"
            variant="contained"
            disabled={editLoading}
          >
            {editLoading ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteOpen} onClose={closeDelete} maxWidth="sm" fullWidth>
        <DialogTitle>Archive Badge?</DialogTitle>

        <DialogContent>
          {deleteError && (
            <Alert severity="error" style={{ marginBottom: 16 }}>
              {deleteError}
            </Alert>
          )}

          <Typography>
            Are you sure you want to archive "{badgeToDelete?.title}"?
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
            {deleteLoading ? 'Archiving...' : 'Archive'}
          </Button>
        </DialogActions>
      </Dialog>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <InfoCard>
            <ContentHeader title="Badges">
              <SupportButton>
                Create and manage badges (admin) or view badge progress (user).
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

            <TextField
              placeholder="Search badges..."
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
                  style={{ minWidth: 260, marginLeft: 8 }}
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
              <Box textAlign="center" p={2}>
                <Typography>Loading badges...</Typography>
              </Box>
            )}

            {error && (
              <Alert severity="error" style={{ marginBottom: 16 }}>
                {error}
              </Alert>
            )}

            {!loading && !error && badges.length === 0 && (
              <Typography variant="body2">
                {search.trim()
                  ? 'No badges found. Try a different search.'
                  : 'No badges found.'}
              </Typography>
            )}

            {!loading && !error && badges.length > 0 && (
              <>
                <TableContainer component={Paper} style={{ marginTop: 16 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell style={{ width: '18%' }}>Title</TableCell>
                        <TableCell style={{ width: '30%' }}>
                          Description
                        </TableCell>
                        <TableCell style={{ width: '30%' }}>Criteria</TableCell>
                        <TableCell style={{ width: '12%' }}>Status</TableCell>
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
                          <TableCell>
                            <Chip
                              label={getBadgeStatusLabel(badge)}
                              size="small"
                              color={badge.isEarned ? 'primary' : 'default'}
                            />
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

                                <Tooltip title="Archive">
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
                    Page {page} of {Math.max(1, totalPages)} ({total} badges)
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
          </InfoCard>
        </Grid>
      </Grid>
    </>
  );
};
