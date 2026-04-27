import type { Entity } from '@backstage/catalog-model';
import {
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
