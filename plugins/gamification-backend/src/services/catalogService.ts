import { CatalogClient } from '@backstage/catalog-client';
import type { Entity } from '@backstage/catalog-model';

export class CatalogService {
  constructor(private readonly catalogClient: CatalogClient) {}

  async getTeamOwnedEntities(teamRef: string): Promise<Entity[]> {
    // Keep catalog access in one place so route/service code can stay focused.
    // TODO: Tighten this query once the exact owned entity scope is defined.
    const response = await this.catalogClient.getEntities({
      filter: [{ 'relations.ownedBy': teamRef }],
    });

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
  ): Promise<Array<{ entityRef: string; passed: boolean }>> {
    // Evaluates each team-owned entity against a caller-provided condition.
    const entities = await this.getTeamOwnedEntities(teamRef);

    return entities.map(entity => ({
      entityRef: entity.metadata?.name ?? 'unknown',
      passed: this.checkCondition(entity, condition),
    }));
  }
}
