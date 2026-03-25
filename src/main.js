import process from "node:process";
import { summarizeArticle } from "./ai.js";
import { loadEnv, loadFeeds } from "./config.js";
import { renderBatch, chunkTelegram } from "./render.js";
import { fetchAllFeeds } from "./rss.js";
import { sendTelegramMessages } from "./telegram.js";
import { isNewArticle, loadState, markProcessed, saveState } from "./state.js";

function publishedAtMs(article) {
  return Date.parse(article?.published_at || "") || 0;
}

function sortByPublishedDesc(articles) {
  return articles.sort((a, b) => {
    return publishedAtMs(b) - publishedAtMs(a);
  });
}

function groupArticlesByFeed(articles) {
  const map = new Map();

  for (const article of articles) {
    const feedUrl = String(article.feed_url ?? "").trim();
    if (!feedUrl) {
      continue;
    }

    const group = map.get(feedUrl);
    if (group) {
      group.articles.push(article);
      continue;
    }

    map.set(feedUrl, {
      feedUrl,
      source: article.source,
      articles: [article],
    });
  }

  return [...map.values()].sort((a, b) => publishedAtMs(b.articles[0]) - publishedAtMs(a.articles[0]));
}

async function summarizeArticles(articles, env, concurrency = 3) {
  const results = new Array(articles.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= articles.length) {
        return;
      }

      const article = articles[current];
      const ai = await summarizeArticle(article, env);
      results[current] = { article, ai };
    }
  }

  const workerCount = Math.min(Math.max(concurrency, 1), articles.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function main() {
  const cwd = process.cwd();
  const env = loadEnv();
  const feeds = await loadFeeds(cwd);
  const state = await loadState(cwd);

  if (feeds.length === 0) {
    console.log("[main] no enabled feeds in feeds.yaml");
    return;
  }

  const feedResults = await fetchAllFeeds(feeds, env.rssFetchTimeoutMs);
  for (const r of feedResults) {
    if (r.error) {
      console.warn(`[rss] failed: ${r.feed.url} -> ${String(r.error.message || r.error)}`);
    }
  }

  const all = feedResults.flatMap((r) => r.articles);
  const fresh = sortByPublishedDesc(all).filter((a) => isNewArticle(state, a)).slice(0, env.maxItems);
  const groups = groupArticlesByFeed(fresh);

  if (fresh.length === 0) {
    console.log("[main] no new articles");
    return;
  }

  let totalSentArticles = 0;
  let totalSentChunks = 0;

  for (const group of groups) {
    const analyzed = await summarizeArticles(group.articles, env, 3);
    const message = renderBatch(new Date().toISOString(), analyzed);
    const chunks = chunkTelegram(message);
    const sent = await sendTelegramMessages(env, chunks);

    if (!sent) {
      console.log("[main] dry-run mode (telegram not configured), state not updated");
      return;
    }

    markProcessed(state, group.articles);
    await saveState(cwd, state);

    totalSentArticles += group.articles.length;
    totalSentChunks += chunks.length;
    console.log(
      `[main] pushed ${group.articles.length} article(s) for ${group.source || group.feedUrl}, message chunks=${chunks.length}`
    );
  }

  console.log(`[main] pushed ${totalSentArticles} new article(s), message chunks=${totalSentChunks}`);
}

main().catch((error) => {
  console.error("[fatal]", error);
  process.exitCode = 1;
});
