const BASE_URL = 'https://api.github.com';
const BASE_HEADERS = Object.freeze({
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
});

export async function githubApiGet(
  path,
  { token, publicRead = false, fetchImpl = fetch } = {},
) {
  const headers = { ...BASE_HEADERS };
  if (!publicRead && token) headers.Authorization = `Bearer ${token}`;
  const response = await fetchImpl(`${BASE_URL}${path}`, { headers });
  if (!response.ok)
    throw new Error(
      `${path} returned ${response.status}: ${await response.text()}`,
    );
  return response.json();
}
