# Contributing

Changes should keep evidence current, factual, and directly linked to public
source, CI, releases, reports, or screenshots.

1. Update `portfolio/repositories.json` when a repository enters or leaves the
   recommended review set.
2. Run `node scripts/refresh-dashboard.mjs`.
3. Run `node scripts/validate-dashboard.mjs`.
4. Explain changed claims and their evidence in the pull request.

Do not add private employer details, secrets, unsupported adoption claims, or
unverified performance values.
