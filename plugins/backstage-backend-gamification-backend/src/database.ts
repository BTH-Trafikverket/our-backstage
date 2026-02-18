import type { DatabaseService } from '@backstage/backend-plugin-api';
import { resolvePackagePath } from '@backstage/backend-plugin-api';
import type { Knex } from 'knex';


export async function initGameDb(options:{
    database: DatabaseService;
    migrationPackageName: string;
}) : Promise<Knex> {

    const client = await options.database.getClient();

    const migrationsDir = resolvePackagePath(options.migrationPackageName, 'migrations');

    await client.migrate.latest({ directory: migrationsDir});

    return client;
    
}
