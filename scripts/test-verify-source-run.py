import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).with_name("verify-source-run.py")
SPEC = importlib.util.spec_from_file_location("verify_source_run", MODULE_PATH)
assert SPEC and SPEC.loader
VERIFY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFY)


class VerifySourceRunTests(unittest.TestCase):
    def setUp(self) -> None:
        self.workflow = {
            "id": 456,
            "name": "PR Gate",
            "path": ".github/workflows/pr-gate.yml",
        }
        self.run = {
            "id": 123,
            "repository": {"full_name": "qa-test-automation-frameworks/verity-policy-coverage-eval-framework"},
            "workflow_id": 456,
            "status": "completed",
            "head_branch": "main",
            "event": "push",
            "conclusion": "failure",
            "completed_at": "2026-10-16T12:00:00Z",
            "head_sha": "a" * 40,
            "run_attempt": 2,
            "html_url": "https://github.com/qa-test-automation-frameworks/verity-policy-coverage-eval-framework/actions/runs/123",
            "name": "PR Gate (Tier 1)",
        }
        self.environment = patch.dict(
            os.environ,
            {
                "GITHUB_REPOSITORY": self.run["repository"]["full_name"],
                "GITHUB_TOKEN": "test-token",
                "GITHUB_API_URL": "https://api.github.com",
            },
        )
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def test_writes_exact_failed_attempt_metadata_without_hiding_failure(self) -> None:
        calls = iter([self.workflow, self.run])
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "source.json"
            arguments = [
                "verify-source-run.py", "--run-id", "123", "--workflow-file",
                ".github/workflows/pr-gate.yml", "--output", str(output),
            ]
            with patch.object(sys, "argv", arguments), patch.object(VERIFY, "get_json", side_effect=lambda *_: next(calls)):
                VERIFY.main()
            metadata = json.loads(output.read_text())
        self.assertEqual(metadata["attempt"], 2)
        self.assertEqual(metadata["source-sha"], "a" * 40)
        self.assertEqual(metadata["conclusion"], "failure")
        self.assertEqual(metadata["event"], "push")

    def test_rejects_pull_request_runs_even_when_the_base_branch_is_main(self) -> None:
        run = {**self.run, "event": "pull_request"}
        calls = iter([self.workflow, run])
        with tempfile.TemporaryDirectory() as directory:
            arguments = [
                "verify-source-run.py", "--run-id", "123", "--workflow-file",
                "pr-gate.yml", "--output", str(Path(directory) / "source.json"),
            ]
            with patch.object(sys, "argv", arguments), patch.object(VERIFY, "get_json", side_effect=lambda *_: next(calls)):
                with self.assertRaisesRegex(SystemExit, "trusted event"):
                    VERIFY.main()

    def test_rejects_a_different_source_workflow(self) -> None:
        run = {**self.run, "workflow_id": 789}
        calls = iter([self.workflow, run])
        with tempfile.TemporaryDirectory() as directory:
            arguments = [
                "verify-source-run.py", "--run-id", "123", "--workflow-file",
                "pr-gate.yml", "--output", str(Path(directory) / "source.json"),
            ]
            with patch.object(sys, "argv", arguments), patch.object(VERIFY, "get_json", side_effect=lambda *_: next(calls)):
                with self.assertRaisesRegex(SystemExit, "different workflow"):
                    VERIFY.main()


if __name__ == "__main__":
    unittest.main()
