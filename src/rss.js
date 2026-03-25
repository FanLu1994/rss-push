import crypto from "node:crypto";
import Parser from "rss-parser";

function timeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

function withTimeout(task, signal) {
  return Promise.race([
    task,
    new Promise((_, reject) => {
      signal.addEventListener(
        "abort",
        () => reject(new Error("RSS fetch timeout")),
        { once: true }
      );
    }),
  ]);
}

function safeDate(value) {
  const t = Date.parse(value ?? "");
  return Number.isFinite(t) ? new Date(t).toISOString() : "";
}

function buildArticleId(item, sourceName) {
  const stable = item.guid || item.id || item.link;
  if (stable) {
    return String(stable).trim();
  }

  const raw = `${sourceName}|${item.title ?? ""}|${item.pubDate ?? ""}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function fetchFeedArticles(feed, timeoutMs) {
  const parser = new Parser();
  const { signal, cancel } = timeoutSignal(timeoutMs);
  try {
    const parsed = await withTimeout(parser.parseURL(feed.url), signal);
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return items.map((item) => ({
      id: buildArticleId(item, feed.name ?? feed.url),
      feed_url: feed.url,
      source: feed.name ?? parsed.title ?? feed.url,
      title: item.title ?? "(untitled)",
      link: item.link ?? "",
      published_at: safeDate(item.isoDate ?? item.pubDate),
      summary_raw: item.contentSnippet ?? item.summary ?? item.content ?? "",
      content_raw: item.content ?? "",
    }));
  } finally {
    cancel();
  }
}

export async function fetchAllFeeds(feeds, timeoutMs) {
  const tasks = feeds.map(async (feed) => {
    try {
      const articles = await fetchFeedArticles(feed, timeoutMs);
      return { feed, articles, error: null };
    } catch (error) {
      return { feed, articles: [], error };
    }
  });
  return Promise.all(tasks);
}
