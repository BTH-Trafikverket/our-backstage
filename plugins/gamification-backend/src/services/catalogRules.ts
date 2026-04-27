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

export const missingOwnerRule: CatalogRule = {
  id: 'missing_owner',
  description: 'Entity is missing spec.owner',
  evaluate(entity) {
    const owner = entity.spec?.owner?.trim();

    return !owner;
  },
};

export const missingDescriptionRule: CatalogRule = {
  id: 'missing_description',
  description: 'Entity is missing metadata.description',
  evaluate(entity) {
    const description = entity.metadata.description?.trim();

    return !description;
  },
};

export const missingTagsRule: CatalogRule = {
  id: 'missing_tags',
  description: 'Entity has no tags in metadata.tags',
  evaluate(entity) {
    const tags =
      entity.metadata.tags?.filter(tag => tag.trim().length > 0) ?? [];

    return tags.length === 0;
  },
};

export const catalogRules: CatalogRule[] = [
  missingTechDocsRule,
  missingOwnerRule,
  missingDescriptionRule,
  missingTagsRule,
];

export function getCatalogRule(ruleId: string): CatalogRule | undefined {
  return catalogRules.find(rule => rule.id === ruleId);
}
