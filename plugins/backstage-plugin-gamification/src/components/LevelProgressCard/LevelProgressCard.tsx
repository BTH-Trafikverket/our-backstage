import {
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Box,
} from '@mui/material';

export type LevelProgressCardProps = {
  level: number;
  xp: number;
  nextLevelXp: number;
};

export const LevelProgressCard = ({
  level,
  xp,
  nextLevelXp,
}: LevelProgressCardProps) => {
  const safeNext = Math.max(1, nextLevelXp);
  const clampedXp = Math.max(0, Math.min(xp, safeNext));
  const progress = (clampedXp / safeNext) * 100;

  return (
    <Card>
      <CardContent>
        <Typography variant="h6">Level {level}</Typography>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            XP
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {xp} / {nextLevelXp}
          </Typography>
        </Box>

        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{ mt: 1.5 }}
        />

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 0.75, display: 'block' }}
        >
          {Math.round(progress)}% to next level
        </Typography>
      </CardContent>
    </Card>
  );
};
