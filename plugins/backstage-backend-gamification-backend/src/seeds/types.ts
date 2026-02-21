import type { Knex } from 'knex';

export type SeedContext = {
  knex: Knex;
};

export type Seed = {
  id: string;
  description: string;
  run(ctx: SeedContext): Promise<void>;
};
