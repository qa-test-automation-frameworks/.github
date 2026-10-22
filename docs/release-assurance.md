# Release assurance packets

The release assurance packet connects a specific immutable QRA image to the business risks it is expected to control and to the exact ARIA and Playwright revisions selected to exercise it. The initial risk map is deliberately limited to cross-member denial, stale-version conflict, and API v1/v2 claim-limit compatibility.

The packet builder is an offline Node program. It reads a version-1 risk map and packet input containing a release descriptor, its stable retrieval receipt, checksummed schema-v3 evidence bundles, and separately checksummed risk-specific native proof receipts:

```sh
node scripts/validate-risk-map.mjs
node scripts/build-assurance-packet.mjs \
  --risk-map portfolio/risk-map.json \
  --input work/release-assurance/packet-input.json \
  --output work/release-assurance/packet.json
```

The input keeps the existing strict schema-v3 records unchanged. Bundle manifests bind each record's raw bytes to its repository, source SHA, workflow run, attempt, scope, and checksum. Consumer evidence must match the explicit framework ref and SHA in `portfolio/risk-map.json`, an allowed profile, the candidate fixture version, and the immutable candidate image digest. `oci:sha256:<digest>` is the only prefixed digest representation normalized by the builder. A source SHA, tag, URL, or previous image pin cannot stand in for the candidate digest.

Each named risk needs all configured consumer scopes and an identity-bound clean/mutated native proof. The proof lists the exact expected native test IDs, candidate digest, distinct candidate-derived mutated digest, detector revision, and clean and mutated run attempts. A missing scope, stale receipt, removed native testcase, fixture mismatch, missing descriptor digest, or absent proof leaves the risk `incomplete`. A relevant failed scope or wrong business control makes it `blocked`. Other known scopes are retained as unrelated context and do not change a risk's verdict.

The overall packet is `ready-for-review` only when every configured risk has complete, fresh, candidate-bound evidence. That label supports a human review. It does not certify production safety and does not start, approve, publish, or deploy a release. Empty input can never produce a ready packet.

The builder checks byte hashes, stable own-organization GitHub URLs, IDs, schema-v3 record semantics, timestamps, scope references, framework revisions, and the descriptor receipt's consistency. Hashes establish byte integrity; they do not establish where bytes came from. The caller must obtain descriptors and evidence through the approved read-only GitHub artifact verifier. Do not put tokens, signed download URLs, arbitrary image references, or public load targets into packet input. Only stable GitHub artifact pages and IDs are retained in output.

`scripts/assurance-packet.fixtures.mjs` supplies authored offline fixtures to the GitHub CI contract suite. Those fixtures check packet logic and are not hosted release evidence. This first increment provides the registry and offline packet contract. The QRA descriptor producer and verified read path, selected consumer candidate-dispatch workflows, and a real compatible/mutated/rollback packet are separate follow-on increments; until those are complete, the retained offline fixtures must not be described as a real candidate release decision.
