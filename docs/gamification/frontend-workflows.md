# Frontend Workflows

The frontend plugin lives in [plugins/gamification/src](https://github.com/BTH-Trafikverket/our-backstage/tree/main/plugins/gamification/src). The root page is [GamificationPage.tsx](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification/src/components/GamificationPage.tsx), mounted by [plugin.ts](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification/src/plugin.ts).

## Navigation and Access

The root page checks `/quests/admin-status` on load and stores a local `isAdmin` state.

Tabs:

- `Quests` is the default route at `/gamification`.
- `Badges` is available at `/gamification/badges`.
- `Leaderboard` is available at `/gamification/leaderboard`.
- `Test` is available at `/gamification/test`.
- `Webhooks` is only shown when the backend says the user is an admin.

The local preview demo toggle can invert the visible admin/user view outside production. It only changes the UI view and does not bypass backend authorization.

## Backend Calls

Frontend pages use Backstage discovery and fetch APIs:

- `discoveryApi.getBaseUrl('gamification')`
- `fetchApi.fetch(...)`

This pattern is implemented independently in the page components:

- [QuestsPage.tsx](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification/src/components/QuestsPage/QuestsPage.tsx)
- [BadgesPage.tsx](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification/src/components/BadgesPage/BadgesPage.tsx)
- [LeaderboardPage.tsx](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification/src/components/LeaderboardPage/LeaderboardPage.tsx)
- [WebhooksPage.tsx](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification/src/components/WebhooksPage/WebhooksPage.tsx)

Do not hardcode `/api/gamification` in new frontend code.

## Quest Page

Source:

- [QuestsPage.tsx](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification/src/components/QuestsPage/QuestsPage.tsx)
- [QuestToolbar.tsx](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification/src/components/QuestsPage/QuestToolbar.tsx)
- [QuestTable.tsx](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification/src/components/QuestsPage/QuestTable.tsx)
- [QuestFormDialog.tsx](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification/src/components/QuestsPage/QuestFormDialog.tsx)

Admin behavior:

- Loads `/quests`.
- Supports search, audience filter, sort, and pagination.
- Allows quest create, edit, and archive through dialogs.
- Sends create/update payloads built by [QuestsPage utils](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification/src/components/QuestsPage/utils.ts).

User behavior:

- Loads `/quests/me`.
- Supports search, audience filter, status filter, team filter, sort, and pagination.
- Team options come from `identityApi.getBackstageIdentity().ownershipEntityRefs`.
- Users cannot create, edit, or archive quests from this page.

## Badge Page

Source:

- [BadgesPage.tsx](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification/src/components/BadgesPage/BadgesPage.tsx)
- [BadgeToolbar.tsx](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification/src/components/BadgesPage/BadgeToolbar.tsx)
- [BadgeTable.tsx](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification/src/components/BadgesPage/BadgeTable.tsx)
- [BadgeFormDialog.tsx](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification/src/components/BadgesPage/BadgeFormDialog.tsx)

Admin behavior:

- Loads `/badges`.
- Fetches up to 1000 quests from `/quests` so badge criteria can be selected.
- Fetches badge images from `/badges/badge-images`.
- Allows badge create, edit, and archive.
- Filters criteria options by badge subject type.
- Forces `target_count: 1` when a selected criterion quest is `ONE_TIME`.

User behavior:

- Loads `/badges/progress`.
- Supports search, audience filter, status filter, team filter, sort, and pagination.
- Team options come from ownership refs.
- Users can view progress but cannot manage badge definitions.

## Entity Cards

Entity cards expose gamification state on catalog entity pages:

- [EntityXpCard.tsx](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification/src/components/EntityXpCard/EntityXpCard.tsx)
- [EntityBadgesCard.tsx](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification/src/components/EntityBadgesCard/EntityBadgesCard.tsx)
- [EntityPage.tsx](https://github.com/BTH-Trafikverket/our-backstage/blob/main/packages/app/src/components/catalog/EntityPage.tsx)

These cards should stay read-only and rely on backend subject authorization.

## Test Page

[TestPage.tsx](https://github.com/BTH-Trafikverket/our-backstage/blob/main/plugins/gamification/src/components/TestPage/TestPage.tsx) is a non-production support surface. Backend test routes under `/quests/test/*` are only registered when `NODE_ENV !== 'production'`.

Do not document test routes as supported public API.
