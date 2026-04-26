import { CatalogClient } from '@backstage/catalog-client';
import { stringifyEntityRef, type Entity } from '@backstage/catalog-model';
import type { LoggerService } from '@backstage/backend-plugin-api';
import { AuthService } from '@backstage/backend-plugin-api';

type CatalogServiceOpts = {
  credentials: any;
};

export interface CatalogRule {
  id: string;
  description: string;
  evaluate(entity: Entity): boolean;
}

export class CatalogService {
  constructor(
    private readonly catalogClient: CatalogClient,
    private readonly auth: AuthService,
    private readonly logger?: LoggerService,
  ) {}

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
    const response = await this.catalogClient.getEntities(
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
