# Release identity and proof draft — 2026-10-22

Draft for review; no new release is selected, created, or published here. The profile and dashboard keep the existing published tags and label those links historical beside an immutable current source proof. Tag targets, current default-branch SHAs, manifests, and hosted check results were read from GitHub on 22 October 2026. Compare links show the source changes since each published tag.

## Current source and release record

### Verity Policy Coverage Eval

- Historical release: [v0.1.0, published 4 July 2026](https://github.com/qa-test-automation-frameworks/verity-policy-coverage-eval-framework/releases/tag/v0.1.0), tag source `94e64e4b66783fa8a2f5a25cd927a050c4c49af0`.
- Current source proof: [`2de24e67d5d2f06b1085243f66765fbbd4cca6cc`](https://github.com/qa-test-automation-frameworks/verity-policy-coverage-eval-framework/commit/2de24e67d5d2f06b1085243f66765fbbd4cca6cc); [changes since v0.1.0](https://github.com/qa-test-automation-frameworks/verity-policy-coverage-eval-framework/compare/v0.1.0...2de24e67d5d2f06b1085243f66765fbbd4cca6cc).
- Runtime and bootstrap: Python `>=3.12,<3.14`; `uv sync --all-extras`. The exact-source Python 3.12 and 3.13 jobs passed in [run 39773047925](https://github.com/qa-test-automation-frameworks/verity-policy-coverage-eval-framework/actions/runs/39773047925); the semantic evaluation job passed in [run 39773048014](https://github.com/qa-test-automation-frameworks/verity-policy-coverage-eval-framework/actions/runs/39773048014).
- Migration note: current source now excludes Python 3.14 until that runtime is tested. The old tag declared Python 3.12 or newer without an upper bound. No public package API migration is claimed here.
- Limits: RAGAS remains optional; independent live calibration with usable quota and held-out labels remains pending. One duplicate report-build check was canceled while a separate report-build run passed.

### Playwright TypeScript

- Historical release: [v1.0.0, published 14 June 2026](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework/releases/tag/v1.0.0), tag source `282577954f392c7c97406f476313523ccae9d56c`.
- Current source proof: [`bef9f91d179ff46aba934b307561a11fd2f660b9`](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework/commit/bef9f91d179ff46aba934b307561a11fd2f660b9); [changes since v1.0.0](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework/compare/v1.0.0...bef9f91d179ff46aba934b307561a11fd2f660b9).
- Runtime and bootstrap: Node `24.21.0`, npm `10.9.4`; `npm ci`. The required hosted CI checks passed on this source in [run 39767567559](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework/actions/runs/39767567559).
- Migration note: v1.0.0 supported Node 20 and npm 10 or newer; current main requires Node 24.21.0 and npm 10.9.4. A release based on current main must call out that runner/toolchain update.
- Limits: automated accessibility checks do not replace screen-reader audio review. The QRA keyboard-journey work in [PR #68](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework/pull/68) is not included in this main-branch proof. Its retry of [run 39779640496](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework/actions/runs/39779640496/job/119866419211) installed dependencies in 10m21s, then failed two injected keyboard-focus controls. A diagnostic-guard fix is on the new PR head and awaits its own CI.

### k6 Performance

- Historical release: [v0.4.0, published 14 June 2026](https://github.com/qa-test-automation-frameworks/k6-performance-framework/releases/tag/v0.4.0), tag source `4659a3426f3175b617416481765a1138a3d69161`.
- Current source proof: [`38bef5b2182a4a73259d943acf79e9df56997bd5`](https://github.com/qa-test-automation-frameworks/k6-performance-framework/commit/38bef5b2182a4a73259d943acf79e9df56997bd5); [changes since v0.4.0](https://github.com/qa-test-automation-frameworks/k6-performance-framework/compare/v0.4.0...38bef5b2182a4a73259d943acf79e9df56997bd5).
- Runtime and bootstrap: Node `24.21.0`, npm `10.9.4`; `npm ci`, then `npm run build`. The hosted quality job passed in [run 39745565357](https://github.com/qa-test-automation-frameworks/k6-performance-framework/actions/runs/39745565357); the exact-source dependency, deploy, and link checks also passed on the commit page.
- Migration note: v0.4.0 allowed Node 20 or newer; current main requires Node 24.21.0 and npm 10.9.4. The current release draft must call out that toolchain update.
- Limits: load profiles and SLOs are bounded to the documented workload and target. Public targets remain read-only; these results do not establish production capacity.

### ARIA API

- Historical release: [v1.0.0, published 9 June 2026](https://github.com/qa-test-automation-frameworks/aria-api-framework/releases/tag/v1.0.0), tag source `40eaa48fbe607a824e604731463cccf003668507`.
- Current source proof: [`103b4f020676e3cb249a0c2c625a63e342654ec4`](https://github.com/qa-test-automation-frameworks/aria-api-framework/commit/103b4f020676e3cb249a0c2c625a63e342654ec4); [changes since v1.0.0](https://github.com/qa-test-automation-frameworks/aria-api-framework/compare/v1.0.0...103b4f020676e3cb249a0c2c625a63e342654ec4).
- Runtime and bootstrap: Java 21; `./gradlew clean test -Denv=dev`. The exact-source quality gate passed in [run 39770712451](https://github.com/qa-test-automation-frameworks/aria-api-framework/actions/runs/39770712451).
- Migration note: Java 21 is unchanged from v1.0.0. The repository’s compatibility experiment records additive and breaking provider cases; no broader provider migration claim is made in this draft.
- Limits: the default deterministic gate does not claim a live public-provider pass. Optional external live smoke remains a separate action.

### Selenium TestNG Java

- Historical release: [v1.0.0, published 9 June 2026](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework/releases/tag/v1.0.0), tag source `f2a4f3a7f6438ce3fb1ee59dfae53a8d7324c16d`.
- Current source proof: [`ab6fe550b1358e5c3e4c3b5b5374135641e92f92`](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework/commit/ab6fe550b1358e5c3e4c3b5b5374135641e92f92); [changes since v1.0.0](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework/compare/v1.0.0...ab6fe550b1358e5c3e4c3b5b5374135641e92f92).
- Runtime and bootstrap: Java 21 with the Maven wrapper; `./mvnw clean verify -Dheadless=true -Dbrowser=CHROME`. Required CI passed in [run 39779409348](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework/actions/runs/39779409348), and the owned-session recovery check passed in [run 39779434408](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework/actions/runs/39779434408).
- Migration note: Java 21 is unchanged from v1.0.0. No public application API migration is applicable to this test framework.
- Limits: browser journeys use vendor-operated Sauce Demo; repository-controlled Grid checks do not make that vendor application a controlled target.

### Quality Reference Application

- Published release: [v0.2.0, published 22 October 2026](https://github.com/qa-test-automation-frameworks/quality-reference-application/releases/tag/v0.2.0), release source `e005b4415865c4029857a1066adf9b0f2474298e`.
- Current source and target proof: [`b1851e0403f6d6a1ce12e9fde5ac5ccb3c634d94`](https://github.com/qa-test-automation-frameworks/quality-reference-application/commit/b1851e0403f6d6a1ce12e9fde5ac5ccb3c634d94) publishes image digest `sha256:ce993056496de8daffdede281e5f0d2bfc54f44f90ba0244edd4d56dde90173c`; [target identity](https://github.com/qa-test-automation-frameworks/quality-reference-application/blob/main/docs/target-identity.md); [changes since v0.2.0](https://github.com/qa-test-automation-frameworks/quality-reference-application/compare/v0.2.0...b1851e0403f6d6a1ce12e9fde5ac5ccb3c634d94).
- Runtime and bootstrap: Node `24.21.0`, npm `10.9.4`, Docker Compose v2; `npm ci`, then `docker compose up --build -d` and `npm run verify`. The exact-source verify and image publication checks passed in [run 39764750129](https://github.com/qa-test-automation-frameworks/quality-reference-application/actions/runs/39764750129).
- Migration note: API v2 adds the advertised $5,000 limit while API v1 keeps its $10,000 limit. Existing v1 clients can stay on v1. The v0.2.0 tag predates the current published image source, so both identities are shown.
- Limits: this is a fictional synthetic reference application, not a production insurance service or a production-scale capacity claim.

## Release decision

For the five frameworks, the profile now presents the old tags as historical and pairs them with their tested current source revisions. The repository comparison links are the change inventory for any later release draft. Runtime changes are called out above; application and target limitations stay explicit. No version numbers are proposed and no release is published by this portfolio task.
