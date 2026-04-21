import { mockServices } from '@backstage/backend-test-utils';

jest.mock('../database', () => ({
  initGameDb: jest.fn(),
}));

jest.mock('../router', () => ({
  createRouter: jest.fn(),
}));

jest.mock('../services/domainEventWorker', () => ({
  DomainEventWorker: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
  })),
}));

jest.mock('../services/scheduledWebhooksWorker', () => ({
  ScheduledWebhooksWorker: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
  })),
}));

import { initGameDb } from '../database';
import { createRouter } from '../router';
import { DomainEventWorker } from '../services/domainEventWorker';
import { ScheduledWebhooksWorker } from '../services/scheduledWebhooksWorker';
import { gamificationBackendPlugin } from '../plugin';

describe('gamification backend plugin worker startup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (initGameDb as jest.Mock).mockResolvedValue({});
    (createRouter as jest.Mock).mockReturnValue('mock-router');
  });

  async function initPlugin(configData?: object) {
    const registration = gamificationBackendPlugin.getRegistrations()[0];
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    const httpRouter = {
      use: jest.fn(),
    };

    await registration.init.func({
      database: {} as any,
      logger: logger as any,
      config: configData
        ? mockServices.rootConfig({ data: configData })
        : mockServices.rootConfig(),
      httpRouter: httpRouter as any,
      httpAuth: {} as any,
      userInfo: {} as any,
      auth: {} as any,
      discovery: {} as any,
    });

    return { logger, httpRouter };
  }

  it('skips both webhook workers when disabled by config', async () => {
    const { logger, httpRouter } = await initPlugin({
      gamification: {
        webhooks: {
          delivery: {
            enabled: false,
          },
          scheduling: {
            enabled: false,
          },
        },
      },
    });
    const domainEventWorkerInstance = (DomainEventWorker as jest.Mock).mock
      .results[0]?.value;
    const scheduledWebhooksWorkerInstance = (
      ScheduledWebhooksWorker as jest.Mock
    ).mock.results[0]?.value;

    expect(initGameDb).toHaveBeenCalled();
    expect(httpRouter.use).toHaveBeenCalledWith('mock-router');
    expect(DomainEventWorker).toHaveBeenCalledTimes(1);
    expect(ScheduledWebhooksWorker).toHaveBeenCalledTimes(1);
    expect(domainEventWorkerInstance.start).not.toHaveBeenCalled();
    expect(scheduledWebhooksWorkerInstance.start).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      'gamification domain event worker disabled by config (gamification.webhooks.delivery.enabled=false)',
    );
    expect(logger.info).toHaveBeenCalledWith(
      'gamification scheduled webhook worker disabled by config (gamification.webhooks.scheduling.enabled=false)',
    );
  });

  it('starts both webhook workers when the config omits the flags', async () => {
    const { logger } = await initPlugin();
    const domainEventWorkerInstance = (DomainEventWorker as jest.Mock).mock
      .results[0]?.value;
    const scheduledWebhooksWorkerInstance = (
      ScheduledWebhooksWorker as jest.Mock
    ).mock.results[0]?.value;

    expect(domainEventWorkerInstance.start).toHaveBeenCalledTimes(1);
    expect(scheduledWebhooksWorkerInstance.start).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      'gamification domain event worker started',
    );
    expect(logger.info).toHaveBeenCalledWith(
      'gamification scheduled webhook worker started',
    );
  });
});
