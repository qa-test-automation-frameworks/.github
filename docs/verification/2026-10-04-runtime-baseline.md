# Organization dashboard runtime and bootstrap

Node.js 24.21.0 is pinned in `.nvmrc`; CI reads the same file. Shared entry-point
validation rejects older/other majors and prerelease strings before token/snapshot
handling, with a setup instruction. Stable later Node24 patches/minors satisfy the
policy but have not automatically been tested. No npm dependency installation is
needed: the dashboard uses Node's standard library.

The [Node lifecycle table](https://nodejs.org/en/about/previous-releases) was checked;
the verified supported Node24 runtime used for framework work is reused here.
Actual Node18.19.1 and Node24.19.0 attempts at the refresh entry point rejected
before token checks; no network request was performed.

A disposable local clone received the exact runtime patch/new files. With no
node_modules and a stripped shell environment, the published commands
`node --test scripts/dashboard.test.mjs` and `node scripts/validate-dashboard.mjs`
passed twice: two native contract cases per invocation and five repository records.
No cache, dependency download, token, browser or live GitHub request was needed.
The stored snapshot correctly warned about age and missing historical Verity
samples. Validation proves its contract/static fallback, not current live evidence.

Actionlint1.7.7 passed the changed workflow with optional ShellCheck/Pyflakes
integrations disabled. Native logs/source hashes are retained in
`evidence/2026-10-04-runtime/`. Exact-revision workflow refresh/upload remains
pending; default-branch publication and E01–E04 evidence semantics remain separate.
The original local main's five ahead-only commits are preserved; implementation
starts from fetched origin/main, which had the same source tree.

## Remote and scheduling limits

Exact262f3cd6fc801e47af7b763205c6ea98260dbf78 Documentation37205087082
passed its local-link/claim check. GitHub's workflow API reports the Portfolio
dashboard workflow294348590 as disabled_inactivity. Therefore there is no remote
Node dashboard execution, refresh, upload or deployment proof at this revision.
The local fresh-clone/twice-repeated checks remain valid in their stated scope.
Re-enabling and verifying scheduled operation belongs to E04/P03; a successful
documentation job is not substituted for that workflow.
