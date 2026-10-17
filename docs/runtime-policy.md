# Runtime policy

This repository is a dependency-free Node.js utility project. Node supplies the
runtime for evidence validation, dashboard rendering, publication tooling and
tests; no npm package installation is required.

## Organization utilities

- `.nvmrc` pins Node.js `24.21.0` for contributors and CI.
- `scripts/check-runtime.mjs` enforces Node major 24 and minimum patch 24.21.0.
- CI setup uses `.nvmrc`; run `node scripts/check-runtime.mjs` before local checks.
- Run the dashboard and publisher tests with `node --test scripts/*.test.mjs`.

This is a deliberate supported-runtime floor, not a claim that 24.21.0 is the
newest Node release. Recheck the official Node.js release schedule when changing
the major line. Do not change the baseline without verifying all workflows,
the validator and published consumers on the proposed runtime.

## Framework runtime matrix

| Repository | Primary runtime | Policy and evidence |
|---|---|---|
| [ARIA API](https://github.com/qa-test-automation-frameworks/aria-api-framework) | Temurin JDK 21; Node 24.21.0 for evidence tooling | [Runtime policy](https://github.com/qa-test-automation-frameworks/aria-api-framework/blob/main/docs/runtime-policy.md) |
| [k6](https://github.com/qa-test-automation-frameworks/k6-performance-framework) | Node 24.21.0/npm 10.9.4; k6 pinned to 2.0.0 | [Runtime policy](https://github.com/qa-test-automation-frameworks/k6-performance-framework/blob/main/docs/runtime-policy.md) |
| [Playwright](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework) | Node 24.21.0/npm 10.9.4 | [Runtime policy](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework/blob/main/docs/configuration-guide.md) |
| [Selenium](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework) | Temurin JDK 21; Node 24.21.0 for evidence tooling | [Runtime policy](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework/blob/main/docs/RUNTIME_POLICY.md) |
| [Verity](https://github.com/qa-test-automation-frameworks/verity-policy-coverage-eval-framework) | Python 3.12.15 and 3.13.16; uv 0.12.23 | [Runtime policy](https://github.com/qa-test-automation-frameworks/verity-policy-coverage-eval-framework/blob/main/docs/runtime-policy.md) |

Framework runtimes are chosen and tested independently of auxiliary evidence
tooling. Newer language releases are not adopted solely because they exist:
add a runtime only after dependency, wheel/browser/driver and CI compatibility
checks pass. Verity's Python 3.14 support remains unclaimed pending a dedicated
compatibility run. Java 21 remains the tested LTS baseline; a newer Java line
requires its own compatibility evidence.

Lifecycle references checked on 2026-10-16: [Node.js release schedule](https://nodejs.org/en/about/previous-releases), [Adoptium Temurin support](https://adoptium.net/support/?jvmVariant=hotspot), [Python downloads](https://www.python.org/downloads/).
