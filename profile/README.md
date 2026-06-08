# QA Test Automation Frameworks

> A structured portfolio of production-grade test automation frameworks, each demonstrating a distinct technology stack and maintained with real CI quality gates, diagnostics, and reviewer-friendly documentation.

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Prayag%20Vyas-0A66C2?style=flat&logo=linkedin)](https://www.linkedin.com/in/prayag-vyas/)
![Java](https://img.shields.io/badge/Java-21-007396?style=flat&logo=openjdk)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat&logo=typescript)
![Playwright](https://img.shields.io/badge/Playwright-1.60-2EAD33?style=flat&logo=playwright)
![CI](https://img.shields.io/badge/CI-GitHub%20Actions-2088FF?style=flat&logo=github-actions)
![License](https://img.shields.io/badge/License-MIT-green?style=flat)

---

## About This Organization

This GitHub organization serves as a public reference for automation architecture, framework design, and quality engineering practice. Each repository is an independently runnable, CI-integrated framework that reflects real-world design decisions: layered architecture, typed configuration, deterministic execution, reporting, diagnostics, contract coverage, and controlled test environments.

Frameworks here are not tutorial projects. They reflect engineering standards used in enterprise-grade automation: separation of concerns, reusable test infrastructure, explicit environment handling, quality gates, and live Allure reporting through GitHub Pages.

---

## Repositories

### [selenium-testng-java-framework](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework)

[![UI Tests](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework/actions/workflows/ui-tests.yml/badge.svg?branch=main)](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework/actions/workflows/ui-tests.yml)
[![Allure Report](https://img.shields.io/badge/Allure-Report-orange?style=flat)](https://qa-test-automation-frameworks.github.io/selenium-testng-java-framework/)
[![Java](https://img.shields.io/badge/Java-21-blue?style=flat)](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework)

Java 21 · Selenium 4 · TestNG · Maven · Docker Selenium Grid · Allure · GitHub Actions

A full-featured UI automation framework targeting Sauce Demo. Demonstrates layered Page Object Model architecture, `ThreadLocal<WebDriver>` for thread-safe parallel execution, cookie-based auth optimization, typed configuration with profile loading, opt-in accessibility and visual regression coverage, and diagnostics-rich Allure reporting with redacted screenshots, console logs, and network traces.

**Notable design decisions:**

- Explicit-only wait strategy with zero implicit waits
- Page Component Model for shared UI regions
- Opt-in retry analyzer with mandatory reason annotation
- CI matrix across Chrome, Firefox, and Edge with merged Allure publication to GitHub Pages
- Spotless, Checkstyle, PMD, SpotBugs, and Maven Enforcer quality gates

[Live Allure Report](https://qa-test-automation-frameworks.github.io/selenium-testng-java-framework/) · [Architecture Docs](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework/blob/main/docs/ARCHITECTURE.md) · [Portfolio Review Guide](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework/blob/main/docs/PORTFOLIO_REVIEW_GUIDE.md)

---

### [aria-api-framework](https://github.com/qa-test-automation-frameworks/aria-api-framework)

[![ARIA API Framework CI](https://github.com/qa-test-automation-frameworks/aria-api-framework/actions/workflows/ci.yml/badge.svg)](https://github.com/qa-test-automation-frameworks/aria-api-framework/actions/workflows/ci.yml)
[![Allure Report](https://img.shields.io/badge/Allure-Report-orange?style=flat)](https://qa-test-automation-frameworks.github.io/aria-api-framework/)
[![Java](https://img.shields.io/badge/Java-21-blue?style=flat)](https://github.com/qa-test-automation-frameworks/aria-api-framework)

Java 21 · JUnit 5 · RestAssured · Gradle · WireMock · Pact · Testcontainers · Allure · GitHub Actions

ARIA is the Automated REST Interface Assertion Framework: a portfolio-grade REST API test automation framework covering functional API checks, reusable API clients, service objects, schema validation, contract testing, security-oriented boundary tests, mock provider isolation, OpenAPI coverage, reporting, and CI/CD quality gates.

**Notable design decisions:**

- Layered client and service architecture for endpoint mapping and business workflows
- Data builders and factories for valid, invalid, boundary, and security payloads
- Pact consumer contracts plus owned provider verification for deterministic integration checks
- WireMock and Testcontainers coverage for reproducible service-level validation
- OpenAPI endpoint coverage and schema validation to detect contract drift

[Live Allure Report](https://qa-test-automation-frameworks.github.io/aria-api-framework/) · [Architecture Docs](https://github.com/qa-test-automation-frameworks/aria-api-framework/blob/main/docs/ARCHITECTURE.md) · [Portfolio Review Guide](https://github.com/qa-test-automation-frameworks/aria-api-framework/blob/main/docs/Portfolio_Review_Guide.md)

---

### [playwright-typescript-framework](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework)

[![CI](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework/actions/workflows/ci.yml/badge.svg)](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework/actions/workflows/ci.yml)
[![Allure Report](https://img.shields.io/badge/Allure-Report-orange?style=flat)](https://qa-test-automation-frameworks.github.io/playwright-typescript-framework/)
[![Playwright](https://img.shields.io/badge/Playwright-1.60-2EAD33?style=flat&logo=playwright)](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework)
[![Node](https://img.shields.io/badge/Node-20%2B-339933?style=flat&logo=node.js)](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework)

Playwright · TypeScript · Node 20 · Zod · Axe · Allure · OpenTelemetry · GitHub Actions

A modern Playwright and TypeScript framework for a repo-owned Conduit-compatible controlled target. Demonstrates hybrid API and browser automation with typed API clients, Zod response validation, page objects, custom fixtures, API-level setup and cleanup, visual snapshots, Axe accessibility checks, selector contracts, cross-browser coverage, sharded CI execution, and Allure/HTML reporting.

**Notable design decisions:**

- Repo-owned controlled target for deterministic local and CI execution
- Explicit anonymous and authenticated API fixture boundaries
- Project-level Playwright separation for setup, API, authenticated UI, anonymous UI, visual, accessibility, and contract suites
- Visual snapshot manifest checks to keep accepted baselines intentional
- OpenAPI contract checks aligned with runtime Zod response schemas
- Optional OpenTelemetry traces for per-test and per-step observability

[Live Allure Report](https://qa-test-automation-frameworks.github.io/playwright-typescript-framework/) · [Architecture Docs](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework/blob/main/docs/Architecture.md) · [Portfolio Review Guide](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework/blob/main/docs/portfolio-review-guide.md)

---

## Planned Frameworks

The following repositories are planned or candidates for future expansion:

| Repository | Stack | Focus |
|---|---|---|
| `k6-performance-framework` | k6 · JavaScript | API and load performance testing with CI threshold enforcement |
| `selenide-spring-boot-framework` | Selenide · Spring Boot · Gradle · Testcontainers | UI automation with Spring-managed dependency injection and container lifecycle |
| `mobile-appium-framework` | Appium · Java 21 · TestNG | Native and hybrid mobile automation for Android and iOS |
| `ta-commons` | Java 21 · Maven | Shared utilities for auth providers, validation, payload factories, data cleanup, and reporting helpers |

---

## Technology Landscape

| Domain | Tools & Technologies |
|---|---|
| **UI Automation** | Selenium WebDriver, Playwright, Selenide |
| **API Automation** | RestAssured, Playwright APIRequestContext, WireMock, OpenAPI validation, Zod |
| **Accessibility** | Axe, Playwright accessibility checks |
| **Visual Testing** | Selenium visual scaffold, Playwright snapshot baselines |
| **Contract Testing** | Pact, OpenAPI runtime validation, selector contracts |
| **Test Runners** | TestNG, JUnit 5, Playwright Test |
| **Reporting** | Allure, Playwright HTML, GitHub Pages |
| **Observability** | OpenTelemetry, Jaeger |
| **CI/CD** | GitHub Actions, Jenkins, Azure DevOps |
| **Build Tools** | Maven, Gradle, npm |
| **Containerization** | Docker, Docker Compose, Selenium Grid, Testcontainers |
| **Languages** | Java 21 · TypeScript · JavaScript · Python · Bash |
| **AI-Assisted Dev** | GitHub Copilot · Claude Sonnet / Opus · GPT-4.5 / GPT-5 |

---

## Architecture Principles

Frameworks in this organization are built around a consistent set of engineering principles:

- **Strict separation of concerns**: test, page, API, service, data, fixture, and utility layers have clear ownership.
- **Layered configuration**: typed config, profile loading, environment overrides, and CI secret injection are explicit.
- **Parallel-safe execution**: browser and API state are isolated by thread, fixture, worker, or test run.
- **Controlled environments**: deterministic targets, mocks, provider fixtures, and contracts reduce reliance on unstable public systems.
- **Quality gates**: formatting, static analysis, dependency governance, secret scanning, and contract checks run before publication.
- **Diagnostics by default**: reports include screenshots, logs, traces, retries, redacted request/response evidence, and failure context.
- **Portfolio-grade documentation**: setup, execution, debugging, architecture decisions, and review paths are documented per repo.

---

## Background

This organization is maintained by **Prayag Vyas**, a Senior SDET with 7+ years of experience designing and scaling test automation infrastructure for enterprise products across AdTech, secure collaboration, and workplace management domains.

Career highlights include:

- Scaling automation suites to 10,000+ tests with throughput increases from roughly 7 tests per sprint to 40-50 tests per sprint
- Introducing contract testing and event hub validation from scratch into shared frameworks
- Leading framework modernization from Java 11 to Java 21 with updated concurrency primitives
- Driving adoption of Modern Testing Pyramid strategy and reshaping CI regression pipelines
- Operating under AI-assisted engineering practices with measurable reduction in manual test authoring overhead

[![LinkedIn](https://img.shields.io/badge/Connect%20on-LinkedIn-0A66C2?style=flat&logo=linkedin)](https://www.linkedin.com/in/prayag-vyas/)

---

*This organization is a living portfolio. Frameworks are actively maintained and expanded as new stacks and patterns are evaluated.*
