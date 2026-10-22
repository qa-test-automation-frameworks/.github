# Start here: change a policy limit without breaking old clients

**Review target: about 90 seconds. This has not been timed with a reader.**

A claims application accepted amounts up to $10,000. The product needed a new
$5,000 policy limit, but lowering the existing API limit in place would break
clients already using it.

## Follow the decision

1. **Keep the old contract measurable.** API v1 continues to accept 1,000,000
   cents and reject 1,000,001. A deliberate red control changed v1's limit in
   place; [the hosted run failed on the preserved $10,000 assertion](https://github.com/qa-test-automation-frameworks/quality-reference-application/actions/runs/39007706443).
   That failure showed the compatibility check could detect the break.
2. **Add the new rule without rewriting history.** API v2 caps claims at 500,000
   cents and returns that limit in policy data. The browser reads the advertised
   value and converts decimal input to integer cents. API v1, stored claims,
   authorization, reviewer transitions, and audit events remain unchanged.
   [QRA verification run 39751334958](https://github.com/qa-test-automation-frameworks/quality-reference-application/actions/runs/39751334958)
   passed the PostgreSQL 18.6 gate on source `81538cfb9fe1381bbc1f3b4dd350a8f215671feb`.
3. **Check consumers and recovery separately.** A [Playwright main run](https://github.com/qa-test-automation-frameworks/playwright-typescript-framework/actions/runs/39090674631)
   passed five shared-app UI cases against its recorded immutable pin and
   verified rollback to the previous v1 image. The run records the exact
   consumer digest; later images need their own consumer evidence.

The current QRA release version, source, image digest, and consumer pins are
listed in the [target identity record](https://github.com/qa-test-automation-frameworks/quality-reference-application/blob/main/docs/target-identity.md).
Its release verification passed, while an independent consumer check must match
the exact digest being reviewed. The change leaves the database schema untouched
and carries no performance result. The app and test data are synthetic.

For current repository execution, publication, and freshness, use the [live
evidence dashboard](https://qa-test-automation-frameworks.github.io/.github/).
The full [compatibility record](https://github.com/qa-test-automation-frameworks/quality-reference-application/blob/main/docs/a07-policy-limit-compatibility.md)
keeps the detailed change history, boundaries, and remaining limits.
