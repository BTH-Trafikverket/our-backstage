import { CatalogClient } from '@backstage/catalog-client';
import { stringifyEntityRef, type Entity } from '@backstage/catalog-model';
import { AuthService } from '@backstage/backend-plugin-api';

type CatalogServiceOpts = {
  credentials: any;
};

export class CatalogService {
  constructor(
    private readonly catalogClient: CatalogClient,
    private readonly auth: AuthService,
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

  checkCondition(
    entity: Entity,
    condition: (entity: Entity) => boolean,
  ): boolean {
    // Allows callers to run a simple entity check through this service.
    return condition(entity);
  }

  async evaluateTeamOwnedEntities(
    teamRef: string,
    condition: (entity: Entity) => boolean,
    credentials: CatalogServiceOpts['credentials'],
  ): Promise<Array<{ entityRef: string; passed: boolean }>> {
    // Evaluates each team-owned entity against a caller-provided condition.
    const entities = await this.getTeamOwnedEntities(teamRef, credentials);

    return entities.map(entity => ({
      entityRef: stringifyEntityRef(entity),
      passed: this.checkCondition(entity, condition),
    }));
  }
}
