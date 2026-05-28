# QA Test Automation Frameworks

> A structured portfolio of production-grade test automation frameworks, each demonstrating a distinct technology stack — designed and maintained by a Senior SDET with 7+ years of quality engineering experience.

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Prayag%20Vyas-0A66C2?style=flat&logo=linkedin)](https://www.linkedin.com/in/prayag-vyas-757200144/)
![Java](https://img.shields.io/badge/Java-21-007396?style=flat&logo=openjdk)
![CI](https://img.shields.io/badge/CI-GitHub%20Actions-2088FF?style=flat&logo=github-actions)
![License](https://img.shields.io/badge/License-MIT-green?style=flat)

---

## About This Organization

This GitHub organization serves as a public reference for automation architecture, framework design, and quality engineering practice. Each repository is an independently deployable, CI-integrated framework that reflects real-world design decisions — layered architecture, parallel execution, contract testing, event-driven validation, and AI-augmented development workflows.

Frameworks here are not tutorial projects. They reflect the same engineering standards applied in enterprise environments: separation of concerns, typed configuration, reusable utilities, quality gates, and live Allure reporting via GitHub Pages.

---

## Repositories

### 🔹 [selenium-testng-java-framework](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework)

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

📄 [Live Allure Report](https://qa-test-automation-frameworks.github.io/selenium-testng-java-framework/) · [Architecture Docs](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework/blob/main/docs/ARCHITECTURE.md) · [Portfolio Review Guide](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework/blob/main/docs/PORTFOLIO_REVIEW_GUIDE.md)

---

### 🔹 [aria-api-framework](https://github.com/qa-test-automation-frameworks/aria-api-framework)

[![Java](https://img.shields.io/badge/Java-21-blue?style=flat)](https://github.com/qa-test-automation-frameworks/aria-api-framework)
[![Allure Report](https://img.shields.io/badge/Allure-Report-orange?style=flat)](https://qa-test-automation-frameworks.github.io/aria-api-framework/)

Java 21 · JUnit 5 · RestAssured · WireMock · Pact · Testcontainers · Allure · GitHub Actions

A portfolio-grade REST API test automation framework covering the full testing surface: functional CRUD coverage, contract testing (Pact consumer + provider), schema validation via OpenAPI spec, security-oriented negative tests, mock server isolation with WireMock, and containerized service dependencies via Testcontainers. CI/CD quality gates enforce test, coverage, and style standards before merge.

**Notable design decisions:**
- Payload Factory pattern for structured, reusable request/response management
- Auth token caching and refresh handling to reduce redundant authentication calls
- Pact-based consumer–provider contract layer to catch integration regressions early
- Testcontainers for reproducible service-level integration tests without shared environments
- OpenAPI coverage validation to detect undocumented or drifted endpoints

📄 [Live Allure Report](https://qa-test-automation-frameworks.github.io/aria-api-framework/) · [Architecture Docs](https://github.com/qa-test-automation-frameworks/aria-api-framework/blob/main/docs/ARCHITECTURE.md)

---

## Planned Frameworks

The following repositories are in planning or active development:

| Repository | Stack | Focus |
|---|---|---|
| `playwright-java-framework` | Playwright · Java 21 | Modern browser automation with network interception and trace viewer integration |
| `k6-performance-framework` | k6 · JavaScript | API and load performance testing with CI threshold enforcement |
| `selenide-spring-boot-framework` | Selenide · Spring Boot · Gradle · Testcontainers | UI automation with Spring-managed dependency injection and container lifecycle |
| `mobile-appium-framework` | Appium · Java 21 · TestNG | Native and hybrid mobile automation for Android and iOS |
| `ta-commons` | Java 21 · Maven | Shared utilities: auth providers, email validation, payload factories, data cleanup |

---

## Technology Landscape

| Domain | Tools & Technologies |
|---|---|
| **UI Automation** | Selenium WebDriver, Selenide, Playwright |
| **API Automation** | REST-Assured, WireMock, OpenAPI validation |
| **Mobile** | Appium, Experitest STA |
| **Contract Testing** | Pact (Consumer & Provider) |
| **Test Runners** | TestNG, JUnit 5, Pytest |
| **Reporting** | Allure (with GitHub Pages deployment) |
| **CI/CD** | GitHub Actions, Jenkins, Azure DevOps |
| **Build Tools** | Maven, Gradle |
| **Containerization** | Docker, Docker Compose, Selenium Grid, Testcontainers |
| **Languages** | Java 21 · Python · JavaScript · Bash |
| **AI-Assisted Dev** | GitHub Copilot · Claude Sonnet / Opus · GPT-4.5 / GPT-5 |

---

## Architecture Principles

Frameworks in this organization are built around a consistent set of engineering principles:

- **Strict separation of concerns** — test, service, data, and utility layers are independently scoped
- **Layered configuration** — typed config with profile loading, environment variable overrides, and CI secret injection
- **Parallel-safe execution** — `ThreadLocal` isolation and stateless page objects for thread-safe concurrency
- **Quality gates** — formatting, static analysis, dependency governance, and coverage thresholds enforced in CI
- **Diagnostics by default** — Allure reports include screenshots, logs, network traces, and retry context on failure
- **Reproducible environments** — Docker-pinned images and Testcontainers eliminate environment drift

---

## Background

This organization is maintained by **Prayag Vyas**, a Senior SDET with 7+ years of experience designing and scaling test automation infrastructure for enterprise products across AdTech, secure collaboration, and workplace management domains.

Career highlights include:
- Scaling automation suites to 10,000+ tests with throughput increases from ~7 tests/sprint to 40–50/sprint
- Introducing contract testing and event hub validation (producer and consumer) from scratch into shared frameworks
- Leading framework modernization from Java 11 to Java 21 with updated concurrency primitives
- Driving org-wide adoption of Modern Testing Pyramid strategy and reshaping CI regression pipelines
- Operating under AI-first engineering practices with measurable reduction in manual test authoring overhead

[![LinkedIn](https://img.shields.io/badge/Connect%20on-LinkedIn-0A66C2?style=flat&logo=linkedin)](https://www.linkedin.com/in/prayag-vyas-757200144/)

---

*This organization is a living portfolio — frameworks are actively maintained and expanded as new stacks and patterns are evaluated.*
