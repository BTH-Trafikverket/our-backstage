import type { AuthService, LoggerService } from '@backstage/backend-plugin-api';
import type { CatalogClient } from '@backstage/catalog-client';
import { stringifyEntityRef } from '@backstage/catalog-model';
import type { QuestsService } from './questsService';

const DEFAULT_SCAN_INTERVAL_MS = 15 * 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class CatalogLinkedQuestWorker {
  private readonly questsService: QuestsService;
  private readonly auth: AuthService;
  private readonly catalogClient: Pick<CatalogClient, 'getEntities'>;
  private readonly logger: LoggerService;
  private readonly scanIntervalMs: number;
  private running = false;

  constructor(options: {
    questsService: QuestsService;
    auth: AuthService;
    catalogClient: Pick<CatalogClient, 'getEntities'>;
    logger: LoggerService;
    scanIntervalMs?: number;
  }) {
    this.questsService = options.questsService;
    this.auth = options.auth;
    this.catalogClient = options.catalogClient;
    this.logger = options.logger;
    this.scanIntervalMs = options.scanIntervalMs ?? DEFAULT_SCAN_INTERVAL_MS;
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    void this.runLoop();
  }

  async runOnce(): Promise<void> {
    try {
      const credentials = await this.auth.getOwnServiceCredentials();
      const { token } = await this.auth.getPluginRequestToken({
        onBehalfOf: credentials,
        targetPluginId: 'catalog',
      });

      const response = await this.catalogClient.getEntities(
        {
          filter: [{ kind: 'Group' }],
        },
        { token },
      );

      const teamRefs = [
        ...new Set((response.items ?? []).map(stringifyEntityRef)),
      ];

      for (const teamRef of teamRefs) {
        try {
          await this.questsService.runCatalogLinkedQuestsForTeam(teamRef, {
            credentials,
          });
        } catch (error) {
          this.logger.error(
            `Catalog-linked quest worker failed for team '${teamRef}': ${error}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Catalog-linked quest worker failed: ${error}`);
    }
  }

  private async runLoop(): Promise<void> {
    while (this.running) {
      await this.runOnce();
      await sleep(this.scanIntervalMs);
    }
  }
}
