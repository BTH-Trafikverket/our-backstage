import { render, screen } from '@testing-library/react';
import { LeaderboardPage } from './LeaderboardPage';

describe('LeaderboardPage', () => {
  it('renders the leaderboard table with mock data', () => {
    render(<LeaderboardPage />);

    expect(screen.getByText('Leaderboard')).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Rank' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Name' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Points' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Alice Andersson')).toBeInTheDocument();
    expect(screen.getByText('Anton Aberg')).toBeInTheDocument();
  });
});
