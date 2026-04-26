import type { AuthService, LoggerService } from '@backstage/backend-plugin-api';
import type { Entity } from '@backstage/catalog-model';
import type { CatalogClient } from '@backstage/catalog-client';
import { CatalogService, type CatalogRule } from '../services/catalogService';
import { missingTechDocsRule } from '../services/catalogRules';

function createLogger(): jest.Mocked<LoggerService> {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(),
  } as unknown as jest.Mocked<LoggerService>;
}

describe('CatalogService', () => {
  const credentials = { token: 'user-token' } as any;
  const entityRef = 'component:default/sample-service';
  const entity: Entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'sample-service',
      namespace: 'default',
    },
  };

  function createService(options?: { entity?: Entity; fetchError?: Error }): {
    service: CatalogService;
    auth: jest.Mocked<AuthService>;
    catalogClient: jest.Mocked<Pick<CatalogClient, 'getEntityByRef'>>;
    logger: jest.Mocked<LoggerService>;
  } {
    const auth = {
      getPluginRequestToken: jest
        .fn()
        .mockResolvedValue({ token: 'catalog-token' }),
    } as unknown as jest.Mocked<AuthService>;
    const catalogClient = {
      getEntityByRef: options?.fetchError
        ? jest.fn().mockRejectedValue(options.fetchError)
        : jest.fn().mockResolvedValue(options?.entity),
    } as jest.Mocked<Pick<CatalogClient, 'getEntityByRef'>>;
    const logger = createLogger();

    return {
      service: new CatalogService(catalogClient as CatalogClient, auth, logger),
      auth,
      catalogClient,
      logger,
    };
  }

  it('returns true when the rule condition is met', async () => {
    const evaluate = jest.fn().mockReturnValue(true);
    const rule: CatalogRule = {
      id: 'is-component',
      description: 'Matches components',
      evaluate,
    };
    const { service, auth, catalogClient, logger } = createService({ entity });

    await expect(
      service.checkCondition(entityRef, rule, credentials),
    ).resolves.toBe(true);

    expect(auth.getPluginRequestToken).toHaveBeenCalledWith({
      onBehalfOf: credentials,
      targetPluginId: 'catalog',
    });
    expect(catalogClient.getEntityByRef).toHaveBeenCalledWith(entityRef, {
      token: 'catalog-token',
    });
    expect(evaluate).toHaveBeenCalledWith(entity);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('returns false when the entity does not exist', async () => {
    const evaluate = jest.fn().mockReturnValue(true);
    const rule: CatalogRule = {
      id: 'is-component',
      description: 'Matches components',
      evaluate,
    };
    const { service, logger } = createService();

    await expect(
      service.checkCondition(entityRef, rule, credentials),
    ).resolves.toBe(false);

    expect(evaluate).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('returns false when the Catalog API throws an error', async () => {
    const evaluate = jest.fn().mockReturnValue(true);
    const rule: CatalogRule = {
      id: 'is-component',
      description: 'Matches components',
      evaluate,
    };
    const fetchError = new Error('catalog unavailable');
    const { service, logger } = createService({ fetchError });

    await expect(
      service.checkCondition(entityRef, rule, credentials),
    ).resolves.toBe(false);

    expect(evaluate).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      `Failed to evaluate catalog rule '${rule.id}' for entity '${entityRef}': ${fetchError}`,
    );
  });

  it('returns the same result when called multiple times with the same input', async () => {
    const evaluate = jest.fn().mockReturnValue(true);
    const rule: CatalogRule = {
      id: 'is-component',
      description: 'Matches components',
      evaluate,
    };
    const { service, auth, catalogClient, logger } = createService({ entity });

    const first = await service.checkCondition(entityRef, rule, credentials);
    const second = await service.checkCondition(entityRef, rule, credentials);
    const third = await service.checkCondition(entityRef, rule, credentials);

    expect(first).toBe(true);
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(auth.getPluginRequestToken).toHaveBeenCalledTimes(3);
    expect(catalogClient.getEntityByRef).toHaveBeenCalledTimes(3);
    expect(evaluate).toHaveBeenCalledTimes(3);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('supports catalog rules defined outside catalogService', async () => {
    const entityMissingTechDocs: Entity = {
      ...entity,
      metadata: {
        ...entity.metadata,
        annotations: {},
      },
    };
    const { service } = createService({ entity: entityMissingTechDocs });

    await expect(
      service.checkCondition(entityRef, missingTechDocsRule, credentials),
    ).resolves.toBe(true);
  });
});
