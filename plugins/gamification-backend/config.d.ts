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
    reminders?: {
      /**
       * Whether the reminder evaluation worker starts on backend boot.
       * Defaults to true.
       * @visibility backend
       */
      enabled?: boolean;
      /**
       * Interval in milliseconds between reminder evaluation runs.
       * Defaults to 3600000 (1 hour).
       * @visibility backend
       */
      evaluationIntervalMs?: number;
      /**
       * Reminder rules to evaluate against existing gamification history.
       * @visibility backend
       */
      rules?: Array<{
        /**
         * Stable rule identity used for reminder upserts.
         * Example: "inactive-pr-review-14d"
         * @visibility backend
         */
        key: string;
        /**
         * Quest ID the reminder points to.
         * @visibility backend
         */
        questId?: string;
        questTitle?: string;
        /**
         * Inactivity threshold in whole days.
         * @visibility backend
         */
        inactivityDays: number;
        /**
         * Human-readable activity text used in reminder messages.
         * Example: "reviewed a PR"
         * @visibility backend
         */
        activityDescription: string;
        /**
         * Existing history source used to determine activity.
         * Defaults to "quest_event_receipts".
         * @visibility backend
         */
        activitySource?: 'quest_event_receipts';
      }>;
    };
    catalogLinked?: {
      /**
       * Whether the catalog-linked quest evaluation worker starts on backend boot.
       * Defaults to true.
       * @visibility backend
       */
      enabled?: boolean;
      /**
       * Interval in milliseconds between automatic catalog-linked evaluation runs.
       * Defaults to 900000 (15 minutes).
       * @visibility backend
       */
      scanIntervalMs?: number;
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
       * IANA timezone used for scheduled webhook period boundaries.
       * Defaults to Europe/Stockholm.
       * @visibility backend
       */
      timeZone?: string;
      /**
       * Scan interval in milliseconds for scheduled daily/weekly/monthly
       * webhook enqueueing. Defaults to 60000.
       * @visibility backend
       */
      scheduleScanIntervalMs?: number;
      delivery?: {
        /**
         * Whether the domain-event webhook delivery worker starts on backend boot.
         * Defaults to true.
         * @visibility backend
         */
        enabled?: boolean;
        /**
         * Fallback polling interval for the domain-event webhook worker in
         * milliseconds. LISTEN/NOTIFY is used for fast wakeups, while polling
         * remains the recovery path. Defaults to 600000.
         * @visibility backend
         */
        pollIntervalMs?: number;
        /**
         * Maximum number of domain events to claim per worker batch.
         * Defaults to 25.
         * @visibility backend
         */
        batchSize?: number;
        /**
         * Maximum number of delivery attempts before a domain event is dead-lettered.
         * Defaults to 10.
         * @visibility backend
         */
        maxAttempts?: number;
        /**
         * Time in milliseconds after which an uncompleted claim can be reclaimed
         * by the worker. Defaults to 60000.
         * @visibility backend
         */
        claimTtlMs?: number;
        /**
         * Timeout in milliseconds for outbound webhook HTTP requests.
         * Defaults to 10000.
         * @visibility backend
         */
        requestTimeoutMs?: number;
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
      scheduling?: {
        /**
         * Whether the scheduled webhook scan worker starts on backend boot.
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
