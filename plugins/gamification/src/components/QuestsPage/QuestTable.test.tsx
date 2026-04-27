import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { TableProps } from '@backstage/ui';
import { QuestTable } from './QuestTable';
import type { Quest, QuestTableRow } from './types';
import { createQuestTableRow } from './utils';

describe('QuestTable', () => {
  const routerFuture = {
    v7_relativeSplatPath: true,
    v7_startTransition: true,
  } as const;

  const baseQuest: Quest = {
    id: 'quest-1',
    title: 'Review pull requests',
    description: 'Review and approve open pull requests.',
    target_count: 3,
    xp_reward: 50,
    subject_type: 'user',
    completion_policy: 'REPEATABLE',
    cooldown_days: null,
    subject_ref: 'user:default/alice',
    completion_count: 1,
    progress_toward_target: 1,
    next_milestone: 3,
  };

  const createTableProps = (
    data: QuestTableRow[],
  ): Omit<TableProps<QuestTableRow>, 'columnConfig' | 'emptyState'> => ({
    data,
    loading: false,
    isStale: false,
    pagination: {
      type: 'page',
      pageSize: 10,
      pageSizeOptions: [10, 20],
      offset: 0,
      totalCount: data.length,
      hasNextPage: false,
      hasPreviousPage: false,
      onNextPage: jest.fn(),
      onPreviousPage: jest.fn(),
      onPageSizeChange: jest.fn(),
    },
    sort: {
      descriptor: null,
      onSortChange: jest.fn(),
    },
  });

  const renderTable = (isAdmin: boolean) =>
    render(
      <MemoryRouter future={routerFuture}>
        <QuestTable
          isAdmin={isAdmin}
          search=""
          tableProps={createTableProps([createQuestTableRow(baseQuest)])}
          onEditQuest={jest.fn()}
          onDeleteQuest={jest.fn()}
        />
      </MemoryRouter>,
    );

  it('renders the admin quest table without throwing', () => {
    renderTable(true);

    expect(screen.getByText('Review pull requests')).toBeInTheDocument();
    expect(screen.getByText('50 XP')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('renders the user quest table without throwing', () => {
    renderTable(false);

    expect(screen.getByText('Review pull requests')).toBeInTheDocument();
    expect(screen.getByText('1/3')).toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();
  });

  it('hides admin action buttons for archived quests', () => {
    render(
      <MemoryRouter future={routerFuture}>
        <QuestTable
          isAdmin
          search=""
          tableProps={createTableProps([
            createQuestTableRow({
              ...baseQuest,
              archived_at: '2026-03-19T00:00:00Z',
            }),
          ])}
          onEditQuest={jest.fn()}
          onDeleteQuest={jest.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Archived')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Archive' }),
    ).not.toBeInTheDocument();
  });
});
