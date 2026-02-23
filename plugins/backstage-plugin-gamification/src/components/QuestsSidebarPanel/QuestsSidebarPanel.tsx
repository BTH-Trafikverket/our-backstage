import { useState } from 'react';
import { Button, Divider, TextField, Typography } from '@material-ui/core';
import { InfoCard } from '@backstage/core-components';

type QuestsSidebarPanelProps = {
  isAdmin: boolean;
};

export const QuestsSidebarPanel = ({ isAdmin }: QuestsSidebarPanelProps) => {
  const [showCreateForm, setShowCreateForm] = useState(false);

  if (!isAdmin) {
    return null;
  }

  return (
    <InfoCard title="Admin panel">
      <Button
        fullWidth
        variant="contained"
        color="primary"
        onClick={() => setShowCreateForm(prev => !prev)}
      >
        {showCreateForm ? 'Close' : 'Create a new quest'}
      </Button>
      {showCreateForm && (
        <>
          <Divider style={{ margin: '16px 0' }} />
          <TextField fullWidth label="Title" margin="dense" size="small" />
          <TextField
            fullWidth
            label="Description"
            margin="dense"
            size="small"
            multiline
            rows={3}
          />
          <TextField
            fullWidth
            label="Interval"
            margin="dense"
            size="small"
            type="number"
            inputProps={{ min: 1 }}
          />
          <TextField
            fullWidth
            label="XP Reward"
            margin="dense"
            size="small"
            type="number"
            inputProps={{ min: 1 }}
          />
          <Button
            fullWidth
            variant="outlined"
            color="primary"
            style={{ marginTop: 12 }}
          >
            Save quest (TODO)
          </Button>
          <Typography
            variant="caption"
            display="block"
            style={{ marginTop: 8 }}
          >
            TODO: Koppla till backend och validering
          </Typography>
        </>
      )}
    </InfoCard>
  );
};
