# Organization profile and portfolio dashboard

This repository owns the default community-health files, organization profile,
and generated portfolio dashboard for
[`qa-test-automation-frameworks`](https://github.com/qa-test-automation-frameworks).

## Reviewer proof

| Evidence | Link |
| --- | --- |
| Portfolio dashboard | [Scheduled evidence dashboard](https://qa-test-automation-frameworks.github.io/.github/) |
| Organization profile | [Profile source](profile/README.md) |
| Repository matrix | [Machine-readable source](portfolio/repositories.json) |
| Dashboard assets | [Site source](site) |
| CI | [Dashboard workflow](https://github.com/qa-test-automation-frameworks/.github/actions/workflows/dashboard.yml) |

For a bounded, fresh-clone exercise with an expected negative control and feedback form, see the [independent review packet](docs/PORTFOLIO_INDEPENDENT_REVIEW_PACKET.md). Preparing the packet does not count as an independent review.

The dashboard refresh workflow reads public GitHub metadata and durable evidence records and writes a
timestamped, pre-rendered snapshot that remains complete without JavaScript. It separates execution
from publication, shows the latest attempt and last success, checks source compatibility and declared
freshness, and displays known limitations. It does not claim private adoption, production usage, or
organizational outcomes that cannot be independently verified. See the
[Portfolio Evidence Standard](docs/PORTFOLIO_EVIDENCE_STANDARD.md), the
[runtime policy](docs/runtime-policy.md), the
[durable-publication status](docs/verification/2026-10-16-durable-evidence-publication.md),
and the [dashboard evidence-state and refresh-health notes](docs/verification/2026-10-16-dashboard-evidence-state.md).
The proposed shared reference target is defined in
[ADR 007](docs/adr/007-shared-reference-application.md); it is a design decision,
not a claim that the application or integrations exist yet.

`site/data/portfolio.json` in this checkout is a committed seed snapshot for local rendering
and testing, not the live evidence record. The scheduled workflow regenerates the deployed
version on GitHub Pages; check `generatedAt` in the deployed file, not this one, for current
freshness.

![Portfolio dashboard overview](site/assets/dashboard-overview.png)

## Local first success

Use Node.js 24.21.0 from `.nvmrc` (see the [supported runtime policy](docs/runtime-policy.md)), then run:

```sh
node --test scripts/dashboard.test.mjs scripts/evidence-contract.test.mjs
node scripts/validate-dashboard.mjs
```

These scripts use Node's standard library; no npm install, credentials, network
or browser is needed for this stored-snapshot check. Repeat the same commands
after editing. The committed snapshot may correctly warn that it is stale; this
path checks its contract and fallback, not current live evidence. Refreshing with
`node scripts/refresh-dashboard.mjs` separately needs a read token in GITHUB_TOKEN
and network access. CI selects `.nvmrc`; a stable later Node24 patch/minor is
allowed but not automatically verified. Unsupported runtimes fail before token
or snapshot handling with a setup instruction.

The version3 [evidence contract](docs/PORTFOLIO_EVIDENCE_STANDARD.md) is validated
locally and by the documentation workflow. It separates native execution, artifact
publication and historical attestations. As of 2026-10-16, default-branch durable
publication and retrieved, checksummed bundles are verified for ARIA, K6, Playwright
and Selenium; Verity remains pending because its required security checks are failing.
The dashboard workflow is active, but its two authorized refresh dispatches have
remained queued without jobs. The public snapshot still reports `generatedAt`
2026-09-09T08:59:57.006Z; check the deployed timestamp before relying on its cards.
Synthetic fixtures remain contract controls, not framework execution proof.
