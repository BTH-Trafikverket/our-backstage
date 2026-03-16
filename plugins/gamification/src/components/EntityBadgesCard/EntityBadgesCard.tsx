import { useEffect, useState } from 'react';
import {
  InfoCard,
  Progress,
  type InfoCardVariants,
} from '@backstage/core-components';
import {
  discoveryApiRef,
  fetchApiRef,
  identityApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { useEntity } from '@backstage/plugin-catalog-react';
import { List, ListItem, ListItemText, Typography } from '@material-ui/core';

export type BadgeProgressBadge = {
  id: string;
  title: string;
  description: string;
  isEarned: boolean;
  earnedAt?: string | null;
  criterias: Array<{
    quest_id: string;
    target_count: number;
  }>;
  created_at?: string;
  updated_at?: string;
  archived_at?: string | null;
};

type BadgeProgressResponse = {
  subjectRefs: string[];
  badges: BadgeProgressBadge[];
};

export type BadgesCardProps = {
  subjectRef: string;
  title?: string;
  variant?: InfoCardVariants;
  emptyMessage?: string;
};

export type EntityBadgesCardProps = Omit<BadgesCardProps, 'subjectRef'>;

export const BadgesCard = ({
  subjectRef,
  title = 'Badge progress',
  variant = 'gridItem',
  emptyMessage = 'No badge progress yet.',
}: BadgesCardProps) => {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const identityApi = useApi(identityApiRef);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [data, setData] = useState<BadgeProgressResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        setLoading(true);
        setError(undefined);

        const baseUrl = await discoveryApi.getBaseUrl('gamification');
        const url = new URL(`${baseUrl}/badges/progress`);
        url.searchParams.set('subjectRef', subjectRef);

        const { token } = await identityApi.getCredentials();
        const resp = await fetchApi.fetch(url.toString(), {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });

        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(`${resp.status} ${resp.statusText}: ${text}`);
        }

        const json = (await resp.json()) as BadgeProgressResponse;
        if (!cancelled) {
          setData(json);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? String(e));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [discoveryApi, fetchApi, identityApi, subjectRef]);

  let body: JSX.Element;

  if (loading) {
    body = <Progress />;
  } else if (error) {
    body = <Typography color="error">{error}</Typography>;
  } else if (!data || data.badges.length === 0) {
    body = <Typography>{emptyMessage}</Typography>;
  } else {
    body = (
      <List disablePadding>
        {data.badges.map((badge, index) => {
          const state = badge.isEarned ? 'Earned' : 'In progress';
          const archived = badge.archived_at ? ' archived' : '';

          return (
            <ListItem
              key={badge.id}
              divider={index < data.badges.length - 1}
              style={{ paddingLeft: 0, paddingRight: 0 }}
            >
              <ListItemText
                primary={badge.title}
                secondary={`${badge.description} (${state}${archived})`}
              />
            </ListItem>
          );
        })}
      </List>
    );
  }

  return (
    <InfoCard title={title} variant={variant}>
      {body}
    </InfoCard>
  );
};

export const EntityBadgesCard = (props: EntityBadgesCardProps) => {
  const { entity } = useEntity();
  const subjectRef = stringifyEntityRef(entity);

  return <BadgesCard {...props} subjectRef={subjectRef} />;
};
