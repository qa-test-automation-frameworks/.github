<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/hero-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="assets/hero-light.svg">
  <img src="assets/hero-light.svg" alt="QA Test Automation Frameworks — quality engineering, made observable. Five reference frameworks: browser UI, API contracts, performance, accessibility, LLM evaluation. Every claim linked to bounded evidence." width="100%">
</picture>

Reference frameworks for browser, API, performance, accessibility, visual, and
LLM-evaluation quality engineering — built by [**Prayag Vyas**](https://www.linkedin.com/in/prayag-vyas/),
Senior Quality Engineer (7+ years). This is not a collection of sample tests:
each repository is a governed system with explicit architecture, controlled
targets, failure evidence, and CI you can audit.

**Start here:** five reference frameworks demonstrate deterministic
feedback, diagnosable failure, and governed delivery across UI, API contracts,
performance, enterprise JVM execution, and LLM evaluation. Open the dashboard,
choose a capability below, and verify the current evidence record before reading
the deeper architecture.

[![Evidence Dashboard](https://img.shields.io/badge/EVIDENCE%20DASHBOARD-101826?style=for-the-badge&logo=githubactions&logoColor=3fb950)](https://qa-test-automation-frameworks.github.io/.github/)
&nbsp;
[![LinkedIn](https://img.shields.io/badge/LINKEDIN-0a66c2?style=for-the-badge)](https://www.linkedin.com/in/prayag-vyas/)

[The frameworks](#the-frameworks) · [Choose by capability](#choose-by-capability) · [Quality model](../docs/five-framework-quality-model.md) · [Operating model](../docs/quality-operating-model.md) · [Review paths](#choose-your-review-depth) · [Field results](#field-results)

</div>

## The Frameworks

| Framework | What it demonstrates | Evidence |
| --- | --- | --- |
| [**ARIA API**](https://github.com/qa-test-automation-frameworks/aria-api-framework)<br><sub>Java 21 · Pact · WireMock · OpenAPI</sub> | API testing above the endpoint-script level: layered clients and services, a deterministic provider, Pact consumer contracts with provider verification, JSON-schema assertions, OpenAPI endpoint coverage, and redacted diagnostics. | [![CI](https://github.com/qa-test-automation-frameworks/aria-api-framework/actions/workflows/ci.yml/badge.svg)](https://github.com/qa-test-automation-frameworks/aria-api-framework/actions/workflows/ci.yml)<br>[Allure report](https://qa-test-automation-frameworks.github.io/aria-api-framework/) · [v1.0.0](https://github.com/qa-test-automation-frameworks/aria-api-framework/releases/tag/v1.0.0) · [Review guide](https://github.com/qa-test-automation-frameworks/aria-api-framework/blob/main/docs/Portfolio_Review_Guide.md) |
| [**k6 Performance**](https://github.com/qa-test-automation-frameworks/k6-performance-framework)<br><sub>k6 · TypeScript · Grafana · OpenTelemetry</sub> | Performance testing as a governed system: six workload models, SLO-based gates, reviewed regression baselines, Grafana/InfluxDB observability, and load-safety rules that keep public targets read-only. | [![Main load](https://github.com/qa-test-automation-frameworks/k6-performance-framework/actions/workflows/main-load.yml/badge.svg)](https://github.com/qa-test-automation-frameworks/k6-performance-framework/actions/workflows/main-load.yml)<br>[Performance reports](https://qa-test-automation-frameworks.github.io/k6-performance-framework/) · [v0.4.0](https://github.com/qa-test-automation-frameworks/k6-performance-framework/releases/tag/v0.4.0) · [Evidence guide](https://github.com/qa-test-automation-frameworks/k6-performance-framework/blob/main/docs/evidence.md) |
| [**Selenium TestNG Java**](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework)<br><sub>Java 21 · Selenium 4 · TestNG · Docker Grid</sub> | The JVM execution discipline enterprises still run on: thread-local drivers, explicit-wait-only synchronization, Docker Grid with capacity guidance, multi-browser CI, and redaction-aware Allure diagnostics. | [![UI Tests](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework/actions/workflows/ui-tests.yml/badge.svg?branch=main)](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework/actions/workflows/ui-tests.yml)<br>[Allure report](https://qa-test-automation-frameworks.github.io/selenium-testng-java-framework/) · [v1.0.0](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework/releases/tag/v1.0.0) · [Review guide](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework/blob/main/docs/PORTFOLIO_REVIEW_GUIDE.md) |
| [**Verity Policy Coverage Eval**](https://github.com/qa-test-automation-frameworks/verity-policy-coverage-eval-framework)<br><sub>Python · pytest · RAG + tool use</sub> | LLM evaluation engineered like software: a three-tier eval pyramid (deterministic gate → semantic evals → adversarial), cassette replay, seeded defects, and judge calibration with bias controls. The hermetic tier runs without provider keys. | [![PR Gate](https://github.com/qa-test-automation-frameworks/verity-policy-coverage-eval-framework/actions/workflows/pr-gate.yml/badge.svg)](https://github.com/qa-test-automation-frameworks/verity-policy-coverage-eval-framework/actions/workflows/pr-gate.yml)<br>[Eval report](https://qa-test-automation-frameworks.github.io/verity-policy-coverage-eval-framework/) · [v0.1.0](https://github.com/qa-test-automation-frameworks/verity-policy-coverage-eval-framework/releases/tag/v0.1.0) · [Review guide](https://github.com/qa-test-automation-frameworks/verity-policy-coverage-eval-framework/blob/main/docs/reviewer-guide.md) |
| [**Playwright TypeScript**](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework)<br><sub>TypeScript · Playwright · Zod · Allure</sub> | Modern browser coverage against a repo-owned target: strict typing, reusable fixtures, typed API clients, visual baselines, Axe accessibility checks, sharded Linux/Windows CI, and a governed retry budget with expiring quarantine. | [![CI](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework/actions/workflows/ci.yml/badge.svg)](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework/actions/workflows/ci.yml)<br>[Allure report](https://qa-test-automation-frameworks.github.io/playwright-typescript-framework/) · [v1.0.0](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework/releases/tag/v1.0.0) · [Review guide](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework/blob/main/docs/portfolio-review-guide.md) |

## Choose by Capability

| If you are evaluating | Start here | What to inspect first |
| --- | --- | --- |
| AI/LLM quality | [Verity](https://github.com/qa-test-automation-frameworks/verity-policy-coverage-eval-framework) | Calibration, replay, adversarial evidence, and explicit live limitations. |
| Modern UI, API, accessibility, and visual testing | [Playwright](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework) | Controlled target, typed clients, cleanup, and flake governance. |
| Performance governance | [k6](https://github.com/qa-test-automation-frameworks/k6-performance-framework) | Safety guard, SLOs, baseline provenance, and regression comparison. |
| API and contract quality | [ARIA](https://github.com/qa-test-automation-frameworks/aria-api-framework) | Owned provider, Pact, OpenAPI, and redacted diagnostics. |
| Enterprise JVM execution | [Selenium](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework) | Grid lifecycle, waits, parallelism, and failure diagnostics. |

## How It Fits Together

![Portfolio topology: Verity, Playwright, k6, ARIA, and Selenium all feed one shared evidence standard — determinism, diagnostics, governance — which publishes CI runs, live reports, releases, and ADRs.](assets/pipeline.svg)

Each repository owns one surface of a layered quality model, and they are meant
to be read together: Playwright proves modern browser, visual, and accessibility
coverage; ARIA proves API behavior at the contract level; k6 proves performance
evidence under governed load; Selenium proves the JVM execution patterns large
teams still depend on; and Verity applies the same determinism and evidence
standards to the newest surface — LLM evaluation. One quality strategy,
demonstrated five ways.

## Choose Your Review Depth

| Time | Path | The question it answers |
| --- | --- | --- |
| **3 minutes** | Open the [evidence dashboard](https://qa-test-automation-frameworks.github.io/.github/) — refreshed on a schedule from live CI metadata, validated before publish, readable without JavaScript. | Is the CI green, are the releases real, and is the evidence current? |
| **15 minutes** | Follow the [Verity reviewer guide](https://github.com/qa-test-automation-frameworks/verity-policy-coverage-eval-framework/blob/main/docs/reviewer-guide.md) and the [Playwright review guide](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework/blob/main/docs/portfolio-review-guide.md). | How are LLM non-determinism and browser flakiness actually controlled? |
| **Deep review** | Work through all five in order — ARIA → k6 → Selenium → Verity → Playwright — each with a documented, time-boxed review path. | Does the same engineering standard hold across every quality surface? |

## The Engineering Standard

![Terminal listing the engineering standard: determinism — controlled targets, seeded data, pinned runtimes; reliability — retry budgets, quarantine with expiry, flake triage; diagnostics — traces, screenshots, structured logs, failure examples; architecture — ADRs, documented trade-offs, extension points; governance — CI gates, dependency scans, SBOMs, release notes; honesty — limitations labeled and repository-local documentation checks.](assets/terminal.svg)

The documentation workflow in this repository rejects a small, explicit list of
unsupported self-assessment terms. A separate evidence contract validates each
repository's default-branch run, SHA, verification record, and freshness. These
are repository-local and portfolio-contract checks; they are not semantic
validation of every organization claim. See the [portfolio evidence standard](../docs/PORTFOLIO_EVIDENCE_STANDARD.md).

## Field Results

![Field results from an anonymized platform migration over about one month: suite stability from about 40% to about 90%; full-suite runtime from about 2 hours to about 15 minutes; test mix from 1,000+ UI-heavy checks to 40 critical journeys plus API coverage; authoring about 3 times faster.](assets/metrics.svg)

These numbers come from one client platform migration, documented in the
anonymized [platform scaling case study](../docs/automation-platform-scaling-case-study.md) —
including the decision record behind them: stop optimizing for raw test count,
keep a small set of business-critical E2E journeys, and push repeatable
validations down to API level. The fixture, data-builder, and reporting
conventions behind those numbers are implemented publicly in the
[Playwright](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework),
[ARIA](https://github.com/qa-test-automation-frameworks/aria-api-framework), and
[k6](https://github.com/qa-test-automation-frameworks/k6-performance-framework) repositories.

---

> **Reviewing this portfolio?** Open the
> [evidence dashboard](https://qa-test-automation-frameworks.github.io/.github/),
> pick a framework, inspect its latest CI run and failure evidence, then run its
> documented local quality gate. Everything above is designed to be challenged.
