import type { Entity } from '@backstage/catalog-model';

const TECHDOCS_REF_ANNOTATION = 'backstage.io/techdocs-ref';

export interface CatalogRule {
  id: string;
  description: string;
  evaluate(entity: Entity): boolean;
}

export const missingTechDocsRule: CatalogRule = {
  id: 'missing_techdocs',
  description: `Entity is missing the ${TECHDOCS_REF_ANNOTATION} annotation`,
  evaluate(entity) {
    const techdocsRef =
      entity.metadata.annotations?.[TECHDOCS_REF_ANNOTATION]?.trim();

    return !techdocsRef;
  },
};

export const catalogRules: CatalogRule[] = [missingTechDocsRule];

export function getCatalogRule(ruleId: string): CatalogRule | undefined {
  return catalogRules.find(rule => rule.id === ruleId);
}
