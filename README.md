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

The dashboard refresh workflow reads public GitHub metadata and writes a timestamped, pre-rendered
scheduled evidence snapshot that remains complete without JavaScript. Each card exposes its evidence
state, source run, commit, and verification record. It does not claim private adoption, production
usage, or organizational outcomes that cannot be independently verified. See the
[Portfolio Evidence Standard](docs/PORTFOLIO_EVIDENCE_STANDARD.md).

`site/data/portfolio.json` in this checkout is a committed seed snapshot for local rendering
and testing, not the live evidence record. The scheduled workflow regenerates the deployed
version on GitHub Pages; check `generatedAt` in the deployed file, not this one, for current
freshness.

![Portfolio dashboard overview](site/assets/dashboard-overview.png)
