#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const EXPECTED_OWNER = "qa-test-automation-frameworks";
const SOURCE_REPOSITORY = `${EXPECTED_OWNER}/.github`;
const ALLOWED_EXTERNAL_HOSTS = new Set([
  "github.com",
  "qa-test-automation-frameworks.github.io",
]);
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function isSafeRepositorySlug(value) {
  if (typeof value !== "string" || !REPOSITORY_PATTERN.test(value)) return false;
  const [owner, name] = value.split("/");
  return SEGMENT_PATTERN.test(owner) && SEGMENT_PATTERN.test(name);
}

function isSafeRepositoryPath(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  if (value.startsWith("/") || value.includes("\\") || value.includes("%")) {
    return false;
  }
  const segments = value.split("/");
  return segments.every(
    (segment) =>
      segment !== "." && segment !== ".." && SEGMENT_PATTERN.test(segment),
  );
}

function githubHref(link) {
  const route = link.kind === "tree" ? "tree" : "blob";
  const encodedPath = link.path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const fragment = link.fragment ? `#${encodeURIComponent(link.fragment)}` : "";
  return `https://github.com/${link.repository}/${route}/main/${encodedPath}${fragment}`;
}

function markdownAnchors(markdown) {
  const counts = new Map();
  const anchors = new Set();
  for (const line of markdown.split(/\r?\n/u)) {
    const match = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/u);
    if (!match) continue;
    const heading = match[1]
      .replace(/<[^>]*>/gu, "")
      .replace(/!?\[([^\]]+)\]\([^)]*\)/gu, "$1")
      .replace(/[`*_~]/gu, "")
      .trim()
      .toLowerCase();
    const base = heading
      .replace(/\s/gu, "-")
      .replace(/[^\p{L}\p{N}_-]/gu, "");
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

function safeExternalUrl(value) {
  if (typeof value !== "string" || /(?:^|\/)\.\.?(?:\/|$)|%2e/iu.test(value)) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      ALLOWED_EXTERNAL_HOSTS.has(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

function hasPath(paths, wanted, kind) {
  if (kind === "tree") {
    return paths.some((candidate) => candidate.startsWith(`${wanted}/`));
  }
  return paths.includes(wanted);
}

function normalizeTree(tree) {
  if (!tree) return null;
  return {
    paths: tree.paths instanceof Set ? [...tree.paths] : tree.paths ?? [],
    contents: tree.contents ?? {},
    anchors: tree.anchors ?? {},
    source: tree.source ?? "local source inventory",
  };
}

export function validateReviewerLinks(contract, environment = {}) {
  const errors = [];
  const unavailable = [];
  const checked = [];
  const sourcePaths = new Set(environment.sourceTrackedPaths ?? []);
  const sourceFiles = environment.sourceFiles ?? {};
  const sourceTrees = environment.sourceTrees ?? {};
  const inventories = contract?.repositories ?? {};

  if (contract?.version !== 1) errors.push("contract version must be 1");
  if (contract?.organization !== EXPECTED_OWNER) {
    errors.push(`organization must be ${EXPECTED_OWNER}`);
  }
  if (contract?.sourceRepository !== SOURCE_REPOSITORY) {
    errors.push(`sourceRepository must be ${SOURCE_REPOSITORY}`);
  }
  for (const [repository, inventory] of Object.entries(inventories)) {
    if (
      !isSafeRepositorySlug(repository) ||
      repository.split("/")[0] !== EXPECTED_OWNER
    ) {
      errors.push(`inventory repository is unsafe: ${repository}`);
      continue;
    }
    if (!/^[a-f0-9]{40}$/u.test(inventory?.revision ?? "")) {
      errors.push(`${repository}: inventory revision must be a full commit SHA`);
    }
    if (!Array.isArray(inventory?.trackedPaths)) {
      errors.push(`${repository}: trackedPaths must be an array`);
      continue;
    }
    const seenPaths = new Set();
    for (const trackedPath of inventory.trackedPaths) {
      if (!isSafeRepositoryPath(trackedPath)) {
        errors.push(`${repository}: inventory contains an unsafe path`);
      } else if (seenPaths.has(trackedPath)) {
        errors.push(`${repository}: inventory repeats ${trackedPath}`);
      }
      seenPaths.add(trackedPath);
    }
  }
  if (!Array.isArray(contract?.links)) {
    errors.push("links must be an array");
    return { errors, unavailable, checked };
  }

  for (const [index, link] of contract.links.entries()) {
    const label = link?.label ?? `link ${index + 1}`;
    const sourcePath = link?.sourcePath;
    if (!isSafeRepositoryPath(sourcePath)) {
      errors.push(`${label}: source path is unsafe`);
      continue;
    }
    if (!sourcePaths.has(sourcePath)) {
      errors.push(`${label}: source document is not git-tracked (${sourcePath})`);
      continue;
    }
    const sourceText = sourceFiles[sourcePath];
    if (typeof sourceText !== "string") {
      errors.push(`${label}: source document is unavailable (${sourcePath})`);
      continue;
    }

    if (link.externalUrl !== undefined) {
      if (link.repository !== undefined || link.path !== undefined) {
        errors.push(`${label}: use either an external URL or a repository path`);
        continue;
      }
      if (!safeExternalUrl(link.externalUrl)) {
        errors.push(`${label}: external URL is unsafe or not on the allowlist`);
        continue;
      }
      if (!sourceText.includes(link.externalUrl)) {
        errors.push(`${label}: source document does not contain the curated URL`);
        continue;
      }
      checked.push({ label, sourcePath, href: link.externalUrl, source: "approved URL" });
      continue;
    }

    if (
      !isSafeRepositorySlug(link.repository) ||
      link.repository.split("/")[0] !== EXPECTED_OWNER
    ) {
      errors.push(`${label}: repository must use the expected owner/name form`);
      continue;
    }
    if (!isSafeRepositoryPath(link.path)) {
      errors.push(`${label}: destination path is unsafe`);
      continue;
    }
    if (link.kind !== "blob" && link.kind !== "tree") {
      errors.push(`${label}: kind must be blob or tree`);
      continue;
    }
    if (
      link.fragment !== undefined &&
      (typeof link.fragment !== "string" ||
        !/^[A-Za-z0-9_-]+$/u.test(link.fragment))
    ) {
      errors.push(`${label}: fragment is unsafe`);
      continue;
    }

    const href = githubHref(link);
    if (!sourceText.includes(href)) {
      errors.push(`${label}: source document does not contain ${href}`);
      continue;
    }

    const localTree = normalizeTree(sourceTrees[link.repository]);
    const inventory = inventories[link.repository];
    const availableTree =
      localTree ??
      (Array.isArray(inventory?.trackedPaths)
        ? {
            paths: inventory.trackedPaths,
            contents: {},
            anchors: inventory.anchors ?? {},
            source: `pinned inventory ${inventory.revision ?? "without revision"}`,
          }
        : null);

    if (!availableTree) {
      unavailable.push({
        label,
        href,
        reason: `no sibling clone or sanitized inventory for ${link.repository}`,
      });
      continue;
    }
    if (!hasPath(availableTree.paths, link.path, link.kind)) {
      errors.push(`${label}: exact ${link.kind} path is absent from ${availableTree.source}`);
      continue;
    }
    if (link.fragment) {
      const knownAnchors = availableTree.anchors[link.path];
      const sourceMarkdown = availableTree.contents[link.path];
      const anchors =
        knownAnchors instanceof Set
          ? knownAnchors
          : Array.isArray(knownAnchors)
            ? new Set(knownAnchors)
            : typeof sourceMarkdown === "string"
              ? markdownAnchors(sourceMarkdown)
              : null;
      if (!anchors) {
        unavailable.push({
          label,
          href,
          reason: `anchor inventory is unavailable for ${link.repository}/${link.path}`,
        });
        continue;
      }
      if (!anchors.has(link.fragment)) {
        errors.push(`${label}: fragment #${link.fragment} is missing from ${link.path}`);
        continue;
      }
    }
    checked.push({ label, sourcePath, href, source: availableTree.source });
  }

  return { errors, unavailable, checked };
}

function runGit(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) return null;
  return result.stdout.trimEnd();
}

function findGitRoot(start) {
  return runGit(start, ["rev-parse", "--show-toplevel"]);
}

function trackedFiles(root) {
  const output = runGit(root, ["ls-files", "-z"]);
  return output === null ? [] : output.split("\0").filter(Boolean);
}

function siblingRepository(root, repository) {
  const repositoryName = repository.split("/")[1];
  let candidate = path.resolve(root);
  while (candidate !== path.dirname(candidate)) {
    const clone = path.join(candidate, repositoryName);
    if (fs.existsSync(path.join(clone, ".git"))) return clone;
    candidate = path.dirname(candidate);
  }
  return null;
}

function sourceTreeFromSibling(root, repository, relevantFiles) {
  const clone = siblingRepository(root, repository);
  if (!clone) return null;
  const revision = runGit(clone, ["rev-parse", "--verify", "origin/main^{commit}"]);
  if (!revision) return null;
  const pathsOutput = runGit(clone, ["ls-tree", "-r", "--name-only", revision]);
  if (pathsOutput === null) return null;
  const contents = {};
  for (const file of relevantFiles) {
    if (!pathsOutput.split("\n").includes(file)) continue;
    const content = runGit(clone, ["show", `${revision}:${file}`]);
    if (content !== null) contents[file] = content;
  }
  return {
    paths: pathsOutput.split("\n").filter(Boolean),
    contents,
    source: `sibling ${repository}@${revision.slice(0, 12)}`,
  };
}

function encodePath(value) {
  return value
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function checkPublicDestination(link) {
  const href = githubHref(link).split("#", 1)[0];
  try {
    const response = await fetch(href, {
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
      headers: { accept: "text/html" },
    });
    if (response.status === 404) {
      return { state: "error", reason: `public GitHub destination returned 404: ${href}` };
    }
    if (!response.ok) {
      return {
        state: "unavailable",
        reason: `public GitHub destination returned HTTP ${response.status}: ${href}`,
      };
    }
    if (link.fragment) {
      const rawUrl = `https://raw.githubusercontent.com/${link.repository}/main/${encodePath(link.path)}`;
      const raw = await fetch(rawUrl, { signal: AbortSignal.timeout(12000) });
      if (raw.status === 404) {
        return { state: "error", reason: `public raw destination returned 404: ${rawUrl}` };
      }
      if (!raw.ok) {
        return {
          state: "unavailable",
          reason: `public raw destination returned HTTP ${raw.status}: ${rawUrl}`,
        };
      }
      const anchors = markdownAnchors(await raw.text());
      if (!anchors.has(link.fragment)) {
        return {
          state: "error",
          reason: `public GitHub destination has no fragment #${link.fragment}: ${href}`,
        };
      }
    }
    return { state: "checked", reason: `public GitHub returned ${response.status}: ${href}` };
  } catch (error) {
    return {
      state: "unavailable",
      reason: `public GitHub could not be checked (${error.message}): ${href}`,
    };
  }
}

async function checkPublicExternalUrl(url) {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
      headers: { accept: "text/html" },
    });
    if (response.status === 404) {
      return { state: "error", reason: `approved public URL returned 404: ${url}` };
    }
    if (!response.ok) {
      return {
        state: "unavailable",
        reason: `approved public URL returned HTTP ${response.status}: ${url}`,
      };
    }
    return { state: "checked", reason: `approved public URL returned ${response.status}: ${url}` };
  } catch (error) {
    return {
      state: "unavailable",
      reason: `approved public URL could not be checked (${error.message}): ${url}`,
    };
  }
}

export async function runReviewerLinkCheck({
  root,
  contractPath,
  checkPublic = false,
}) {
  const repoRoot = root ?? findGitRoot(process.cwd());
  if (!repoRoot) throw new Error("could not find the current git checkout");
  const contractFile = contractPath ?? path.join(repoRoot, "portfolio/reviewer-links.json");
  const contract = JSON.parse(fs.readFileSync(contractFile, "utf8"));
  const sources = new Set(trackedFiles(repoRoot));
  const sourceFiles = {};
  for (const link of contract.links ?? []) {
    if (
      isSafeRepositoryPath(link.sourcePath) &&
      !sourceFiles[link.sourcePath] &&
      fs.existsSync(path.join(repoRoot, link.sourcePath))
    ) {
      sourceFiles[link.sourcePath] = fs.readFileSync(
        path.join(repoRoot, link.sourcePath),
        "utf8",
      );
    }
  }

  const sourceTrees = {};
  for (const repository of Object.keys(contract.repositories ?? {})) {
    if (
      !isSafeRepositorySlug(repository) ||
      repository.split("/")[0] !== EXPECTED_OWNER
    ) continue;
    const relevantFiles = (contract.links ?? [])
      .filter(
        (link) =>
          link.repository === repository &&
          link.kind === "blob" &&
          isSafeRepositoryPath(link.path),
      )
      .map((link) => link.path);
    const tree = sourceTreeFromSibling(repoRoot, repository, relevantFiles);
    if (tree) sourceTrees[repository] = tree;
  }

  const result = validateReviewerLinks(contract, {
    sourceTrackedPaths: sources,
    sourceFiles,
    sourceTrees,
  });
  const publicResults = [];
  if (checkPublic) {
    for (const link of contract.links ?? []) {
      if (typeof link.externalUrl === "string") {
        if (!safeExternalUrl(link.externalUrl)) continue;
        const checked = await checkPublicExternalUrl(link.externalUrl);
        publicResults.push({ label: link.label, ...checked });
        if (checked.state === "error") result.errors.push(checked.reason);
        if (checked.state === "unavailable") {
          result.unavailable.push({
            label: link.label,
            href: link.externalUrl,
            reason: checked.reason,
          });
        }
        continue;
      }
      if (
        typeof link.repository !== "string" ||
        !isSafeRepositorySlug(link.repository) ||
        link.repository.split("/")[0] !== EXPECTED_OWNER ||
        !isSafeRepositoryPath(link.path) ||
        !["blob", "tree"].includes(link.kind)
      ) continue;
      const checked = await checkPublicDestination(link);
      publicResults.push({ label: link.label, ...checked });
      if (checked.state === "error") result.errors.push(checked.reason);
      if (checked.state === "unavailable") {
        result.unavailable.push({ label: link.label, href: githubHref(link), reason: checked.reason });
      }
    }
  }
  return { ...result, publicResults };
}

async function main() {
  const args = process.argv.slice(2);
  const result = await runReviewerLinkCheck({
    checkPublic: args.includes("--check-public"),
  });
  for (const record of result.checked) {
    console.log(`PASS ${record.label}: ${record.href} (${record.source})`);
  }
  for (const item of result.unavailable) {
    console.log(`UNAVAILABLE ${item.label}: ${item.reason}`);
  }
  for (const item of result.publicResults) {
    if (item.state === "checked") console.log(`PUBLIC PASS ${item.label}: ${item.reason}`);
  }
  for (const error of result.errors) console.error(`FAIL ${error}`);
  console.log(
    `Curated routes: ${result.checked.length} inventory-checked, ${result.publicResults.filter((item) => item.state === "checked").length} public-checked, ${result.unavailable.length} unavailable, ${result.errors.length} failed.`,
  );
  if (result.errors.length > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`FAIL ${error.message}`);
    process.exitCode = 1;
  });
}
