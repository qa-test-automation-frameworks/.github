#!/usr/bin/env python3
"""Verify GitHub workflow-run provenance before any privileged publication."""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


def get_json(url: str, token: str) -> dict:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "qa-portfolio-evidence-publisher",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.load(response)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        raise SystemExit(f"GitHub provenance request failed: {error}") from error


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--workflow-file", required=True)
    parser.add_argument("--output", required=True)
    arguments = parser.parse_args()

    repository = os.environ.get("GITHUB_REPOSITORY", "")
    token = os.environ.get("GITHUB_TOKEN", "")
    api = os.environ.get("GITHUB_API_URL", "https://api.github.com").rstrip("/")
    if not repository.startswith("qa-test-automation-frameworks/") or not token:
        raise SystemExit("Expected the portfolio repository and a read-scoped GITHUB_TOKEN.")

    if not re.fullmatch(r"(?:\.github/workflows/)?[A-Za-z0-9_.-]+\.ya?ml", arguments.workflow_file):
        raise SystemExit("Workflow file must be a YAML file in .github/workflows.")
    workflow_ref = urllib.parse.quote(Path(arguments.workflow_file).name, safe="")
    workflow = get_json(f"{api}/repos/{repository}/actions/workflows/{workflow_ref}", token)
    if workflow.get("path") != f".github/workflows/{Path(arguments.workflow_file).name}":
        raise SystemExit("Resolved workflow path does not match the requested source file.")
    run = get_json(f"{api}/repos/{repository}/actions/runs/{arguments.run_id}", token)
    if str(run.get("id")) != arguments.run_id:
        raise SystemExit("Source run ID does not match the requested run.")
    if run.get("repository", {}).get("full_name") != repository:
        raise SystemExit("Source run belongs to a different repository.")
    if run.get("workflow_id") != workflow.get("id"):
        raise SystemExit("Source run was produced by a different workflow file.")
    if run.get("status") != "completed":
        raise SystemExit("Source workflow run is not completed.")
    if run.get("head_branch") != "main":
        raise SystemExit("Only source runs on main may be published.")
    if run.get("event") not in {"push", "schedule", "workflow_dispatch"}:
        raise SystemExit("Source event is not an approved trusted event.")
    if run.get("conclusion") not in {
        "success",
        "failure",
        "cancelled",
        "timed_out",
        "action_required",
    }:
        raise SystemExit("Source workflow conclusion is missing or unsupported.")
    completed_at = run.get("completed_at") or run.get("updated_at")
    if not completed_at:
        raise SystemExit("Source run has no completion time.")
    parsed = datetime.fromisoformat(completed_at.replace("Z", "+00:00"))
    completed_at = parsed.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")

    metadata = {
        "repository": repository,
        "run-id": str(run["id"]),
        "attempt": int(run["run_attempt"]),
        "source-sha": run["head_sha"],
        "event": run["event"],
        "branch": run["head_branch"],
        "workflow-name": run.get("name") or workflow.get("name") or arguments.workflow_file,
        "conclusion": run["conclusion"],
        "completed-at": completed_at,
        "run-url": run["html_url"],
    }
    output = Path(arguments.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(
        "Verified trusted source run {} attempt {} from {} ({}, {}).".format(
            metadata["run-id"], metadata["attempt"], arguments.workflow_file,
            metadata["event"], metadata["conclusion"],
        )
    )


if __name__ == "__main__":
    try:
        main()
    except (KeyError, TypeError, ValueError) as error:
        print(f"Invalid source run metadata: {error}", file=sys.stderr)
        raise SystemExit(1) from error
