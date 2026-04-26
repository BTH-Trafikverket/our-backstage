import type { CatalogClient } from '@backstage/catalog-client';
import { stringifyEntityRef, type Entity } from '@backstage/catalog-model';
import type { AuthService, LoggerService } from '@backstage/backend-plugin-api';
import type { CatalogRule } from './catalogRules';

export type { CatalogRule } from './catalogRules';

type CatalogServiceOpts = {
  credentials: any;
};

type TeamOwnedEntitiesCatalogClient = Pick<CatalogClient, 'getEntities'>;

export class CatalogService {
  constructor(
    private readonly catalogClient: Pick<CatalogClient, 'getEntityByRef'>,
    private readonly auth: AuthService,
    private readonly logger?: LoggerService,
  ) {}

  private getTeamOwnedEntitiesCatalogClient(): TeamOwnedEntitiesCatalogClient {
    const catalogClient = this.catalogClient as Pick<
      CatalogClient,
      'getEntityByRef'
    > &
      Partial<TeamOwnedEntitiesCatalogClient>;

    if (!catalogClient.getEntities) {
      throw new Error('Catalog client does not support getEntities');
    }

    return catalogClient as TeamOwnedEntitiesCatalogClient;
  }

  private async getCatalogToken(
    credentials: CatalogServiceOpts['credentials'],
  ) {
    return this.auth.getPluginRequestToken({
      onBehalfOf: credentials,
      targetPluginId: 'catalog',
    });
  }

  async getTeamOwnedEntities(
    teamRef: string,
    credentials: CatalogServiceOpts['credentials'],
  ): Promise<Entity[]> {
    // Keep catalog access in one place so route/service code can stay focused.
    // TODO: Tighten this query once the exact owned entity scope is defined.
    const { token } = await this.getCatalogToken(credentials);
    const response = await this.getTeamOwnedEntitiesCatalogClient().getEntities(
      {
        filter: [{ 'relations.ownedBy': teamRef }],
      },
      { token },
    );

    return response.items;
  }

  async checkCondition(
    entityRef: string,
    rule: CatalogRule,
    credentials: CatalogServiceOpts['credentials'],
  ): Promise<boolean> {
    let entity: Entity | undefined;

    try {
      const { token } = await this.getCatalogToken(credentials);
      entity = await this.catalogClient.getEntityByRef(entityRef, { token });
    } catch (error) {
      const message = `Failed to evaluate catalog rule '${rule.id}' for entity '${entityRef}': ${error}`;
      if (this.logger) {
        this.logger.error(message);
      } else {
        console.error(message);
      }
      return false;
    }

    if (!entity) {
      return false;
    }

    return rule.evaluate(entity);
  }

  async evaluateTeamOwnedEntities(
    teamRef: string,
    rule: CatalogRule,
    credentials: CatalogServiceOpts['credentials'],
  ): Promise<Array<{ entityRef: string; passed: boolean }>> {
    // Evaluates each team-owned entity against a caller-provided rule.
    const entities = await this.getTeamOwnedEntities(teamRef, credentials);

    return entities.map(entity => ({
      entityRef: stringifyEntityRef(entity),
      passed: rule.evaluate(entity),
    }));
  }
}
