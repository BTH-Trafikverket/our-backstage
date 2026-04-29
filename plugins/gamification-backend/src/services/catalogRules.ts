import type { Entity } from '@backstage/catalog-model';
import type { CatalogRule as CatalogRuleConfig } from '../schemas/quests/questCreationSchema';

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
    const owner =
      typeof entity.spec?.owner === 'string' ? entity.spec.owner.trim() : '';
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

export function getCatalogRuleFromConfig(
  config: CatalogRuleConfig,
): CatalogRule | undefined {
  if (config.version !== 'v1') {
    return undefined;
  }

  const check = config.check;

  if (
    check.type === 'missing_techdocs' ||
    check.type === 'missing_owner' ||
    check.type === 'missing_description' ||
    check.type === 'missing_tags'
  ) {
    return getCatalogRule(check.type);
  }

  if (check.type === 'missing_lifecycle') {
    return {
      id: 'missing_lifecycle',
      description: 'Entity is missing spec.lifecycle',
      evaluate(entity) {
        const lifecycle =
          typeof entity.spec?.lifecycle === 'string'
            ? entity.spec.lifecycle.trim()
            : '';
        return !lifecycle;
      },
    };
  }

  if (check.type === 'required_annotation') {
    const annotationKey = check.annotation.trim();

    return {
      id: `required_annotation:${annotationKey}`,
      description: `Entity is missing required annotation '${annotationKey}'`,
      evaluate(entity) {
        const value = entity.metadata.annotations?.[annotationKey]?.trim();
        return !value;
      },
    };
  }

  if (check.type === 'missing_relation') {
    const relationType = check.relationType.trim().toLocaleLowerCase('en-US');

    return {
      id: `missing_relation:${relationType}`,
      description: `Entity is missing relation '${relationType}'`,
      evaluate(entity) {
        const hasRelation =
          entity.relations?.some(
            relation =>
              relation.type.trim().toLocaleLowerCase('en-US') === relationType,
          ) ?? false;

        return !hasRelation;
      },
    };
  }

  if (check.type === 'missing_dependency_metadata') {
    const dependencyField = check.field.trim();

    return {
      id: `missing_dependency_metadata:${dependencyField}`,
      description: `Entity is missing dependency metadata field '${dependencyField}'`,
      evaluate(entity) {
        const specRecord =
          entity.spec && typeof entity.spec === 'object'
            ? (entity.spec as Record<string, unknown>)
            : undefined;
        const value = specRecord?.[dependencyField];

        if (Array.isArray(value)) {
          return value.length === 0;
        }

        if (typeof value === 'string') {
          return value.trim().length === 0;
        }

        return value === undefined || value === null;
      },
    };
  }

  return undefined;
}
