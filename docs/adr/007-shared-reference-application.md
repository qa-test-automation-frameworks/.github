# ADR 007: Shared reference application for complementary framework coverage

- Status: Accepted for the portfolio implementation roadmap
- Date: 2026-10-16
- Decision owners: portfolio maintainer
- Scope: the proposed `quality-reference-application` repository and its optional consumers

## Context

The frameworks currently verify different public/demo targets or framework-local targets. That shows breadth, but a reviewer cannot follow one product change across the portfolio. A shared target could show how API, UI, performance, browser-grid, and assistant evaluation relate while preserving each framework's independent purpose.

The existing Playwright controlled target is a useful framework fixture, but it models a RealWorld articles application, keeps state in process memory, and is owned by the Playwright repository. It is not a durable or domain-appropriate product for cross-repository consumers. ARIA targets public APIs, Selenium targets a public demo store through Grid, k6 targets a public API, and Verity evaluates policy/claims questions. None is an existing shared application with persistence and independently specified authorization behavior.

## Options considered

| Option | Benefit | Cost and risk | Decision |
|---|---|---|---|
| Keep only unrelated targets | Maximum framework autonomy; no new product to maintain | Portfolio remains a collection of demonstrations with no shared change story | Rejected as the sole approach; keep these targets as local fixtures and standalone examples |
| Retarget every suite to one shared app | One coherent end-to-end story | Common-mode oracle risk, broad duplicated coverage, synchronized migrations, and loss of useful framework-specific demonstrations | Rejected |
| Shared versioned product plus framework-local fixtures | Demonstrates integration while retaining independent framework depth and migration control | Adds a small product and release process; shared defects can affect integrated suites | **Chosen** |

## Decision

Create a separate, small reference product for fictional policy and claims workflows. It is a versioned integration target, not another automation framework and not a production insurance service. Existing framework targets and local unit tests remain supported. Each consumer opts into a specific immutable application release and can continue to run independently when the shared target is unavailable.

The first slice will let two synthetic members access only their own policies and claims, and let a synthetic reviewer perform a constrained claim-state transition. It will exercise business rules and ownership through a persisted relational model; it will not make real insurance decisions or handle real personal data.

### Implementation boundaries

| Concern | Decision for v0.1 |
|---|---|
| Repository and shape | Separate `quality-reference-application` repository; modular monolith with one API/UI process and one relational datastore |
| Runtime and package manager | TypeScript on Node.js 24 LTS; npm 10.9.4, aligned with the existing Playwright and k6 repositories. The repository must pin both and enforce them before installation. |
| HTTP and validation | Node HTTP server and Zod request validation, following the already maintained controlled-target approach. Keep domain rules independent of HTTP handlers. Reassess only if implementation evidence shows routing complexity warrants a maintained server library. |
| UI | Small accessible semantic HTML/CSS/JavaScript application served by the same process. Do not add a front-end framework for this bounded workflow. |
| Persistence | PostgreSQL 18, accessed through the maintained `pg` client and explicit SQL migrations. PostgreSQL is chosen for transactions, constraints, realistic concurrent access, and clear relational ownership. PostgreSQL 18 is the current supported major line on the ADR date; A01 must select and record its current minor image and exact digest from the official image before implementation is accepted. See the [official version support table](https://www.postgresql.org/support/versioning/). This local/container target is not a distributed scale claim. |
| API evolution | `/api/v1`; additive compatible changes remain in v1. Breaking behavior requires a new version and a compatibility window for pinned consumers. OpenAPI is the published contract and is validated against behavior. |
| Test identities | Explicit seeded identities for member A, member B, and reviewer. In local test mode only, a session endpoint accepts a known identity identifier; the server assigns role and identity. No client-supplied role or production-auth claim. Outside explicit test mode, test-session and test-control routes are disabled. |
| Data isolation and reset | Each consumer job starts its own app and database services with a unique Compose project and isolated database volume. Seed/reset operates only in a dedicated test mode and requires a per-run control token; the service binds to loopback by default. A run can never reset another run's database. |
| Version identity | Releases use immutable source commits and container digests. Consumer configuration pins both the app image digest and seed/fixture version. No consumer silently tracks `latest` or the app's default branch. |
| Readiness and shutdown | `GET /health/ready` returns ready only after database connectivity, migrations, and seed setup complete. SIGTERM closes HTTP and database resources with a bounded timeout. Liveness is not a substitute for readiness. |
| Logs and secrets | Emit structured request metadata and correlation IDs; redact credentials, cookies, tokens, and request bodies. Keep synthetic test secrets in environment injection and never include them in logs, screenshots, or evidence bundles. |
| Schema ownership | The APP repository owns SQL migrations, OpenAPI, seed versions, business rules, and their independent unit/integration tests. Consumers own their expectations and must not import APP assertion code as an oracle. |
| Extension boundary | Framework-specific adapters, evidence emitters, observability collectors, and assistant retrieval remain in their respective repositories. The APP exposes stable HTTP contracts only. |

### Minimal v0.1 API contract

| Action | Route | Required behavior |
|---|---|---|
| Readiness | `GET /health/ready` | Reports readiness only after datastore, migrations, and seed initialization; contains no secret values. |
| Test session | `POST /api/v1/sessions` | In test mode, known synthetic identity creates a server-assigned identity/role session; unknown identity is rejected. Disabled otherwise. |
| Read policy | `GET /api/v1/policies/{id}` | Owner can read; unauthenticated caller receives 401; another member receives the documented non-disclosing denial. |
| Create claim | `POST /api/v1/claims` | Owner can create a claim for their policy; invalid amount/category and another member's policy are rejected. Store money as integer minor units and document currency. |
| Read claim | `GET /api/v1/claims/{id}` | Owner and reviewer can read; unrelated member cannot. Missing-resource status is documented and stable. |
| Reviewer transition | `PATCH /api/v1/claims/{id}` | Reviewer may perform only documented transitions; member role is denied; invalid transition has no persistence side effect. |
| Seed/reset | `POST /__test/seed` and `POST /__test/reset` | Available only in explicit test mode, protected by per-run control token, and restricted to the caller's isolated database/run. Disabled outside test mode. |

Use a stable error envelope with machine-readable `code` and `correlationId`; human-readable message text is diagnostic and not a compatibility key. Initial claim states are `submitted → under_review → approved | rejected`; terminal states cannot return to submitted. Stale updates must fail without overwriting newer state. Every SQL query that addresses run-scoped data must enforce the run namespace at the repository boundary.

### Coverage ownership

| Component | Primary responsibility | Deliberate non-goal |
|---|---|---|
| APP tests | Independent domain, persistence, transaction, transition, and authorization invariants | Duplicating framework-specific browser, load, or assistant checks |
| ARIA | API contract/provider compatibility, error semantics, ownership boundaries, and API resilience | Full UI journeys or all domain unit cases |
| Playwright | Primary UI journey, accessibility, visual behavior, selector contracts, and limited UI/API integration | Repeating the full API matrix owned by ARIA and APP |
| Selenium | One or two JVM/Grid journeys, browser lifecycle, cross-browser behavior, and parallel session isolation | Mirroring the full Playwright suite |
| k6 | Bounded read/write workload, achieved load, latency, error rate, and resource saturation against an owned instance | Load against public targets or treating functional test counts as performance evidence |
| Verity | Optional deterministic retrieval/tool-use integration, citations, tool validation, and cross-member denial; live quality remains a separate calibrated experiment | Becoming a required dependency for the core app or overriding server authorization |

Every integrated job declares app digest, source revision, seed version, browser/profile where applicable, and isolated run identity in its evidence. Consumers keep their original targets and can run standalone. A routine app release is not a coordinated forced migration.

## First vertical slice and sequence

The first implementation increment must demonstrate this complete path twice from a clean checkout: start isolated app and PostgreSQL → wait for readiness → apply versioned seed → create and retrieve a claim as member A → reject member B's read/update attempt → transition the claim as reviewer → verify the persisted state and event/audit metadata → reset only that run → stop cleanly. Independently written app tests must prove invalid transitions and cross-member denial without importing consumer expectations. Then publish an immutable candidate and run one standalone ARIA API pilot and one standalone Playwright UI pilot against that exact candidate; do not wire all five consumers in one migration.

## Risks and controls

| Risk | Control and evidence required |
|---|---|
| Shared target creates a common-mode oracle | APP owns independent invariant tests; consumers write separate expectations; local targets remain usable; deliberate bad app changes must be caught by the intended consumer suite. |
| App release blocks all suites | Consumers pin versions, run standalone, and migrate independently. Preserve at least one prior supported release while consumers move. |
| Reset or identity leakage across workers | Isolated app/DB per job by default, unique run identity, guarded test controls, and a concurrent isolation test. Never expose a reset route on a public shared target. |
| Portfolio overstates product maturity | Label as synthetic reference app; no production scale/security/insurance claims. Publish known limits and supported deployment shape. |
| New stack adds maintenance burden | Reuse Node/TypeScript, npm policy, evidence schema, and existing target patterns; keep the app dependency set small and review upgrades on a defined cadence. |
| Assistant can exceed user permissions | Enforce ownership in APP APIs; assistant receives scoped synthetic identity; deterministic replay and cross-member denial run without provider keys. |
| Database or image pin becomes stale | Select supported image digest at implementation, record update policy, and review upstream security notices as part of R02. |

## Non-goals

No microservices, message bus, Kubernetes, payment processing, real medical/insurance decisions, public user registration, real personal data, production hosting, production authentication claims, or mandatory synchronized migration of all framework repositories. Assistant functionality is optional and must not affect core app operation.

## Consequences and exit review

This decision adds a small independently versioned product and integration environment. It increases maintenance work but enables a reviewer to trace one bounded behavior across complementary tools. The shared app must not inflate framework scores by duplicating checks or hiding unsupported claims.

A00 is ready for closure when this ADR, the contract and coverage map are published and reviewed. It does not claim A01 exists or that any consumer currently targets the app. A01 begins only after E01–E03 and R01–R03 have sufficient verified evidence for the M2 gate; until then, preserve this design and continue prerequisite packages.
