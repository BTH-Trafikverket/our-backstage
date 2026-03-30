export type LeaderboardEntry = {
  id: string;
  rank: number;
  name: string;
  points: number;
};

export const leaderboardMockData: LeaderboardEntry[] = [
  { id: 'leaderboard-1', rank: 1, name: 'Alice Andersson', points: 1480 },
  { id: 'leaderboard-2', rank: 2, name: 'Marcus Lindberg', points: 1415 },
  { id: 'leaderboard-3', rank: 3, name: 'Nina Karlsson', points: 1360 },
  { id: 'leaderboard-4', rank: 4, name: 'David Holm', points: 1295 },
  { id: 'leaderboard-5', rank: 5, name: 'Sofia Ek', points: 1230 },
  { id: 'leaderboard-6', rank: 6, name: 'Johan Berg', points: 1185 },
  { id: 'leaderboard-7', rank: 7, name: 'Emma Nystrom', points: 1120 },
  { id: 'leaderboard-8', rank: 8, name: 'Oskar Dahl', points: 1075 },
  { id: 'leaderboard-9', rank: 9, name: 'Clara Sjoberg', points: 1010 },
  { id: 'leaderboard-10', rank: 10, name: 'William Noren', points: 960 },
  { id: 'leaderboard-11', rank: 11, name: 'Maja Eriksson', points: 915 },
  { id: 'leaderboard-12', rank: 12, name: 'Anton Aberg', points: 870 },
];
