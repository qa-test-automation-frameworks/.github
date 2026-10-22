import assert from "node:assert/strict";
import test from "node:test";
import { validateReviewerLinks } from "./check-reviewer-links.mjs";

const OWNER = "qa-test-automation-frameworks";
const REPOSITORY = `${OWNER}/aria-api-framework`;
const SOURCE_PATH = "profile/README.md";
const REVISION = "a".repeat(40);

function fixture({
  path = "docs/portfolio-review-guide.md",
  kind = "blob",
  fragment,
  inventoryPaths = ["docs/portfolio-review-guide.md"],
  anchors,
  repository = REPOSITORY,
  externalUrl,
} = {}) {
  const route = kind === "tree" ? "tree" : "blob";
  const href = externalUrl ??
    `https://github.com/${repository}/${route}/main/${path}${fragment ? `#${fragment}` : ""}`;
  const link = externalUrl
    ? { sourcePath: SOURCE_PATH, externalUrl, label: "fixture link" }
    : {
        sourcePath: SOURCE_PATH,
        repository,
        path,
        kind,
        ...(fragment ? { fragment } : {}),
        label: "fixture link",
      };
  const repositories = repository
    ? {
        [repository]: {
          revision: REVISION,
          trackedPaths: inventoryPaths,
          ...(anchors ? { anchors } : {}),
        },
      }
    : {};
  return {
    contract: {
      version: 1,
      organization: OWNER,
      sourceRepository: `${OWNER}/.github`,
      repositories,
      links: [link],
    },
    environment: {
      sourceTrackedPaths: [SOURCE_PATH],
      sourceFiles: { [SOURCE_PATH]: `[review](${href})` },
    },
  };
}

test("accepts exact-case tracked file and directory paths", () => {
  const file = fixture();
  assert.equal(validateReviewerLinks(file.contract, file.environment).errors.length, 0);

  const tree = fixture({
    path: "src/test/java/com/aria/framework/contracts",
    kind: "tree",
    inventoryPaths: [
      "src/test/java/com/aria/framework/contracts/ContractTest.java",
    ],
  });
  assert.equal(validateReviewerLinks(tree.contract, tree.environment).errors.length, 0);
});

test("rejects the stale uppercase ARIA review-guide path", () => {
  const value = fixture({
    path: "docs/Portfolio_Review_Guide.md",
    inventoryPaths: ["docs/portfolio-review-guide.md"],
  });
  const result = validateReviewerLinks(value.contract, value.environment);
  assert.match(result.errors.join("\n"), /exact blob path is absent/u);
});

test("rejects a QRA path that traverses into the sibling .github repository", () => {
  const repository = `${OWNER}/quality-reference-application`;
  const value = fixture({
    repository,
    path: "../.github",
    inventoryPaths: ["docs/target-identity.md"],
  });
  const result = validateReviewerLinks(value.contract, value.environment);
  assert.match(result.errors.join("\n"), /destination path is unsafe/u);
});

test("rejects missing destination files and missing Markdown anchors", () => {
  const missingFile = fixture({
    path: "docs/missing.md",
    inventoryPaths: ["docs/portfolio-review-guide.md"],
  });
  assert.match(
    validateReviewerLinks(missingFile.contract, missingFile.environment).errors.join("\n"),
    /exact blob path is absent/u,
  );

  const missingAnchor = fixture({
    fragment: "not-recorded",
    anchors: { "docs/portfolio-review-guide.md": ["known-anchor"] },
  });
  assert.match(
    validateReviewerLinks(missingAnchor.contract, missingAnchor.environment).errors.join("\n"),
    /fragment #not-recorded is missing/u,
  );
});

test("rejects unsafe URLs and traversal in inventory paths", () => {
  const unsafeUrl = fixture({
    externalUrl: "https://user:secret@github.com/qa-test-automation-frameworks/aria-api-framework",
    repository: null,
  });
  assert.match(
    validateReviewerLinks(unsafeUrl.contract, unsafeUrl.environment).errors.join("\n"),
    /external URL is unsafe/u,
  );

  const queryUrl = fixture({
    externalUrl: "https://github.com/qa-test-automation-frameworks/aria-api-framework?token=secret",
    repository: null,
  });
  assert.match(
    validateReviewerLinks(queryUrl.contract, queryUrl.environment).errors.join("\n"),
    /external URL is unsafe/u,
  );

  const traversingUrl = fixture({
    externalUrl: "https://github.com/../.github/blob/main/README.md",
    repository: null,
  });
  assert.match(
    validateReviewerLinks(traversingUrl.contract, traversingUrl.environment).errors.join("\n"),
    /external URL is unsafe/u,
  );

  const unsafeInventory = fixture({ inventoryPaths: ["../.github/README.md"] });
  assert.match(
    validateReviewerLinks(unsafeInventory.contract, unsafeInventory.environment).errors.join("\n"),
    /inventory contains an unsafe path/u,
  );

  const unsafeRepository = fixture({ repository: `${OWNER}/..` });
  assert.match(
    validateReviewerLinks(unsafeRepository.contract, unsafeRepository.environment).errors.join("\n"),
    /inventory repository is unsafe/u,
  );
});

test("reports a missing remote inventory as unavailable instead of a fabricated 404", () => {
  const value = fixture();
  value.contract.repositories = {};
  const result = validateReviewerLinks(value.contract, value.environment);
  assert.equal(result.errors.length, 0);
  assert.equal(result.unavailable.length, 1);
  assert.match(result.unavailable[0].reason, /no sibling clone or sanitized inventory/u);
});
