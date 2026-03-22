import process from "node:process";
import { summarizeArticle } from "./ai.js";
import { loadEnv, loadFeeds } from "./config.js";
import { renderBatch, chunkTelegram } from "./render.js";
import { fetchAllFeeds } from "./rss.js";
import { sendTelegramMessages } from "./telegram.js";
import { isNewArticle, loadState, markProcessed, saveState, trimState } from "./state.js";

function sortByPublishedDesc(articles) {
  return articles.sort((a, b) => {
    const ta = Date.parse(a.published_at || "") || 0;
    const tb = Date.parse(b.published_at || "") || 0;
    return tb - ta;
  });
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
  const fresh = sortByPublishedDesc(all).filter((a) => isNewArticle(state, a.id)).slice(0, env.maxItems);

  if (fresh.length === 0) {
    console.log("[main] no new articles");
    return;
  }

  const analyzed = [];
  for (const article of fresh) {
    const ai = await summarizeArticle(article, env);
    analyzed.push({ article, ai });
  }

  const message = renderBatch(new Date().toISOString(), analyzed);
  const chunks = chunkTelegram(message);
  const sent = await sendTelegramMessages(env, chunks);

  if (!sent) {
    console.log("[main] dry-run mode (telegram not configured), state not updated");
    return;
  }

  markProcessed(state, fresh.map((x) => x.id));
  trimState(state, env.stateMaxItems);
  await saveState(cwd, state);

  console.log(`[main] pushed ${fresh.length} new article(s), message chunks=${chunks.length}`);
}

main().catch((error) => {
  console.error("[fatal]", error);
  process.exitCode = 1;
});
