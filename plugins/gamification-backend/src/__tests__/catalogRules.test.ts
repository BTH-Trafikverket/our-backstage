import type { Entity } from '@backstage/catalog-model';
import {
  getCatalogRuleFromConfig,
  getCatalogRule,
  missingDescriptionRule,
  missingOwnerRule,
  missingTagsRule,
  missingTechDocsRule,
} from '../services/catalogRules';

describe('catalogRules', () => {
  const baseEntity: Entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'sample-service',
      namespace: 'default',
    },
  };

  it('registers missingTechDocsRule by id', () => {
    expect(getCatalogRule('missing_techdocs')).toBe(missingTechDocsRule);
  });

  it('registers missingOwnerRule by id', () => {
    expect(getCatalogRule('missing_owner')).toBe(missingOwnerRule);
  });

  it('registers missingDescriptionRule by id', () => {
    expect(getCatalogRule('missing_description')).toBe(missingDescriptionRule);
  });

  it('registers missingTagsRule by id', () => {
    expect(getCatalogRule('missing_tags')).toBe(missingTagsRule);
  });

  it('maps catalog_rule config to a registered evaluator rule', () => {
    expect(
      getCatalogRuleFromConfig({
        version: 'v1',
        check: { type: 'missing_techdocs' },
      }),
    ).toBe(missingTechDocsRule);
  });

  it('builds required_annotation evaluator from catalog_rule config', () => {
    const rule = getCatalogRuleFromConfig({
      version: 'v1',
      check: {
        type: 'required_annotation',
        annotation: 'backstage.io/techdocs-ref',
      },
    });

    expect(rule).toBeDefined();
    expect(
      rule?.evaluate({
        ...baseEntity,
        metadata: {
          ...baseEntity.metadata,
          annotations: {},
        },
      }),
    ).toBe(true);
  });

  it('builds missing_lifecycle evaluator from catalog_rule config', () => {
    const rule = getCatalogRuleFromConfig({
      version: 'v1',
      check: {
        type: 'missing_lifecycle',
      },
    });

    expect(rule).toBeDefined();
    expect(rule?.evaluate(baseEntity)).toBe(true);
    expect(
      rule?.evaluate({
        ...baseEntity,
        spec: {
          lifecycle: 'production',
        },
      }),
    ).toBe(false);
  });

  it('builds missing_relation evaluator from catalog_rule config', () => {
    const rule = getCatalogRuleFromConfig({
      version: 'v1',
      check: {
        type: 'missing_relation',
        relationType: 'ownedBy',
      },
    });

    expect(rule).toBeDefined();
    expect(rule?.evaluate(baseEntity)).toBe(true);
    expect(
      rule?.evaluate({
        ...baseEntity,
        relations: [
          {
            type: 'ownedBy',
            targetRef: 'group:default/platform',
          },
        ],
      }),
    ).toBe(false);
  });

  it('builds missing_dependency_metadata evaluator from catalog_rule config', () => {
    const rule = getCatalogRuleFromConfig({
      version: 'v1',
      check: {
        type: 'missing_dependency_metadata',
        field: 'dependsOn',
      },
    });

    expect(rule).toBeDefined();
    expect(rule?.evaluate(baseEntity)).toBe(true);
    expect(
      rule?.evaluate({
        ...baseEntity,
        spec: {
          dependsOn: ['component:default/api'],
        },
      }),
    ).toBe(false);
  });

  it('passes when the techdocs annotation is missing', () => {
    expect(missingTechDocsRule.evaluate(baseEntity)).toBe(true);
  });

  it('passes when the techdocs annotation is blank', () => {
    expect(
      missingTechDocsRule.evaluate({
        ...baseEntity,
        metadata: {
          ...baseEntity.metadata,
          annotations: {
            'backstage.io/techdocs-ref': '   ',
          },
        },
      }),
    ).toBe(true);
  });

  it('fails when the techdocs annotation is present', () => {
    expect(
      missingTechDocsRule.evaluate({
        ...baseEntity,
        metadata: {
          ...baseEntity.metadata,
          annotations: {
            'backstage.io/techdocs-ref': 'dir:.',
          },
        },
      }),
    ).toBe(false);
  });

  it('passes when spec.owner is missing', () => {
    expect(missingOwnerRule.evaluate(baseEntity)).toBe(true);
  });

  it('passes when spec.owner is blank', () => {
    expect(
      missingOwnerRule.evaluate({
        ...baseEntity,
        spec: {
          owner: '   ',
        },
      }),
    ).toBe(true);
  });

  it('fails when spec.owner is present', () => {
    expect(
      missingOwnerRule.evaluate({
        ...baseEntity,
        spec: {
          owner: 'group:default/team-a',
        },
      }),
    ).toBe(false);
  });

  it('passes when metadata.description is missing', () => {
    expect(missingDescriptionRule.evaluate(baseEntity)).toBe(true);
  });

  it('passes when metadata.description is blank', () => {
    expect(
      missingDescriptionRule.evaluate({
        ...baseEntity,
        metadata: {
          ...baseEntity.metadata,
          description: '   ',
        },
      }),
    ).toBe(true);
  });

  it('fails when metadata.description is present', () => {
    expect(
      missingDescriptionRule.evaluate({
        ...baseEntity,
        metadata: {
          ...baseEntity.metadata,
          description: 'Service description',
        },
      }),
    ).toBe(false);
  });

  it('passes when metadata.tags is missing', () => {
    expect(missingTagsRule.evaluate(baseEntity)).toBe(true);
  });

  it('passes when metadata.tags is empty', () => {
    expect(
      missingTagsRule.evaluate({
        ...baseEntity,
        metadata: {
          ...baseEntity.metadata,
          tags: [],
        },
      }),
    ).toBe(true);
  });

  it('passes when metadata.tags only contains blanks', () => {
    expect(
      missingTagsRule.evaluate({
        ...baseEntity,
        metadata: {
          ...baseEntity.metadata,
          tags: ['   '],
        },
      }),
    ).toBe(true);
  });

  it('fails when metadata.tags contains values', () => {
    expect(
      missingTagsRule.evaluate({
        ...baseEntity,
        metadata: {
          ...baseEntity.metadata,
          tags: ['java', 'backend'],
        },
      }),
    ).toBe(false);
  });
});
