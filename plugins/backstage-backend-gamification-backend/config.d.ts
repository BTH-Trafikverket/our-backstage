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
  };
}
