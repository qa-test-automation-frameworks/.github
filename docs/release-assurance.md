# Release assurance packets

The release assurance packet connects a specific immutable QRA image to the business risks it is expected to control and to the exact ARIA and Playwright revisions selected to exercise it. The initial risk map is deliberately limited to cross-member denial, stale-version conflict, and API v1/v2 claim-limit compatibility.

The packet builder is an offline Node program. It reads a version-1 risk map and packet input containing a release descriptor, its stable retrieval receipt, checksummed schema-v3 evidence bundles, separately checksummed risk-specific native proof receipts, and retained rollback evidence:

```sh
node scripts/validate-risk-map.mjs
node scripts/fetch-risk-proofs.mjs \
  --run-id <trusted-qra-main-push-run-id> \
  --output work/release-assurance/packet-input.json
node scripts/build-assurance-packet.mjs \
  --risk-map portfolio/risk-map.json \
  --input work/release-assurance/packet-input.json \
  --output work/release-assurance/packet.json
node scripts/render-assurance-packet.mjs \
  --input work/release-assurance/packet.json \
  --output work/release-assurance/packet-review.html
```

The fetch command writes the candidate descriptor and verified QRA risk proofs. Add the selected consumer evidence bundles to that input before building the complete packet. The renderer creates one standalone HTML review page with inline styles and no scripts or external assets.

The input keeps the existing strict schema-v3 records unchanged. Bundle manifests bind each record's raw bytes to its repository, source SHA, workflow run, attempt, scope, and checksum. Consumer evidence must match the explicit framework ref and SHA in `portfolio/risk-map.json`, an allowed profile, the candidate fixture version, and the immutable candidate image digest. `oci:sha256:<digest>` is the only prefixed digest representation normalized by the builder. A source SHA, tag, URL, or previous image pin cannot stand in for the candidate digest.

Each named risk needs all configured consumer scopes and an identity-bound clean/mutated native proof. The QRA `qra-risk-proofs` artifact records the exact expected and observed native test IDs, clean and detected outcomes, result hashes, candidate digest, mutation patch hash, mutated source-tree digest, detector revision, and invocation identities. Its `mutated-source-tree-v1` digest identifies a controlled mutation derived from the candidate source; it is not an OCI image digest, and no mutant image is published. The artifact comes from the same trusted QRA `main` push as the release descriptor and expires after 30 days; each proof expires after seven days. A missing scope, stale receipt, removed or skipped native testcase, fixture mismatch, missing descriptor digest, or absent proof leaves the risk `incomplete`. A relevant failed scope or wrong business control makes it `blocked`. Other known scopes are retained as unrelated context and do not change a risk's verdict.

The packet also requires the retained Playwright `shared-app-rollback-proof` artifact. Its input contains the raw `rollback-summary.json` bytes and file hash, the GitHub artifact ID and archive digest, its expiry, the workflow run and the exact `shared-app-rollback` job identity. The builder checks that the artifact belongs to that run, the job URL and ID are stable, the summary bytes match the recorded file hash, the prior image is pinned by digest, all three rollback checks passed, and the artifact is still available. The overall workflow may have concluded `failure` when another job failed; the rollback proof is complete only when the named rollback job itself succeeded and the summary outcome is `passed`. Missing, malformed, mismatched, or expired rollback evidence leaves the packet `incomplete`; an explicit unsuccessful rollback blocks review.

The overall packet is `ready-for-review` only when every configured risk has complete, fresh, candidate-bound evidence and the retained rollback proof is complete. That label supports a human review. It does not certify production safety and does not start, approve, publish, or deploy a release. Empty input can never produce a ready packet.

The QRA workflow produces `qra-release-descriptor` only after its verify and publish jobs succeed on a trusted `main` push, then runs its native risk controls against that exact source and published digest. `scripts/fetch-release-descriptor.mjs` takes the exact QRA run and descriptor artifact IDs, verifies the run, required jobs, artifact metadata and digest, then accepts one bounded `release-descriptor.json` file. The risk-proof artifact is retrieved by run ID and must name exactly one `qra-risk-proofs` artifact from that same run. The packet input records the artifact IDs, hashes and stable GitHub URLs; temporary download URLs and credentials are never retained. The verifier tries the public QRA artifact endpoints without credentials first. If access requires authentication, it can use an already provisioned `QRA_ACTIONS_READ_TOKEN` with Actions read access to QRA. It does not create or broaden credentials; missing access or a failed read leaves the candidate unavailable and the packet incomplete.

The builder checks byte hashes, stable own-organization GitHub URLs, IDs, schema-v3 record semantics, timestamps, scope references, framework revisions, the application and fixture versions, and the descriptor and rollback artifact receipts' consistency. Hashes establish byte integrity; they do not establish where bytes came from. Do not put tokens, signed download URLs, arbitrary image references, or public load targets into packet input. Only stable GitHub artifact pages and IDs are retained in output.

`scripts/assurance-packet.fixtures.mjs` supplies authored offline fixtures to the GitHub CI contract suite. Those fixtures check packet logic and are not hosted release evidence. The QRA producer, release descriptor and native risk-proof artifacts establish source-side evidence; selected consumer candidate-dispatch runs and one retained rollback packet are still required before the real packet can become `ready-for-review`.
