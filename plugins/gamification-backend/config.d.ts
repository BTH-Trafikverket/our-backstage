export interface Config {
  gamification?: {
    admin?: {
      /**
       * Catalog group entity refs that are allowed to administer quests.
       * Example: ["group:default/devex-admins"]
       * @visibility backend
       */
      groups?: string[];
    };
    badges?: {
      imageUpload?: {
        /**
         * Maximum allowed badge image upload size in bytes.
         * Defaults to 1048576 (1 MiB).
         * @visibility backend
         */
        maxBytes?: number;
        /**
         * Maximum allowed source image pixel count before sharp rejects it.
         * Defaults to 16777216.
         * @visibility backend
         */
        maxPixels?: number;
      };
    };
    quests?: {
      /**
       * Service principal subjects that are allowed to post quest events.
       * Example: ["external:default/github-actions"]
       * @visibility backend
       */
      allowedCallers?: string[];
    };
    leaderboard?: {
      /**
       * IANA timezone used when calculating weekly and monthly leaderboard windows.
       * Defaults to Europe/Stockholm!
       * @visibility backend
       */
      timeZone?: string;
    };
    webhooks?: {
      /**
       * IANA timezone used when resolving daily, weekly, and monthly webhook periods.
       * Defaults to Europe/Stockholm.
       * @visibility backend
       */
      timeZone?: string;
      delivery?: {
        /**
         * Maximum webhook request duration in milliseconds.
         * Defaults to 10000.
         * @visibility backend
         */
        timeoutMs?: number;
        /**
         * Optional outbound host allowlist for webhook delivery.
         * When provided, only these hosts may be called.
         * @visibility backend
         */
        allowedHosts?: string[];
        /**
         * Whether plain HTTP webhook targets are allowed.
         * Defaults to false.
         * @visibility backend
         */
        allowHttp?: boolean;
        /**
         * Whether localhost and private literal IP targets are allowed.
         * Defaults to false.
         * @visibility backend
         */
        allowPrivateTargets?: boolean;
      };
      startupScan?: {
        /**
         * Whether to run the best-effort scheduled webhook scan during plugin startup.
         * Defaults to true.
         * @visibility backend
         */
        enabled?: boolean;
      };
    };
    actorResolution?: {
      providers?: {
        /**
         * Provider-specific catalog lookup configuration for resolving event
         * actors to Backstage users.
         *
         * Example:
         * {
         *   github: {
         *     idAnnotations: ["metadata.annotations.github.com/user-id"],
         *     loginAnnotations: ["metadata.annotations.github.com/user-login"]
         *   },
         *   "azure-devops": {
         *     idAnnotations: ["metadata.annotations.example.com/azure-devops-user-id"],
         *     loginAnnotations: ["metadata.annotations.example.com/azure-devops-username"]
         *   }
         * }
         *
         * @visibility backend
         */
        [provider: string]: {
          /**
           * Catalog annotation paths to try when resolving actor.id.
           * @visibility backend
           */
          idAnnotations?: string[];
          /**
           * Catalog annotation paths to try when resolving actor.login.
           * @visibility backend
           */
          loginAnnotations?: string[];
        };
      };
    };
    seed?: {
      /**
       * Whether to apply bundled gamification seed data during plugin startup.
       * Defaults to false.
       * @visibility backend
       */
      enabled?: boolean;
      /**
       * Whether to clear existing gamification data before applying seeds.
       * Only used when seed.enabled is true. Defaults to false.
       * @visibility backend
       */
      reset?: boolean;
    };
  };
}
