import fs from "node:fs/promises";
import path from "node:path";

const STATE_DIR = "state";
const STATE_FILE = "processed.json";

function buildStatePath(cwd) {
  return path.join(cwd, STATE_DIR, STATE_FILE);
}

function normalizeFeedKey(feedUrl) {
  return String(feedUrl ?? "").trim().toLowerCase();
}

function getArticleKey(article) {
  return String(article?.id || article?.link || "").trim();
}

function getArticleTime(article) {
  const ts = Date.parse(article?.published_at ?? "");
  return Number.isFinite(ts) ? ts : 0;
}

function compareCursor(a, b) {
  const ta = getArticleTime(a);
  const tb = getArticleTime(b);
  if (ta !== tb) {
    return ta - tb;
  }

  const ka = getArticleKey(a);
  const kb = getArticleKey(b);
  return ka.localeCompare(kb);
}

function buildCursor(article) {
  return {
    published_at: String(article?.published_at ?? ""),
    article_id: String(article?.id ?? ""),
    article_link: String(article?.link ?? ""),
  };
}

function getFeedCursor(state, feedUrl) {
  const key = normalizeFeedKey(feedUrl);
  return key ? state.feeds[key] ?? null : null;
}

export async function loadState(cwd) {
  const p = buildStatePath(cwd);
  try {
    const raw = await fs.readFile(p, "utf8");
    const data = JSON.parse(raw);
    const feeds = data?.feeds && typeof data.feeds === "object" ? data.feeds : {};
    return { updated_at: data?.updated_at ?? "", feeds };
  } catch {
    return { updated_at: "", feeds: {} };
  }
}

export async function saveState(cwd, state) {
  const p = buildStatePath(cwd);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(state, null, 2) + "\n", "utf8");
}

export function isNewArticle(state, article) {
  const cursor = getFeedCursor(state, article?.feed_url);
  if (!cursor) {
    return true;
  }

  return compareCursor(article, {
    id: cursor.article_id,
    link: cursor.article_link,
    published_at: cursor.published_at,
  }) > 0;
}

export function markProcessed(state, articles) {
  const now = new Date().toISOString();
  const latestByFeed = new Map();

  for (const article of articles) {
    const feedKey = normalizeFeedKey(article?.feed_url);
    if (!feedKey) {
      continue;
    }

    const prev = latestByFeed.get(feedKey);
    if (!prev || compareCursor(article, prev) > 0) {
      latestByFeed.set(feedKey, article);
    }
  }

  for (const [feedKey, article] of latestByFeed) {
    state.feeds[feedKey] = buildCursor(article);
  }

  state.updated_at = now;
}
