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
    quests?: {
      /**
       * Service principal subjects that are allowed to post quest events.
       * Example: ["external:default/github-actions"]
       * @visibility backend
       */
      allowedCallers?: string[];
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
