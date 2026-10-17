# Independent portfolio review packet

This packet is for one reviewer who has not contributed to the repositories. It is designed to take about 30 minutes, including a fresh checkout and a deliberately failing control. The goal is to assess whether the portfolio is understandable and reproducible from public instructions, not to certify enterprise-scale quality.

## Scope and limits

Review the public organization portfolio and use the Playwright TypeScript framework as the hands-on sample. Start at the [organization profile](https://github.com/qa-test-automation-frameworks/.github/blob/main/profile/README.md) and [live portfolio dashboard](https://qa-test-automation-frameworks.github.io/.github/), then read the [Playwright review guide](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework/blob/main/docs/portfolio-review-guide.md). The dashboard is time-sensitive; record the displayed generation time and any stale or unavailable state you see.

The sample intentionally checks a browser-free suite and a browser-free negative control. It does not validate a live application, cross-browser behavior, accessibility in a real browser, production readiness, or independent adoption of the other frameworks. Do not submit credentials, use public targets, or run load tests for this exercise.

## Prerequisites

- Git, Node.js 24.21.0, and npm 10.9.4. Confirm with `node --version` and `npm --version` before installing dependencies.
- Network access to GitHub and npm for the clone and dependency installation.
- No browser download, API key, test account, Docker service, or GitHub authentication is needed.
- Use a disposable directory. The checks create files under `test-results/`.

If the exact Node/npm versions are unavailable, record the versions and stop rather than changing the repository's runtime guard or package lock.

## Fresh-clone exercise

From a disposable parent directory:

```sh
git clone https://github.com/qa-test-automation-frameworks/playwright-typescript-framework.git
cd playwright-typescript-framework
npm ci
npm run test:unit
```

The first-success check should exit `0`. It uses fake request contexts and synthetic configuration; it should not contact the application target. Record elapsed time separately for clone, install, and test.

Then run the isolated intentional-failure probe:

```sh
npx playwright test --config=playwright.evidence-control.config.ts
```

This command is expected to exit nonzero because one assertion is deliberately false. The failure should name `E02_EXPECTED_FAILURE_CONTROL`, and the JSON report should be written to `test-results/evidence-control/results.json`. A different error, missing report, zero failures, or more than one failed case is a problem to report. Do not treat this expected red command as a product or CI failure. The negative control is browser-free and makes no target calls.

## What to inspect

1. Does the organization profile make it clear what the portfolio contains and where to begin?
2. Can you distinguish framework execution, published evidence, dashboard freshness, and known limitations?
3. Does the Playwright review guide lead you to useful architecture and test code without requiring prior context?
4. Could you complete both commands from a fresh clone using only the instructions here? Note ambiguous steps and unexplained failures.
5. Do the deliberately failing probe and its diagnostic provide enough evidence to identify the intended failure?

Use specific examples and file paths. Separate setup problems, test failures, expected negative-control behavior, stale or unavailable evidence, and your opinion of the design.

## Feedback form

Please return the completed form without secrets or personal data:

```text
Reviewer (name or pseudonym):
Date and OS:
Node/npm versions:
Commit checked:
Elapsed time — clone / install / first-success / negative control:

First-success result and evidence path:
Negative-control exit/result and evidence path:

Could you identify a starting point from the profile? Why or why not?
What was the first confusing or blocked step?
What was strongest technically? Include a concrete example.
What is the most important weakness or unsupported claim you found?
What would you change first?
Did the dashboard state match what the linked evidence showed?
Would you be comfortable discussing this work in a technical interview? Why or why not?

Issues filed or pull requests opened (optional):
Additional comments:
```

## Adoption status

This document prepares an independent review; it is not evidence that one occurred. The roadmap item remains open until a real independent reviewer completes a fresh-clone attempt, returns inspectable feedback, and material blockers are fixed or explicitly explained. Do not report this packet as external adoption, endorsement, or a portfolio score.
