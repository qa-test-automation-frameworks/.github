#!/usr/bin/env bash
set -euo pipefail

tmp_root=$(mktemp -d)
trap 'rm -rf "$tmp_root"' EXIT

remote="$tmp_root/evidence.git"
writer="$tmp_root/writer"
stale_writer="$tmp_root/stale-writer"
branch='portfolio-evidence'
repo_path='repositories/example/framework'

git init --bare --initial-branch="$branch" "$remote" >/dev/null
git clone --quiet "$remote" "$writer"
git -C "$writer" config user.name 'portfolio atomicity test'
git -C "$writer" config user.email 'portfolio-atomicity@example.invalid'

mkdir -p "$writer/$repo_path/runs/1001/1"
printf '{"runId":"1001"}\n' > "$writer/$repo_path/runs/1001/1/manifest.json"
printf '{"runId":"1001"}\n' > "$writer/$repo_path/latest.json"
git -C "$writer" add "$repo_path"
git -C "$writer" commit -m 'seed evidence and index' >/dev/null
git -C "$writer" push --quiet --set-upstream origin "$branch"
base_sha=$(git -C "$writer" rev-parse HEAD)

git clone --quiet "$remote" "$stale_writer"
git -C "$stale_writer" config user.name 'stale portfolio writer'
git -C "$stale_writer" config user.email 'stale-writer@example.invalid'

mkdir -p "$writer/$repo_path/runs/1002/1"
printf '{"runId":"1002"}\n' > "$writer/$repo_path/runs/1002/1/manifest.json"
printf '{"runId":"1002"}\n' > "$writer/$repo_path/latest.json"
git -C "$writer" add "$repo_path"
git -C "$writer" commit -m 'publish bundle and latest index together' >/dev/null
candidate_sha=$(git -C "$writer" rev-parse HEAD)

cat > "$remote/hooks/pre-receive" <<'HOOK'
#!/usr/bin/env sh
cat >/dev/null
echo 'simulated remote receive failure' >&2
exit 1
HOOK
chmod +x "$remote/hooks/pre-receive"

if git -C "$writer" push --force-with-lease="refs/heads/$branch:$base_sha" \
  origin "HEAD:refs/heads/$branch" >/dev/null 2>&1; then
  echo 'FAIL: simulated rejected push unexpectedly succeeded' >&2
  exit 1
fi
remote_sha=$(git --git-dir="$remote" rev-parse "refs/heads/$branch")
[[ "$remote_sha" == "$base_sha" ]] || {
  echo 'FAIL: rejected push changed the remote branch ref' >&2
  exit 1
}
remote_latest=$(git --git-dir="$remote" show "refs/heads/$branch:$repo_path/latest.json")
[[ "$remote_latest" == '{"runId":"1001"}' ]] || {
  echo 'FAIL: rejected push changed latest.json' >&2
  exit 1
}
echo 'PASS: rejected receive leaves prior remote ref and latest index intact'

rm "$remote/hooks/pre-receive"
git -C "$writer" push --quiet \
  --force-with-lease="refs/heads/$branch:$base_sha" \
  origin "HEAD:refs/heads/$branch"
remote_sha=$(git --git-dir="$remote" rev-parse "refs/heads/$branch")
[[ "$remote_sha" == "$candidate_sha" ]] || {
  echo 'FAIL: successful push did not publish the candidate commit' >&2
  exit 1
}
remote_latest=$(git --git-dir="$remote" show "refs/heads/$branch:$repo_path/latest.json")
remote_manifest=$(git --git-dir="$remote" show \
  "refs/heads/$branch:$repo_path/runs/1002/1/manifest.json")
[[ "$remote_latest" == '{"runId":"1002"}' && "$remote_manifest" == '{"runId":"1002"}' ]] || {
  echo 'FAIL: successful commit did not publish bundle and latest index together' >&2
  exit 1
}
echo 'PASS: accepted ref update publishes the bundle and latest index in one commit'

mkdir -p "$stale_writer/$repo_path/runs/1003/1"
printf '{"runId":"1003"}\n' > "$stale_writer/$repo_path/runs/1003/1/manifest.json"
printf '{"runId":"1003"}\n' > "$stale_writer/$repo_path/latest.json"
git -C "$stale_writer" add "$repo_path"
git -C "$stale_writer" commit -m 'stale competing publication' >/dev/null
if git -C "$stale_writer" push --force-with-lease="refs/heads/$branch:$base_sha" \
  origin "HEAD:refs/heads/$branch" >/dev/null 2>&1; then
  echo 'FAIL: stale lease unexpectedly overwrote the newer evidence ref' >&2
  exit 1
fi
remote_sha_after_stale=$(git --git-dir="$remote" rev-parse "refs/heads/$branch")
[[ "$remote_sha_after_stale" == "$candidate_sha" ]] || {
  echo 'FAIL: stale lease changed the accepted remote ref' >&2
  exit 1
}
echo 'PASS: stale force-with-lease cannot replace a newer evidence ref'
