import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Flex,
  HeaderPage,
  type SortDescriptor,
  useTable,
} from '@backstage/ui';
import {
  discoveryApiRef,
  fetchApiRef,
  identityApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { BadgeDeleteDialog } from './BadgeDeleteDialog';
import { BadgeFormDialog } from './BadgeFormDialog';
import { BadgeTable } from './BadgeTable';
import { BadgeToolbar } from './BadgeToolbar';
import type {
  Badge,
  BadgeFilterState,
  BadgeFormData,
  BadgesPageProps,
  BadgeSubjectType,
  QuestLite,
} from './types';
import {
  buildBadgePayload,
  createBadgeTableRow,
  createDefaultBadgeFilter,
  createEmptyBadgeForm,
  getBadgeSort,
  getCompatibleQuests,
  getQuestById,
  readErrorMessage,
  validateBadgeForm,
} from './utils';

export const BadgesPage = ({
  isAdmin,
  onToggleDemo,
  isDemoMode = false,
}: BadgesPageProps) => {
  const fetchApi = useApi(fetchApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const identityApi = useApi(identityApiRef);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<BadgeFilterState>(
    createDefaultBadgeFilter(),
  );
  const [sort, setSort] = useState<SortDescriptor | null>(null);
  const [teamOptions, setTeamOptions] = useState<string[]>([]);
  const [quests, setQuests] = useState<QuestLite[]>([]);
  const [images, setImages] = useState<{ id: number; image: string }[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<BadgeFormData>(
    createEmptyBadgeForm(),
  );

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);
  const [editForm, setEditForm] = useState<BadgeFormData>(
    createEmptyBadgeForm(),
  );

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [badgeToDelete, setBadgeToDelete] = useState<Badge | null>(null);

  const buildGamificationUrl = useCallback(
    async (path: string, query?: Record<string, string>) => {
      const baseUrl = await discoveryApi.getBaseUrl('gamification');
      const url = new URL(
        `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`,
      );

      if (query) {
        for (const [key, value] of Object.entries(query)) {
          if (value.trim()) {
            url.searchParams.set(key, value);
          }
        }
      }

      return url.toString();
    },
    [discoveryApi],
  );

  useEffect(() => {
    setSearch('');
    setSort(null);
    setFilter(createDefaultBadgeFilter());
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      setTeamOptions([]);
      return undefined;
    }

    let mounted = true;

    const loadTeams = async () => {
      try {
        const identity = await identityApi.getBackstageIdentity();
        const teams = (identity.ownershipEntityRefs ?? []).filter(ref =>
          ref.toLocaleLowerCase('en-US').startsWith('group:'),
        );

        if (mounted) {
          setTeamOptions(teams);
        }
      } catch {
        if (mounted) {
          setTeamOptions([]);
        }
      }
    };

    loadTeams();

    return () => {
      mounted = false;
    };
  }, [identityApi, isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      return;
    }

    if (filter.audience === 'team' && teamOptions.length === 0) {
      setFilter(prev => ({ ...prev, audience: 'all', team: '' }));
      return;
    }

    if (filter.audience !== 'team' || teamOptions.length === 0) {
      return;
    }

    const selectedTeamExists = teamOptions.some(
      team =>
        team.toLocaleLowerCase('en-US') ===
        filter.team.toLocaleLowerCase('en-US'),
    );

    if (!selectedTeamExists) {
      setFilter(prev => ({ ...prev, team: teamOptions[0] ?? '' }));
    }
  }, [filter.audience, filter.team, isAdmin, teamOptions]);

  const fetchQuests = useCallback(async () => {
    if (!isAdmin) {
      setQuests([]);
      return;
    }

    try {
      const url = await buildGamificationUrl('/quests', {
        page: '1',
        limit: '1000',
      });
      const response = await fetchApi.fetch(url);

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const result = await response.json();
      const questRows = Array.isArray(result.data) ? result.data : [];

      setQuests(
        questRows
          .filter((quest: any) => quest?.id && quest?.title)
          .map(
            (quest: any): QuestLite => ({
              id: quest.id,
              title: quest.title,
              subject_type: quest.subject_type === 'team' ? 'team' : 'user',
              completion_policy:
                quest.completion_policy === 'ONE_TIME'
                  ? 'ONE_TIME'
                  : 'REPEATABLE',
            }),
          ),
      );
    } catch {
      setQuests([]);
    }
  }, [buildGamificationUrl, fetchApi, isAdmin]);

  useEffect(() => {
    fetchQuests();
  }, [fetchQuests]);

  useEffect(() => {
    const fetchImages = async () => {
      try {
        const url = await buildGamificationUrl('/badges/badge-images');
        const { token } = await identityApi.getCredentials();
        const res = await fetchApi.fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) {
          throw new Error(await readErrorMessage(res));
        }

        const data = await res.json();
        setImages(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error('Failed to fetch images', e);
        setImages([]);
      }
    };

    fetchImages();
  }, [buildGamificationUrl, fetchApi, identityApi]);

  const getData = useCallback(
    async ({
      offset,
      pageSize,
      sort: sortDescriptor,
      filter: filterState,
      search: searchValue,
      signal,
    }: {
      offset: number;
      pageSize: number;
      sort: SortDescriptor | null;
      filter: BadgeFilterState | undefined;
      search: string;
      signal: AbortSignal;
    }) => {
      const currentFilter = filterState ?? createDefaultBadgeFilter();
      const { sortBy, order } = getBadgeSort(sortDescriptor, isAdmin);
      const page = Math.floor(offset / pageSize) + 1;

      const query: Record<string, string> = {
        search: searchValue.trim(),
        sortBy,
        order,
        page: String(page),
        limit: String(pageSize),
      };

      if (!isAdmin) {
        query.audience = currentFilter.audience;
        query.status = currentFilter.status;
        query.team =
          currentFilter.audience === 'team' ? currentFilter.team : '';
      }

      const url = await buildGamificationUrl(
        isAdmin ? '/badges' : '/badges/progress',
        query,
      );
      const response = await fetchApi.fetch(url, { signal });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const result = await response.json();
      let rows: any[] = [];

      if (isAdmin) {
        rows = Array.isArray(result.data) ? result.data : [];
      } else {
        rows = Array.isArray(result.badges) ? result.badges : [];
      }

      const total = isAdmin
        ? Number(result.pagination?.total ?? 0)
        : Number(result.pagination?.total ?? rows.length);

      return {
        data: rows.map(createBadgeTableRow),
        totalCount: total,
      };
    },
    [buildGamificationUrl, fetchApi, isAdmin],
  );

  const { tableProps, reload } = useTable({
    mode: 'offset',
    getData,
    search,
    onSearchChange: setSearch,
    filter,
    onFilterChange: setFilter,
    sort,
    onSortChange: setSort,
    paginationOptions: {
      pageSize: 10,
      pageSizeOptions: [10, 20, 30, 50],
      showPageSizeOptions: false,
      getLabel: ({ offset, pageSize, totalCount }) => {
        const safeOffset = offset ?? 0;
        const safePageSize = pageSize ?? 10;
        const safeTotalCount = totalCount ?? 0;

        if (!safeTotalCount) {
          return '0 results';
        }

        const from = safeOffset + 1;
        const to = Math.min(safeOffset + safePageSize, safeTotalCount);
        return `${from}-${to} of ${safeTotalCount}`;
      },
    },
  });

  const totalCount =
    tableProps.pagination.type === 'page'
      ? Number(tableProps.pagination.totalCount ?? 0)
      : 0;
  const visibleCount = tableProps.data?.length ?? 0;
  let demoToggleAction: {
    label: string;
    variant: 'secondary' | 'tertiary';
  } | null = null;

  if (isDemoMode) {
    demoToggleAction = {
      label: 'Return to normal view',
      variant: 'secondary',
    };
  } else if (onToggleDemo) {
    demoToggleAction = {
      label: 'Preview other view',
      variant: 'tertiary',
    };
  }

  const handleCreateFieldChange = (
    field: keyof BadgeFormData,
    value: string,
  ) => {
    setCreateForm(prev => ({ ...prev, [field]: value }));
    setCreateError(null);
  };

  const handleEditFieldChange = (field: keyof BadgeFormData, value: string) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
    setEditError(null);
  };

  const updateBadgeSubjectType = (
    setter: React.Dispatch<React.SetStateAction<BadgeFormData>>,
    subjectType: BadgeSubjectType,
  ) => {
    setter(prev => ({
      ...prev,
      subject_type: subjectType,
      criterias: prev.criterias.map(criteria => {
        const selectedQuest = getQuestById(quests, criteria.quest_id);

        if (selectedQuest && selectedQuest.subject_type !== subjectType) {
          return { quest_id: '', target_count: '1' };
        }

        if (selectedQuest?.completion_policy === 'ONE_TIME') {
          return { ...criteria, target_count: '1' };
        }

        return criteria;
      }),
    }));
  };

  const updateCriteriaField = (
    setter: React.Dispatch<React.SetStateAction<BadgeFormData>>,
    index: number,
    field: 'quest_id' | 'target_count',
    value: string,
  ) => {
    setter(prev => ({
      ...prev,
      criterias: prev.criterias.map((criteria, currentIndex) => {
        if (currentIndex !== index) {
          return criteria;
        }

        if (field === 'quest_id') {
          const selectedQuest = getQuestById(quests, value);
          return {
            ...criteria,
            quest_id: value,
            target_count:
              selectedQuest?.completion_policy === 'ONE_TIME'
                ? '1'
                : criteria.target_count || '1',
          };
        }

        return {
          ...criteria,
          target_count: value,
        };
      }),
    }));
  };

  const addCriteriaRow = (
    setter: React.Dispatch<React.SetStateAction<BadgeFormData>>,
  ) => {
    setter(prev => ({
      ...prev,
      criterias: [...prev.criterias, { quest_id: '', target_count: '1' }],
    }));
  };

  const removeCriteriaRow = (
    setter: React.Dispatch<React.SetStateAction<BadgeFormData>>,
    index: number,
  ) => {
    setter(prev => {
      if (prev.criterias.length <= 1) {
        return prev;
      }

      return {
        ...prev,
        criterias: prev.criterias.filter(
          (_, currentIndex) => currentIndex !== index,
        ),
      };
    });
  };

  const resetCreateDialog = () => {
    setIsCreateOpen(false);
    setCreateError(null);
    setCreateForm(createEmptyBadgeForm());
  };

  const resetEditDialog = () => {
    setIsEditOpen(false);
    setSelectedBadge(null);
    setEditError(null);
    setEditForm(createEmptyBadgeForm());
  };

  const resetDeleteDialog = () => {
    setIsDeleteOpen(false);
    setBadgeToDelete(null);
    setDeleteError(null);
  };

  const handleCreateBadge = async () => {
    const validationError = validateBadgeForm(createForm, quests);
    if (validationError) {
      setCreateError(validationError);
      return;
    }

    setCreateLoading(true);
    setCreateError(null);

    try {
      const url = await buildGamificationUrl('/badges');
      const response = await fetchApi.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBadgePayload(createForm)),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      resetCreateDialog();
      reload();
    } catch (createBadgeError) {
      setCreateError(
        createBadgeError instanceof Error
          ? createBadgeError.message
          : 'An unknown error occurred',
      );
    } finally {
      setCreateLoading(false);
    }
  };

  const handleOpenEditDialog = (badge: Badge) => {
    setSelectedBadge(badge);
    setEditForm({
      title: badge.title,
      description: badge.description,
      xp_reward: String(badge.xp_reward),
      subject_type: badge.subject_type,
      image_id:
        badge.image_id !== null && badge.image_id !== undefined
          ? String(badge.image_id)
          : '',
      criterias: badge.criterias.map(criteria => ({
        quest_id: criteria.quest_id,
        target_count: String(criteria.target_count),
      })),
    });
    setEditError(null);
    setIsEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedBadge) {
      return;
    }

    const validationError = validateBadgeForm(editForm, quests);
    if (validationError) {
      setEditError(validationError);
      return;
    }

    setEditLoading(true);
    setEditError(null);

    try {
      const url = await buildGamificationUrl(`/badges/${selectedBadge.id}`);
      const response = await fetchApi.fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBadgePayload(editForm)),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      resetEditDialog();
      reload();
    } catch (saveEditError) {
      setEditError(
        saveEditError instanceof Error
          ? saveEditError.message
          : 'An unknown error occurred',
      );
    } finally {
      setEditLoading(false);
    }
  };

  const handleOpenDeleteDialog = (badge: Badge) => {
    setBadgeToDelete(badge);
    setDeleteError(null);
    setIsDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
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

      resetDeleteDialog();
      reload();
    } catch (deleteBadgeError) {
      setDeleteError(
        deleteBadgeError instanceof Error
          ? deleteBadgeError.message
          : 'An unknown error occurred',
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <BadgeFormDialog
        isOpen={isCreateOpen}
        mode="create"
        formData={createForm}
        quests={getCompatibleQuests(quests, createForm.subject_type)}
        error={createError}
        loading={createLoading}
        onClose={() => {
          if (!createLoading) {
            resetCreateDialog();
          }
        }}
        onSubmit={handleCreateBadge}
        onChange={handleCreateFieldChange}
        onSubjectTypeChange={value => {
          updateBadgeSubjectType(setCreateForm, value);
          setCreateError(null);
        }}
        onAddCriteria={() => addCriteriaRow(setCreateForm)}
        onRemoveCriteria={index => removeCriteriaRow(setCreateForm, index)}
        onCriteriaChange={(index, field, value) => {
          updateCriteriaField(setCreateForm, index, field, value);
          setCreateError(null);
        }}
      />

      <BadgeFormDialog
        isOpen={isEditOpen}
        mode="edit"
        formData={editForm}
        quests={getCompatibleQuests(quests, editForm.subject_type)}
        error={editError}
        loading={editLoading}
        badgeTitle={selectedBadge?.title}
        onClose={() => {
          if (!editLoading) {
            resetEditDialog();
          }
        }}
        onSubmit={handleSaveEdit}
        onChange={handleEditFieldChange}
        onSubjectTypeChange={value => {
          updateBadgeSubjectType(setEditForm, value);
          setEditError(null);
        }}
        onAddCriteria={() => addCriteriaRow(setEditForm)}
        onRemoveCriteria={index => removeCriteriaRow(setEditForm, index)}
        onCriteriaChange={(index, field, value) => {
          updateCriteriaField(setEditForm, index, field, value);
          setEditError(null);
        }}
      />

      <BadgeDeleteDialog
        isOpen={isDeleteOpen}
        badge={badgeToDelete}
        error={deleteError}
        loading={deleteLoading}
        onClose={() => {
          if (!deleteLoading) {
            resetDeleteDialog();
          }
        }}
        onConfirm={handleConfirmDelete}
      />

      <Flex direction="column" gap="4">
        <HeaderPage
          title={isAdmin ? 'Badges' : 'Your Badges'}
          customActions={
            <Flex gap="2" style={{ flexWrap: 'wrap' }}>
              {demoToggleAction && onToggleDemo ? (
                <Button
                  size="small"
                  variant={demoToggleAction.variant}
                  onPress={onToggleDemo}
                >
                  {demoToggleAction.label}
                </Button>
              ) : null}
            </Flex>
          }
        />

        {tableProps.error ? (
          <Alert
            status="danger"
            icon
            title="Unable to load badges"
            description={tableProps.error.message}
          />
        ) : null}

        <BadgeToolbar
          isAdmin={isAdmin}
          isLoading={tableProps.loading || !!tableProps.isStale}
          search={search}
          audienceFilter={filter.audience}
          statusFilter={filter.status}
          teamFilter={filter.team}
          teamOptions={teamOptions}
          totalCount={totalCount}
          visibleCount={visibleCount}
          onSearchChange={setSearch}
          onAudienceChange={value =>
            setFilter(prev => ({
              ...prev,
              audience: value,
              team: value === 'team' ? prev.team || teamOptions[0] || '' : '',
            }))
          }
          onStatusChange={value =>
            setFilter(prev => ({
              ...prev,
              status: value,
            }))
          }
          onTeamChange={value =>
            setFilter(prev => ({
              ...prev,
              team: value,
            }))
          }
          onCreateBadge={isAdmin ? () => setIsCreateOpen(true) : undefined}
        />

        <BadgeTable
          isAdmin={isAdmin}
          statusFilter={filter.status}
          search={search}
          quests={quests}
          tableProps={tableProps}
          images={images}
          onEditBadge={handleOpenEditDialog}
          onDeleteBadge={handleOpenDeleteDialog}
        />
      </Flex>
    </>
  );
};
