import type { Entity } from '@backstage/catalog-model';
import { getCatalogRule, missingTechDocsRule } from '../services/catalogRules';

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
});
