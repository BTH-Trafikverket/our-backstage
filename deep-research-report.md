# Backstage Gamification Plugin Pre-Production Security and Architecture Review

## Executive summary

This review covers the **frontend** (`plugins/gamification`) and **backend** (`plugins/gamification-backend`) parts of your custom Backstage **gamification** plugin, including routes, auth, permissions posture, config, outbound requests, DB schema/migrations/triggers, and UI data flows.

The codebase shows several strong implementation choices: backend route handlers often validate payloads with schemas (for example quests/badges/webhooks creation/edit flows), database access is encapsulated in repositories with pagination clamps in multiple places, and event idempotency/concurrency is considered (Postgres advisory locks; dedup receipts). fileciteturn30file0L1-L1

That said, there are several **pre-production blocking risks**, primarily:

- **Unauthorized badge image upload / retrieval endpoints** (missing admin checks; likely callable by any authenticated principal, possibly by anyone depending on global auth policy). fileciteturn22file0L1-L1  
- **Outbound webhook delivery is SSRF-prone and operationally fragile** (arbitrary URLs, no allowlist, no timeouts; and webhook deliveries happen while holding a DB transaction; plus a scan runs during startup). fileciteturn40file0L1-L1 fileciteturn39file0L1-L1 fileciteturn78file0L1-L1  
- **Secrets / insecure defaults committed in config** (static token literal, dev auth/guest config, seeds enabled). At minimum this requires cleanup and strong separation of dev vs prod config. fileciteturn27file0L1-L1  

There are also notable **Backstage-specific design gaps**: the plugin largely implements authorization through **custom group checks** rather than integrating with the **Backstage permissions framework** (`coreServices.permissions`), despite global permissions being enabled. fileciteturn52file0L1-L1 fileciteturn78file0L1-L1 citeturn0search3turn0search5turn0search8

## Top 10 highest priority findings

1. **Badge image upload/list endpoints missing admin/server-side authorization** → unauthorized content injection + DoS risk. fileciteturn22file0L1-L1  
2. **Webhook delivery SSRF + no timeouts / redirect controls** → internal network access + hanging requests. fileciteturn40file0L1-L1 fileciteturn63file0L1-L1  
3. **Webhook execution holds DB transaction open across network call** → DB pool exhaustion/lock contention + cascading latency. fileciteturn39file0L1-L1  
4. **Scheduled webhook scan runs during backend plugin startup** → slow/failed startups when remote endpoints are slow/unreachable. fileciteturn78file0L1-L1  
5. **Hardcoded static external access token + risky dev auth config committed** → credential leakage / accidental prod exposure. fileciteturn27file0L1-L1  
6. **XP endpoint allows arbitrary `subjectRef` without ownership scoping** → unintended data exposure / user enumeration. fileciteturn50file0L1-L1  
7. **Authorization model bypasses Backstage permissions framework** → inconsistent policy enforcement; hard to evolve RBAC/ABAC. fileciteturn52file0L1-L1 citeturn0search3turn0search5  
8. **OpenAPI contract drift vs implementation** (missing endpoints; inconsistent pagination limits) → security review blind spots + client/server mismatch. fileciteturn28file0L1-L1 fileciteturn22file0L1-L1 fileciteturn51file0L1-L1  
9. **Frontend uses `dangerouslySetInnerHTML` with Highlight.js** → potential XSS if a parsing bug/vuln is hit or assumptions change. fileciteturn73file0L1-L1  
10. **Catalog-based actor resolution does multiple sequential entity searches** → avoidable latency and potential event-ingest bottleneck. fileciteturn29file0L1-L1  

## Findings by category

### Security issues

#### Badge image upload and listing endpoints lack admin enforcement

**Category:** Security (AuthZ / data integrity)  
**Severity:** Critical  
**Confidence:** High  
**Affected files/components:**  
- `plugins/gamification-backend/src/routes/badgesRouter.ts` (`POST /badges/badge-images`, `GET /badges/badge-images`) fileciteturn22file0L1-L1  
- `plugins/gamification/src/components/BadgesPage/BadgeFormDialog.tsx` (client upload/list usage) fileciteturn71file0L1-L1  

**Why it is a problem**  
The router protects most badge-management routes using `requireAdminCredentials`, but the **image upload** and **image listing** routes do **not** call `requireAdminCredentials` nor do they explicitly extract/validate credentials for request-level enforcement. fileciteturn22file0L1-L1  
Even if your global backend auth policy requires authentication by default (Backstage can enforce default auth policies at the router layer), these endpoints still appear callable by **any authenticated user/service**, and they are not tied to the plugin’s admin policy. citeturn0search1turn0search6

**Realistic impact / exploit scenario**  
- Any logged-in developer could upload arbitrary images, materially altering UI content for all users.  
- A malicious actor could upload many images to bloat the DB and increase response sizes (particularly because images are stored/returned as data URLs).  
- If service tokens are present/weak (see static tokens below), this becomes even easier to automate at scale. fileciteturn27file0L1-L1  

**Evidence from the code**  
The `POST /badge-images` handler performs only minimal checks (`mimetype.startsWith('image/')`) and then inserts the processed base64 image—without any admin guard. fileciteturn22file0L1-L1  

**Recommended fix**  
- Require admin creds for **both** `POST /badges/badge-images` and `GET /badges/badge-images`. Minimum: call `await requireAdminCredentials(req)` at the start of those handlers.  
- Additionally, consider whether non-admins should ever fetch the entire image catalog. If yes, restrict to “published/approved” images and do not return the raw image blob to everyone.

**Quick win or larger refactor?** Quick win (route guard changes).

#### File upload DoS and unsafe file-type trust in badge image upload

**Category:** Security (DoS, file handling)  
**Severity:** High  
**Confidence:** High  
**Affected files/components:**  
- `plugins/gamification-backend/src/routes/badgesRouter.ts` (Multer config; upload route) fileciteturn22file0L1-L1  
- `plugins/gamification-backend/src/services/imageService.ts` (Sharp processing) fileciteturn43file0L1-L1  
- `plugins/gamification-backend/src/repositories/badgesRepository.ts` (DB storage of image) fileciteturn36file0L1-L1  

**Why it is a problem**  
- `multer()` is used with defaults (memory storage, no limits), so a large upload can consume RAM. fileciteturn22file0L1-L1  
- MIME type checks rely on `req.file.mimetype`, which is client-controlled and not sufficient to ensure content is actually an image. fileciteturn22file0L1-L1  
- Even after resizing, `sharp(fileBuffer)` must decode the original input; crafted images (or very large images) can still be CPU/memory amplifiers. fileciteturn43file0L1-L1  
- Images are stored as a full `data:image/webp;base64,...` string in the database and returned to clients, magnifying bandwidth/DB cost. fileciteturn43file0L1-L1 fileciteturn36file0L1-L1  

**Realistic impact / exploit scenario**  
Attacker uploads a “decompression bomb”-style file or just multiple multi-MB images. The backend process spikes CPU/RAM during decode/convert, and the stored base64 blobs expand DB size and increase response payload sizes.

**Recommended fix**  
- Configure Multer limits (file size; possibly field count) and reject anything beyond a strict ceiling.  
- Validate actual image type by signature (magic bytes) and/or by letting Sharp determine metadata and rejecting unsupported inputs early.  
- Introduce request timeouts/limits and consider moving image processing off the request path if you anticipate frequent uploads.  
- Store images in object storage, serve via CDN, and persist only references/IDs (see architectural section).

**Quick win or larger refactor?** Quick win for size limits + auth; larger refactor for storage redesign.

#### XP endpoint missing ownership/tenant scoping for `subjectRef`

**Category:** Security (AuthZ / data exposure)  
**Severity:** High  
**Confidence:** High  
**Affected files/components:**  
- `plugins/gamification-backend/src/routes/xpRouter.ts` fileciteturn50file0L1-L1  
- `plugins/gamification/src/components/EntityXpCard/EntityXpCard.tsx` fileciteturn76file0L1-L1  

**Why it is a problem**  
`GET /xp` accepts `subjectRef` and, when provided, uses it directly without checking that the authenticated user is allowed to view that subject’s XP. fileciteturn50file0L1-L1  
In contrast, your badge progress endpoint explicitly restricts subject refs to the current user and their ownership groups when `subjectRef` is provided. fileciteturn22file0L1-L1

**Realistic impact / exploit scenario**  
A non-admin user can query XP for other users/teams by passing `subjectRef=user:default/someone` or `group:default/some-team`, enabling org-wide XP enumeration. Depending on what XP represents internally (performance, participation, hidden achievements), this can become a privacy concern. fileciteturn50file0L1-L1

**Recommended fix**  
Mirror the `/badges/progress` enforcement pattern for `/xp`:
- For user principals: allow only `principal.userEntityRef` and `ownershipEntityRefs` (or only self if that’s the desired model).  
- For service principals: require explicit allowlisting (per-caller) if arbitrary subject lookup is not intended.

**Quick win or larger refactor?** Quick win (add a subjectRef authorization guard).

#### Webhook delivery enables SSRF and lacks outbound network controls

**Category:** Security (SSRF / network boundary)  
**Severity:** Critical  
**Confidence:** High  
**Affected files/components:**  
- `plugins/gamification-backend/src/services/webhookDeliveryService.ts` fileciteturn40file0L1-L1  
- `plugins/gamification-backend/migrations/017_create_webhooks_table.ts` (URL stored as text) fileciteturn63file0L1-L1  
- `plugins/gamification/src/components/AdminPage/AdminPage.tsx` (admin creates arbitrary URLs) fileciteturn72file0L1-L1  

**Why it is a problem**  
`WebhookDeliveryService` calls `fetch(webhook.url, …)` directly with no validation/allowlist, no timeouts, and no redirect policy controls. fileciteturn40file0L1-L1  
This is a textbook SSRF long-tail risk: even if only admins can create webhooks, SSRF is commonly exploited via compromised admin accounts, misconfigurations, or “benign” webhooks that later become dangerous.

**Realistic impact / exploit scenario**  
- Exfiltrate cloud instance metadata by targeting link-local metadata endpoints.  
- Reach internal services not exposed publicly (e.g., internal CI/CD, vault-ish endpoints) from the Backstage backend network.  
- Use redirects to bypass naive allowlists (if later introduced without redirect controls).

**Recommended fix**  
- Implement a strict outbound allowlist (hosts/domains + scheme `https:` only).  
- Block private address ranges and link-local explicitly.  
- Enforce `fetch` timeouts using `AbortController`, set a small `redirect` policy (e.g., `redirect: 'error'` or limited), and add bounded retries (with exponential backoff) for transient failures.  
- Consider signing webhook payloads (HMAC) if receivers need integrity.

**Quick win or larger refactor?** Medium refactor (introduce an outbound HTTP client wrapper used everywhere).

#### Custom authorization approach bypasses Backstage permission framework

**Category:** Security / design (Backstage permissions integration)  
**Severity:** High  
**Confidence:** High  
**Affected files/components:**  
- `plugins/gamification-backend/src/routes/adminAccess.ts` (group membership check) fileciteturn52file0L1-L1  
- `plugins/gamification-backend/config.d.ts` (admin groups config expectation) fileciteturn26file0L1-L1  
- `plugins/gamification-backend/src/plugin.ts` (no `coreServices.permissions` usage) fileciteturn78file0L1-L1  

**Why it is a problem**  
The plugin implements admin authorization via a static config list (`gamification.admin.groups`) checked against `UserInfoService` ownership refs. fileciteturn52file0L1-L1  
This works functionally, but it does not integrate with the Backstage permissions framework, which is designed to allow consistent policy enforcement (RBAC/ABAC) across plugins and to support server-side checks for both UI-driven and direct backend calls. citeturn0search3turn0search5turn0search8  
This is especially relevant because permissions are enabled in your app config. fileciteturn27file0L1-L1

**Realistic impact / failure scenario**  
- Your org may assume permissions can be managed centrally; this plugin remains “exception-based” and risks drift (e.g., admin groups renamed in catalog; policy changes not reflected).  
- In audits, it is harder to demonstrate consistent authorization decisions across Backstage.

**Recommended fix**  
- Define plugin permissions (e.g., `gamification.badges.manage`, `gamification.quests.manage`, `gamification.webhooks.manage`) and enforce them server-side with `coreServices.permissions.authorize(...)` using request credentials. citeturn0search3turn0search8  
- Keep `gamification.admin.groups` only as a backwards-compat layer if needed, or convert it into a policy configuration input.

**Quick win or larger refactor?** Larger refactor (introducing permission types + policy integration), but can be staged endpoint-by-endpoint.

#### Risky / credential-like values committed in `app-config.yaml`

**Category:** Security (secrets, auth misconfiguration)  
**Severity:** Critical  
**Confidence:** High  
**Affected files/components:**  
- `app-config.yaml` fileciteturn27file0L1-L1  

**Why it is a problem**  
The config file includes a literal static token value (`token: testing123`) under `backend.auth.externalAccess`, and also includes a development/guest auth configuration with admin-group ownership refs. fileciteturn27file0L1-L1  
Even if this is “just dev”, committing real-looking tokens normalizes bad practice and is a common source of accidental prod exposure (copy/paste deploys, env miswiring, staging configs). fileciteturn27file0L1-L1

**Realistic impact / exploit scenario**  
- If a deployment accidentally uses this config, an attacker who learns/guesses the static token can call allowed service endpoints.  
- Misuse of guest provider settings can accidentally grant elevated access.

**Recommended fix**  
- Remove literal token values from repo history and require all tokens via secrets manager/env vars.  
- Split config into `app-config.local.yaml` (dev only, gitignored) vs `app-config.production.yaml` (no dev providers, no static tokens).  
- Validate at startup: fail fast if `auth.environment: development` or guest provider is enabled in non-dev environments.

**Quick win or larger refactor?** Quick win (config hygiene), plus an ops guardrail.

### Performance issues

#### Scheduled webhooks run serially and hold DB transactions during outbound requests

**Category:** Performance + reliability  
**Severity:** High  
**Confidence:** High  
**Affected files/components:**  
- `plugins/gamification-backend/src/services/scheduledWebhooksService.ts` fileciteturn39file0L1-L1  
- `plugins/gamification-backend/src/services/webhookDeliveryService.ts` fileciteturn40file0L1-L1  

**Why it is a problem**  
The scheduled scan iterates webhooks sequentially and, in each webhook execution, holds a transaction lock across the network call (`sendWebhook`) and ledger insert. fileciteturn39file0L1-L1  
Because `sendWebhook` has no timeout, a slow receiver can keep DB transactions open for a long time. fileciteturn40file0L1-L1

**Realistic impact / failure scenario**  
- DB connection pool exhaustion during startup or periodic scans.  
- Increased probability of deadlocks/lock waits in other gamification DB operations.  
- Cascading latency to normal API endpoints if DB connections are monopolized.

**Recommended fix**  
- Don’t hold a transaction across the network call. Record an “execution intent” (or lease) first, commit, then deliver, then record success/failure in a separate update—accepting **at-least-once** semantics and handling retriable failures.  
- Add timeouts and (bounded) retries with backoff.  
- Add concurrency limits (e.g., deliver N webhooks at a time, not all).

**Quick win or larger refactor?** Larger refactor (execution model), quick win for adding timeouts + concurrency caps.

#### Badge images are base64 blobs returned to the UI and fetched repeatedly

**Category:** Performance (payload size, repeated fetch)  
**Severity:** High  
**Confidence:** High  
**Affected files/components:**  
- `plugins/gamification-backend/src/repositories/badgesRepository.ts` (`getBadgeImages` returns `id,image`) fileciteturn36file0L1-L1  
- `plugins/gamification/src/components/BadgesPage/BadgesPage.tsx` (fetches images) fileciteturn70file0L1-L1  
- `plugins/gamification/src/components/BadgesPage/BadgeFormDialog.tsx` (fetches images again) fileciteturn71file0L1-L1  
- `plugins/gamification-backend/src/services/imageService.ts` (data URL format) fileciteturn43file0L1-L1  

**Why it is a problem**  
Fetching full base64 data URLs for all badge images inflates payload size and forces the browser to parse/render these repeatedly. The same images list is loaded in multiple components without any shared cache or ETag-based caching strategy. fileciteturn70file0L1-L1 fileciteturn71file0L1-L1

**Realistic impact / failure scenario**  
- Slow page loads for badges/admin pages, increased memory usage in the browser.  
- Backend bandwidth spikes when many users open the plugin.

**Recommended fix**  
- Serve images via a dedicated static endpoint that returns an `image/webp` response (not base64 JSON) and supports caching headers.  
- Cache image metadata in the frontend (Backstage has patterns for shared API clients / react-query-like caching depending on your stack).  
- Store images outside Postgres if they grow (object store).

**Quick win or larger refactor?** Medium refactor (API change), but immediate quick win is caching + pagination for image listing.

#### Actor resolution does sequential Catalog queries per event

**Category:** Performance  
**Severity:** Medium  
**Confidence:** High  
**Affected files/components:**  
- `plugins/gamification-backend/src/services/questsService.ts` fileciteturn29file0L1-L1  

**Why it is a problem**  
`getFirstMatchingUserRef` iterates through candidate filters and performs `catalogClient.getEntities(...)` sequentially until a match is found. fileciteturn29file0L1-L1  
If actor resolution provider config includes multiple annotations (or if there are multiple resolution strategies like id/login/email attempts), this becomes an avoidable latency multiplier on event ingestion.

**Realistic impact / failure scenario**  
A burst of external quest events (CI, GitHub, etc.) produces an N× latency increase and can overwhelm catalog backend or your gamification service throughput.

**Recommended fix**  
- Batch the resolution query where possible (one catalog query with multiple OR-like filters if supported), or parallelize a bounded number of attempts with cancellation once one is found.  
- Cache actor→entityRef mappings with TTL (be careful with revocations).

**Quick win or larger refactor?** Medium refactor.

### Design and architecture anti-patterns

#### Authorization is “group list in config” rather than “permissions as product surface area”

**Category:** Design/architecture (Backstage-specific)  
**Severity:** Medium  
**Confidence:** High  
**Affected files/components:** `adminAccess.ts`, backend plugin registration, app config fileciteturn52file0L1-L1 fileciteturn78file0L1-L1 fileciteturn27file0L1-L1  

**Why it is a problem**  
As the plugin grows (more actions, more resources), a single “admin group list” becomes brittle and pushes policy into app-config rather than into the Backstage permissions model. Backstage provides standardized integration points for this. citeturn0search3turn0search5turn0search8

**Impact**  
Harder to scale authorization decisions (e.g., team-specific badge management, delegated webhook management, read-only admins).

**Recommended fix**  
Introduce explicit permissions and enforce them server-side; keep config-based groups as an initial policy mechanism if needed (but behind a permissions policy implementation).

**Quick win or larger refactor?** Larger refactor.

#### OpenAPI spec drift creates contract ambiguity and “shadow endpoints”

**Category:** Design/maintainability  
**Severity:** Medium  
**Confidence:** High  
**Affected files/components:**  
- `plugins/gamification-backend/src/schema/openapi.yaml` fileciteturn28file0L1-L1  
- `badgesRouter.ts` (badge-images endpoints) fileciteturn22file0L1-L1  
- `questsRouter.ts` (test endpoints) fileciteturn51file0L1-L1  

**Why it is a problem**  
Your OpenAPI contract documents core endpoints but does not cover `POST/GET /badges/badge-images` or `/quests/test/*`. fileciteturn28file0L1-L1 fileciteturn22file0L1-L1 fileciteturn51file0L1-L1  
This makes security review and client generation incomplete and undermines “contract as source of truth”.

**Recommended fix**  
- Add missing endpoints to OpenAPI (or remove/feature-flag them in production).  
- Add CI checks that compare router surface area vs contract (or generate routers/clients from the contract).

**Quick win or larger refactor?** Quick win to document/remove endpoints; larger refactor for contract-driven tooling.

### Reliability and operational risks

#### Startup behavior couples availability to third-party webhook endpoints

**Category:** Reliability / ops  
**Severity:** High  
**Confidence:** High  
**Affected files/components:**  
- `plugins/gamification-backend/src/plugin.ts` (startup scan) fileciteturn78file0L1-L1  
- `ScheduledWebhooksService`, `WebhookDeliveryService` fileciteturn39file0L1-L1 fileciteturn40file0L1-L1  

**Why it is a problem**  
The backend plugin runs `scanAndRunScheduledWebhooks()` during initialization. fileciteturn78file0L1-L1  
If any configured scheduled webhook receiver is down or slow, startup can be delayed or fail (depending on error surfaces and global init behavior). The delivery uses `fetch` with no timeout, making “hang forever” plausible. fileciteturn40file0L1-L1

**Realistic impact / failure scenario**  
A transient outage in an internal webhook receiver causes a Backstage rollout to stall or increases cold-start times dramatically.

**Recommended fix**  
- Move scheduled execution to a background task runner (Backstage has patterns for scheduled/backstage-managed tasks), not startup init.  
- Ensure startup does not block on best-effort work.  
- Add timeouts and record failures without blocking overall plugin readiness.

**Quick win or larger refactor?** Larger refactor (job execution model); quick win (timeouts + “do not block startup”).

#### Seed execution enabled in config and can delete production data if misused

**Category:** Reliability / operational safety  
**Severity:** High  
**Confidence:** High  
**Affected files/components:**  
- `app-config.yaml` (`gamification.seed.enabled: true`) fileciteturn27file0L1-L1  
- `plugins/gamification-backend/src/plugin.ts` (seed execution rules) fileciteturn78file0L1-L1  
- `plugins/gamification-backend/src/seed.ts` (deletes data when reset) fileciteturn47file0L1-L1  

**Why it is a problem**  
Seeds are powerful and include delete operations across multiple gamification tables when `reset` is enabled. fileciteturn47file0L1-L1  
While production seeding is guarded by an env var, the default config explicitly enables seeds, increasing the chance of misdeployment. fileciteturn27file0L1-L1 fileciteturn78file0L1-L1  

**Recommended fix**  
- Ensure seeds are disabled in any non-local config and enforce “hard fail” if `seed.enabled=true` in production.  
- If seeds are needed for staging, require an explicit “I understand” guard (env var + config, plus logging).

**Quick win or larger refactor?** Quick win.

### Maintainability problems

#### Frontend pagination contract mismatch (`pages` vs `totalPages`) and aggressive multi-page fetching

**Category:** Maintainability + performance  
**Severity:** Medium  
**Confidence:** High  
**Affected files/components:**  
- `plugins/gamification/src/components/EntityBadgesCard/EntityBadgesCard.tsx` fileciteturn77file0L1-L1  
- Backend pagination field naming in repos (uses `totalPages`) fileciteturn36file0L1-L1 fileciteturn30file0L1-L1  

**Why it is a problem**  
The card expects `pagination.pages`, but backend pagination objects consistently use `totalPages`. fileciteturn77file0L1-L1 fileciteturn36file0L1-L1  
This likely causes it to never fetch beyond the first page (or to behave inconsistently). Additionally, it tries to fetch all remaining pages concurrently via `Promise.all`, which can amplify load if page counts increase. fileciteturn77file0L1-L1

**Recommended fix**  
- Align the type with backend reality (`totalPages`).  
- Consider fetching only the first page for a card UI (it’s a small widget), or cap additional pages to a small number.

**Quick win or larger refactor?** Quick win.

#### Unhandled async errors in badge image upload UI path

**Category:** Maintainability / reliability (frontend)  
**Severity:** Medium  
**Confidence:** High  
**Affected files/components:**  
- `plugins/gamification/src/components/BadgesPage/BadgeFormDialog.tsx` fileciteturn71file0L1-L1  

**Why it is a problem**  
The file input `onChange` triggers an async `handleFileUpload(file)` without awaiting or catching errors. If upload fails, it can become an unhandled promise rejection and provide poor UX / confusing state. fileciteturn71file0L1-L1

**Recommended fix**  
- Wrap upload in `try/catch`, show an inline `Alert`, and disable the dialog submit while upload is in progress.  
- Clear file input value after completion to support re-uploading the same file.

**Quick win or larger refactor?** Quick win.

#### Use of `dangerouslySetInnerHTML` with Highlight.js

**Category:** Maintainability + security  
**Severity:** Medium  
**Confidence:** Medium  
**Affected files/components:**  
- `plugins/gamification/src/components/AdminPage/JsonHighlight.tsx` fileciteturn73file0L1-L1  

**Why it is a problem**  
`dangerouslySetInnerHTML` is a persistent footgun. Today you highlight JSON strings (which *should* be escaped by Highlight.js), but future changes (different language, different highlight path, or a dependency regression) can turn this into an XSS vector. fileciteturn73file0L1-L1  

**Recommended fix**  
- Prefer a safe highlighter that returns React elements or explicitly escape before injection.  
- If you keep it, lock Highlight.js versions tightly and add a regression test that proves `<script>`-like payloads do not execute/render as HTML.

**Quick win or larger refactor?** Quick win (component swap) to medium (if replacing lib).

### Dependency and supply-chain risks

#### Risk concentration in high-impact libraries and lack of explicit security controls around them

**Category:** Supply chain / dependency risk  
**Severity:** Medium  
**Confidence:** Medium  
**Affected files/components:**  
- Backend deps: `multer`, `sharp`, `express` fileciteturn23file0L1-L1  
- Frontend deps: `highlight.js` fileciteturn24file0L1-L1  

**Why it is a problem**  
These libraries sit on risk-heavy paths:
- `multer` handles uploads (common CVE surface).  
- `sharp` decodes complex image formats (historically sensitive surface).  
- `highlight.js` has had past parsing/regex issues; and you inject its output into DOM. fileciteturn73file0L1-L1  

**Recommended fix**  
- Add automated dependency scanning in CI (SCA) and enforce security upgrades.  
- Pin/verify lockfile integrity; ensure `yarn.lock` is reviewed like code.  
- Add runtime limits around these libraries (upload caps, timeouts, etc.) so a dependency bug is less catastrophic.

**Quick win or larger refactor?** Quick win (CI + policy) plus targeted code hardening.

## Quick wins

These are changes that are both high-impact and relatively low-effort.

- **Protect badge image routes** with admin enforcement (and likely auth extraction) before processing uploads or returning stored images. fileciteturn22file0L1-L1  
- **Add upload limits** to Multer (max file size, max files) and enforce real file type checks before calling Sharp. fileciteturn22file0L1-L1 fileciteturn43file0L1-L1  
- **Add subjectRef authorization checks to `/xp`** (match the model used in `/badges/progress`). fileciteturn50file0L1-L1 fileciteturn22file0L1-L1  
- **Harden webhook delivery**: add `AbortController` timeout, restrict redirects, and validate URL (scheme + host allowlist). fileciteturn40file0L1-L1  
- **Remove committed token literals and dev-only auth config from tracked config**; enforce environment-specific config separation. fileciteturn27file0L1-L1  
- **Fix frontend pagination mismatch** (`pages` → `totalPages`) in `EntityBadgesCard`. fileciteturn77file0L1-L1  
- **Catch async upload errors in the UI** and show a user-facing error state. fileciteturn71file0L1-L1  
- **Document or remove “test” routes** (`/quests/test/*`) for production builds; gate behind `NODE_ENV !== 'production'` at route registration if needed. fileciteturn51file0L1-L1  

## Larger architectural improvements

These changes address root causes and make the plugin easier to secure and operate as it grows.

- **Adopt the Backstage permissions framework end-to-end** for manage/create/update operations instead of a config-only group check. This aligns plugin auth with org-wide policy and scales to resource-scoped permissions. citeturn0search3turn0search5turn0search8  
- **Redesign scheduled webhook execution**:
  - Do not run deliveries at startup. fileciteturn78file0L1-L1  
  - Use a background scheduler/worker model with bounded concurrency and robust retry semantics.  
  - Avoid holding DB transactions across network calls. fileciteturn39file0L1-L1  
- **Introduce a centralized outbound HTTP client service** for the plugin (and reuse across features), implementing:
  - allowlist + denylist (private ranges),  
  - timeouts + retry/backoff,  
  - structured logging/metrics. fileciteturn40file0L1-L1  
- **Move badge images out of Postgres blobs**:
  - Store as objects (S3/GCS/etc) and persist URL/ID only,  
  - Serve via cached static endpoints,  
  - Enforce a lifecycle policy (cleanup unused images). fileciteturn36file0L1-L1  
- **Contract-driven development for your API**:
  - Treat OpenAPI as the source of truth; generate types/clients from it,  
  - Ensure endpoints implemented match the spec, avoiding “shadow endpoints”. fileciteturn28file0L1-L1  

## Review coverage checklist

### Reviewed from the repository

Backend:
- Router composition and API surface (`createRouter`, route modules). fileciteturn49file0L1-L1  
- Auth patterns: `httpAuth.credentials`, service vs user principal flows, admin gating behavior. fileciteturn52file0L1-L1 fileciteturn51file0L1-L1 citeturn0search6turn0search0  
- Config schema and actual app config values (including risky settings). fileciteturn26file0L1-L1 fileciteturn27file0L1-L1  
- Webhook delivery and scheduled execution model, including startup behavior. fileciteturn78file0L1-L1 fileciteturn39file0L1-L1 fileciteturn40file0L1-L1  
- Data model and migrations/triggers (XP awards, badge triggers, subject xp state). fileciteturn55file0L1-L1 fileciteturn61file0L1-L1 fileciteturn57file0L1-L1  

Frontend:
- Route gating and admin status flow. fileciteturn67file0L1-L1  
- Data fetching patterns, pagination handling, and repeated fetching of images. fileciteturn70file0L1-L1 fileciteturn71file0L1-L1 fileciteturn77file0L1-L1  
- `dangerouslySetInnerHTML` usage and potential XSS surfaces. fileciteturn73file0L1-L1  

Dependencies:
- Plugin and root `package.json` for key high-risk deps and runtime environment. fileciteturn23file0L1-L1 fileciteturn24file0L1-L1 fileciteturn25file0L1-L1  

### Could not be verified from code alone

- Whether `backend.auth.dangerouslyDisableDefaultAuthPolicy` is set anywhere outside `app-config.yaml` (this materially changes whether unauthenticated users can hit endpoints that do not call `httpAuth.credentials`). citeturn0search1  
- Network egress controls in your runtime (Kubernetes NetworkPolicies, outbound proxies, VPC egress rules) that might mitigate SSRF impact.  
- Who can edit `User` and `Group` entities in your catalog (impacts the trustworthiness of ownership refs used for admin checks). fileciteturn52file0L1-L1 citeturn0search7  
- Secret management posture (whether `${…}` values are sourced from a secrets manager; whether git history contains leaked secrets). fileciteturn27file0L1-L1  
- Actual operational load (number of users, size of `xp_awards`, number of webhooks) and DB performance characteristics.

## Open questions and manual validation items

- **Is the badge image API intended to be admin-only?** If yes, treat the missing admin guard as a release blocker and patch immediately. fileciteturn22file0L1-L1  
- **What is your intended privacy model for XP?** If XP is meant to be public (leaderboard-like), you may accept broader access; but right now `/xp` is “implicitly public” while `/badges/progress` is scoped—those should be made consistent. fileciteturn50file0L1-L1 fileciteturn22file0L1-L1  
- **Do you need webhook URLs to target internal services?** If yes, you still need SSRF controls (explicit allowlists + strong authentication to those internal receivers) rather than “anything goes.” fileciteturn40file0L1-L1  
- **Confirm production config management**: ensure `app-config.yaml` committed values are not used for prod, and ensure no literal secrets have been committed historically. fileciteturn27file0L1-L1  
- **Decide whether “test endpoints” should ship**: if not, remove or hard-gate them; if yes, document them in OpenAPI and apply the same security hardening standards. fileciteturn51file0L1-L1 fileciteturn28file0L1-L1