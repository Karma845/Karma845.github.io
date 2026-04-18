// github.js — GitHub API helper for AnimeStuff Update Panel

const GitHub = (() => {
  const API = "https://api.github.com";

  function headers(token) {
    return {
      Authorization: "token " + token,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    };
  }

  /**
   * Fetch a file from the repo.
   * Returns { sha, content (decoded string) } or { sha: null, content: null } if missing.
   */
  async function getFile(token, repo, path, branch) {
    const url = `${API}/repos/${repo}/contents/${path}?ref=${branch}`;
    const res = await fetch(url, { headers: headers(token) });

    if (res.status === 404) return { sha: null, content: null };
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.message || `HTTP ${res.status} fetching ${path}`);
    }

    const data = await res.json();
    const content = decodeURIComponent(
      escape(atob(data.content.replace(/\n/g, "")))
    );
    return { sha: data.sha, content };
  }

  /**
   * Create or update a file in the repo.
   * If sha is null, creates the file. Otherwise updates it.
   */
  async function putFile(token, repo, path, content, message, sha, branch) {
    const url = `${API}/repos/${repo}/contents/${path}`;
    const body = {
      message,
      content: btoa(unescape(encodeURIComponent(content))),
      branch,
    };
    if (sha) body.sha = sha;

    const res = await fetch(url, {
      method: "PUT",
      headers: headers(token),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.message || `HTTP ${res.status} writing ${path}`);
    }
    return res.json();
  }

  /**
   * Verify token + repo are valid by hitting the repo endpoint.
   */
  async function testConnection(token, repo) {
    const res = await fetch(`${API}/repos/${repo}`, { headers: headers(token) });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.message || `HTTP ${res.status}`);
    }
    return res.json();
  }

  /**
   * Load and parse a JSON file from the repo.
   * Returns { sha, data } where data is the parsed JS value.
   * If the file doesn't exist, returns { sha: null, data: defaultValue }.
   */
  async function getJSON(token, repo, path, branch, defaultValue = []) {
    const { sha, content } = await getFile(token, repo, path, branch);
    if (content === null) return { sha: null, data: defaultValue };
    try {
      return { sha, data: JSON.parse(content) };
    } catch {
      return { sha, data: defaultValue };
    }
  }

  /**
   * Write a JS value as JSON to the repo.
   */
  async function putJSON(token, repo, path, data, message, sha, branch) {
    return putFile(token, repo, path, JSON.stringify(data, null, 2), message, sha, branch);
  }

  return { getFile, putFile, testConnection, getJSON, putJSON };
})();
