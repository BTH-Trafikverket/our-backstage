import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Flex,
  HeaderPage,
  Text,
  type SortDescriptor,
  useTable,
} from '@backstage/ui';
import {
  discoveryApiRef,
  fetchApiRef,
  identityApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { QuestDeleteDialog } from './QuestDeleteDialog';
import { QuestFormDialog } from './QuestFormDialog';
import { QuestTable } from './QuestTable';
import { QuestToolbar } from './QuestToolbar';
import type {
  Quest,
  QuestFilterState,
  QuestFormData,
  QuestsPageProps,
} from './types';
import {
  buildQuestPayload,
  createDefaultQuestFilter,
  createEmptyQuestForm,
  createQuestTableRow,
  getQuestSort,
  normalizeQuest,
  readErrorMessage,
  validateQuestForm,
} from './utils';

export const QuestsPage = ({
  isAdmin,
  onToggleDemo,
  isDemoMode = false,
}: QuestsPageProps) => {
  const fetchApi = useApi(fetchApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const identityApi = useApi(identityApiRef);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<QuestFilterState>(
    createDefaultQuestFilter(isAdmin),
  );
  const [sort, setSort] = useState<SortDescriptor | null>(null);
  const [teamOptions, setTeamOptions] = useState<string[]>([]);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<QuestFormData>(
    createEmptyQuestForm(),
  );

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [selectedQuest, setSelectedQuest] = useState<Quest | null>(null);
  const [editForm, setEditForm] = useState<QuestFormData>(
    createEmptyQuestForm(),
  );

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [questToDelete, setQuestToDelete] = useState<Quest | null>(null);

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
    setFilter(createDefaultQuestFilter(isAdmin));
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
      filter: QuestFilterState | undefined;
      search: string;
      signal: AbortSignal;
    }) => {
      const currentFilter = filterState ?? createDefaultQuestFilter(isAdmin);
      const { sortBy, order } = getQuestSort(sortDescriptor);
      const page = Math.floor(offset / pageSize) + 1;

      const query = isAdmin
        ? {
            search: searchValue.trim(),
            audience: currentFilter.audience,
            sortBy,
            order,
            page: String(page),
            limit: String(pageSize),
          }
        : {
            search: searchValue.trim(),
            audience: currentFilter.audience,
            status: currentFilter.status,
            team: currentFilter.audience === 'team' ? currentFilter.team : '',
            sortBy,
            order,
            page: String(page),
            limit: String(pageSize),
          };

      const url = await buildGamificationUrl(
        isAdmin ? '/quests' : '/quests/me',
        query,
      );
      const response = await fetchApi.fetch(url, { signal });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const result = await response.json();
      const rows = Array.isArray(result.data)
        ? result.data.map(normalizeQuest)
        : [];

      return {
        data: rows.map(createQuestTableRow),
        totalCount: Number(result.pagination?.total ?? 0),
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
        if (!totalCount) {
          return '0 results';
        }

        const from = offset + 1;
        const to = Math.min(offset + pageSize, totalCount);
        return `${from}-${to} of ${totalCount}`;
      },
    },
  });

  const totalCount =
    tableProps.pagination.type === 'page'
      ? tableProps.pagination.totalCount
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
    field: keyof QuestFormData,
    value: string,
  ) => {
    setCreateForm(prev => ({ ...prev, [field]: value }));
    setCreateError(null);
  };

  const handleEditFieldChange = (field: keyof QuestFormData, value: string) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
    setEditError(null);
  };

  const resetCreateDialog = () => {
    setIsCreateOpen(false);
    setCreateError(null);
    setCreateForm(createEmptyQuestForm());
  };

  const resetEditDialog = () => {
    setIsEditOpen(false);
    setSelectedQuest(null);
    setEditError(null);
    setEditForm(createEmptyQuestForm());
  };

  const resetDeleteDialog = () => {
    setIsDeleteOpen(false);
    setQuestToDelete(null);
    setDeleteError(null);
  };

  const handleCreateQuest = async () => {
    const validationError = validateQuestForm(createForm);
    if (validationError) {
      setCreateError(validationError);
      return;
    }

    setCreateLoading(true);
    setCreateError(null);

    try {
      const url = await buildGamificationUrl('/quests');
      const response = await fetchApi.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildQuestPayload(createForm)),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      resetCreateDialog();
      reload();
    } catch (createQuestError) {
      setCreateError(
        createQuestError instanceof Error
          ? createQuestError.message
          : 'An unknown error occurred',
      );
    } finally {
      setCreateLoading(false);
    }
  };

  const handleOpenEditDialog = (quest: Quest) => {
    setSelectedQuest(quest);
    setEditForm({
      title: quest.title,
      description: quest.description,
      target_count: quest.target_count.toString(),
      xp_reward: quest.xp_reward.toString(),
      subject_type: quest.subject_type ?? 'user',
      completion_policy: quest.completion_policy ?? 'REPEATABLE',
      cooldown_days: quest.cooldown_days?.toString() ?? '',
      quest_mode: quest.quest_mode === 'catalog' ? 'catalog' : 'event_driven',
      catalog_condition:
        quest.linked_config?.catalog_condition ?? 'missing_techdocs',
      reminder_day: quest.linked_config?.reminder?.day?.toString() ?? '',
      reminder_description: quest.linked_config?.reminder?.description ?? '',
    });
    setEditError(null);
    setIsEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedQuest) {
      return;
    }

    const validationError = validateQuestForm(editForm);
    if (validationError) {
      setEditError(validationError);
      return;
    }

    setEditLoading(true);
    setEditError(null);

    try {
      const url = await buildGamificationUrl(`/quests/${selectedQuest.id}`);
      const response = await fetchApi.fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildQuestPayload(editForm)),
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

  const handleOpenDeleteDialog = (quest: Quest) => {
    setQuestToDelete(quest);
    setDeleteError(null);
    setIsDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!questToDelete) {
      return;
    }

    setDeleteLoading(true);
    setDeleteError(null);

    try {
      const url = await buildGamificationUrl(`/quests/${questToDelete.id}`);
      const response = await fetchApi.fetch(url, { method: 'DELETE' });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      resetDeleteDialog();
      reload();
    } catch (deleteQuestError) {
      setDeleteError(
        deleteQuestError instanceof Error
          ? deleteQuestError.message
          : 'An unknown error occurred',
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <QuestFormDialog
        isOpen={isCreateOpen}
        mode="create"
        formData={createForm}
        error={createError}
        loading={createLoading}
        onClose={() => {
          if (!createLoading) {
            resetCreateDialog();
          }
        }}
        onSubmit={handleCreateQuest}
        onChange={handleCreateFieldChange}
      />

      <QuestFormDialog
        isOpen={isEditOpen}
        mode="edit"
        formData={editForm}
        error={editError}
        loading={editLoading}
        onClose={() => {
          if (!editLoading) {
            resetEditDialog();
          }
        }}
        onSubmit={handleSaveEdit}
        onChange={handleEditFieldChange}
        questTitle={selectedQuest?.title}
      />

      <QuestDeleteDialog
        isOpen={isDeleteOpen}
        quest={questToDelete}
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
          title={isAdmin ? 'Quests' : 'Your Quests'}
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
            title="Unable to load quests"
            description={tableProps.error.message}
          />
        ) : null}

        <QuestToolbar
          isAdmin={isAdmin}
          isLoading={tableProps.loading || tableProps.isStale}
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
          onCreateQuest={isAdmin ? () => setIsCreateOpen(true) : undefined}
        />

        <QuestTable
          isAdmin={isAdmin}
          search={search}
          tableProps={tableProps}
          onEditQuest={handleOpenEditDialog}
          onDeleteQuest={handleOpenDeleteDialog}
        />
      </Flex>
    </>
  );
};
