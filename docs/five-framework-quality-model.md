# Five-Framework Quality Model

These repositories are intended to be reviewed as one layered quality system, not as five unrelated examples.

## Layer Ownership

| Layer | Repository | Primary question |
| --- | --- | --- |
| Evaluation trust | `verity-policy-coverage-eval-framework` | Can non-deterministic product behavior be measured with replayable evidence, calibration, and documented thresholds? |
| Browser behavior | `playwright-typescript-framework` | Can modern UI, API-assisted setup, accessibility, visual checks, and flake control share one governed target? |
| Performance evidence | `k6-performance-framework` | Can load, stress, soak, and regression signals be generated safely with clear SLO ownership? |
| API contracts | `aria-api-framework` | Can service-level behavior be validated through typed clients, owned providers, Pact, OpenAPI coverage, and redacted diagnostics? |
| Enterprise JVM execution | `selenium-testng-java-framework` | Can Selenium/TestNG execution stay reliable under Grid, parallelism, diagnostics, and suite ownership rules? |

## Shared Standard

Every framework is expected to show the same operating standard:

- Deterministic first-run path.
- Controlled target or clearly documented external dependency.
- Evidence artifacts that can be inspected without rerunning everything.
- Reliability policy with quarantine or an equivalent exception process.
- CI gates that separate fast PR checks from heavier scheduled or manual evidence.
- Limitations stated in the repository that owns the limitation.

## Review Order

Review in this order when time is limited:

1. Verity, because it demonstrates the newest and hardest-to-stabilize quality surface.
2. Playwright, because it shows the browser reliability standard and controlled target.
3. k6, because it validates performance governance and regression comparison.
4. ARIA, because it proves API-level contract and diagnostic discipline.
5. Selenium, because it shows the same discipline in a common enterprise Java stack.

The goal is consistency: each repository uses different tools, but the evidence model should feel familiar across all five.
