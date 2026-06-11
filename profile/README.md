# QA Test Automation Frameworks

![Portfolio dashboard overview](../site/assets/dashboard-overview.png)

Public reference implementations for browser, API, accessibility, visual, and
performance-test engineering. The repositories emphasize reproducible
execution, explicit trade-offs, failure evidence, and measurable CI behavior.

[Portfolio dashboard](https://qa-test-automation-frameworks.github.io/.github/)
· [LinkedIn](https://www.linkedin.com/in/prayag-vyas/)

## Recommended review order

| Order | Repository | Why start here | Review time |
| ---: | --- | --- | ---: |
| 1 | [Portfolio dashboard](https://qa-test-automation-frameworks.github.io/.github/) | Current status, runtime, releases, activity, and evidence links | 3 min |
| 2 | [Playwright TypeScript](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework) | Broadest test strategy: API, UI, visual, accessibility, contracts, and browser matrix | 12 min |
| 3 | [ARIA API](https://github.com/qa-test-automation-frameworks/aria-api-framework) | Deterministic API fixtures, contracts, schema checks, diagnostics, and security boundaries | 10 min |
| 4 | [Selenium TestNG Java](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework) | Java browser framework design, Grid execution, diagnostics, and parallel lifecycle | 10 min |

## Repository matrix

| Repository | Primary proof | CI | Report | Release | Docs and assets |
| --- | --- | --- | --- | --- | --- |
| [Playwright TypeScript](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework) | Hybrid API/UI strategy with visual and Axe coverage | [![CI](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework/actions/workflows/ci.yml/badge.svg)](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework/actions/workflows/ci.yml) | [Allure](https://qa-test-automation-frameworks.github.io/playwright-typescript-framework/) | [Releases](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework/releases) | [Review guide](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework/blob/main/docs/portfolio-review-guide.md) |
| [ARIA API](https://github.com/qa-test-automation-frameworks/aria-api-framework) | Layered clients, owned provider, Pact, OpenAPI, and redacted diagnostics | [![CI](https://github.com/qa-test-automation-frameworks/aria-api-framework/actions/workflows/ci.yml/badge.svg)](https://github.com/qa-test-automation-frameworks/aria-api-framework/actions/workflows/ci.yml) | [Allure](https://qa-test-automation-frameworks.github.io/aria-api-framework/) | [Releases](https://github.com/qa-test-automation-frameworks/aria-api-framework/releases) | [Review guide](https://github.com/qa-test-automation-frameworks/aria-api-framework/blob/main/docs/Portfolio_Review_Guide.md) |
| [Selenium TestNG Java](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework) | Grid browser matrix, typed configuration, parallel drivers, and failure diagnostics | [![CI](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework/actions/workflows/ui-tests.yml/badge.svg?branch=main)](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework/actions/workflows/ui-tests.yml) | [Allure](https://qa-test-automation-frameworks.github.io/selenium-testng-java-framework/) | [Releases](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework/releases) | [Review guide](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework/blob/main/docs/PORTFOLIO_REVIEW_GUIDE.md) |

> **Work in progress:** [`k6-performance-framework`](https://github.com/qa-test-automation-frameworks/k6-performance-framework)
> is public for implementation review, but it is excluded from portfolio scoring
> and recommended review order until its CI, evidence, and first release are complete.

## Platform case study

The [automation platform scaling case study](https://qa-test-automation-frameworks.github.io/.github/#case-study)
uses anonymized professional evidence to explain test-volume growth, feedback-time
constraints, reliability governance, migration, and adoption. Public repository
metrics and professional outcomes are presented separately.

## Review standard

- Claims link to source, CI, releases, reports, or screenshots.
- Runtime and reliability values include a freshness timestamp and sample size.
- Controlled targets are identified as controlled targets; external compatibility
  checks are reported separately.
- Retries, quarantines, and known limitations remain visible.
- Work in progress is not counted as completed portfolio evidence.
