import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";

const DEFAULTS = {
  maxItems: 20,
  rssFetchTimeoutMs: 15_000,
  aiTimeoutMs: 30_000,
  stateMaxItems: 5000,
  opmlFile: "subscriptions.opml",
};

const PROVIDER_DEFAULTS = {
  glm: {
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-flash",
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
  },
};

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function readIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

function unescapeXml(s) {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function parseOpmlOutlines(opmlRaw) {
  const feeds = [];
  const outlineRegex = /<outline\b[^>]*>/gi;
  const attrRegex = /([a-zA-Z_:][\w:.-]*)\s*=\s*(["'])(.*?)\2/g;

  let match;
  while ((match = outlineRegex.exec(opmlRaw)) !== null) {
    const tag = match[0];
    const attrs = {};

    let attrMatch;
    while ((attrMatch = attrRegex.exec(tag)) !== null) {
      attrs[attrMatch[1]] = unescapeXml(attrMatch[3]);
    }

    const url = attrs.xmlUrl || attrs.url || "";
    if (!/^https?:\/\//i.test(url)) {
      continue;
    }

    const name = attrs.title || attrs.text || attrs.description || url;
    feeds.push({ name, url, enabled: true });
  }

  return feeds;
}

function normalizeYamlFeeds(data) {
  const feeds = Array.isArray(data?.feeds) ? data.feeds : [];
  return feeds
    .filter((f) => f?.enabled !== false && typeof f?.url === "string")
    .map((f) => ({
      name: f.name || f.title || f.url,
      url: String(f.url).trim(),
      enabled: true,
    }))
    .filter((f) => /^https?:\/\//i.test(f.url));
}

function dedupeFeeds(feeds) {
  const map = new Map();
  for (const feed of feeds) {
    const key = feed.url.toLowerCase();
    if (!map.has(key)) {
      map.set(key, feed);
    }
  }
  return [...map.values()];
}

function pickProvider() {
  const raw = (process.env.LLM_PROVIDER || "glm").toLowerCase();
  return raw in PROVIDER_DEFAULTS ? raw : "glm";
}

export async function loadFeeds(cwd = process.cwd()) {
  const yamlFile = path.join(cwd, "feeds.yaml");
  const opmlFileName = process.env.OPML_FILE || DEFAULTS.opmlFile;
  const opmlFile = path.join(cwd, opmlFileName);

  const [yamlRaw, opmlRaw] = await Promise.all([readIfExists(yamlFile), readIfExists(opmlFile)]);

  const yamlFeeds = yamlRaw ? normalizeYamlFeeds(YAML.parse(yamlRaw) ?? {}) : [];
  const opmlFeeds = opmlRaw ? parseOpmlOutlines(opmlRaw) : [];

  const merged = dedupeFeeds([...opmlFeeds, ...yamlFeeds]);
  if (merged.length === 0) {
    throw new Error(`No feeds found. Provide ${opmlFileName} or feeds.yaml with enabled feeds.`);
  }

  return merged;
}

export function loadEnv() {
  const llmProvider = pickProvider();
  const providerDefaults = PROVIDER_DEFAULTS[llmProvider];

  const llmApiKey =
    process.env.LLM_API_KEY ||
    process.env.GLM_API_KEY ||
    process.env.OPENAI_API_KEY ||
    "";

  const llmModel =
    process.env.LLM_MODEL ||
    process.env.GLM_MODEL ||
    process.env.OPENAI_MODEL ||
    providerDefaults.model;

  const llmBaseUrl =
    process.env.LLM_BASE_URL ||
    process.env.GLM_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    providerDefaults.baseUrl;

  return {
    llmProvider,
    llmApiKey,
    llmModel,
    llmBaseUrl,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
    telegramChatId: process.env.TELEGRAM_CHAT_ID ?? "",
    maxItems: toNumber(process.env.MAX_ITEMS, DEFAULTS.maxItems),
    rssFetchTimeoutMs: toNumber(process.env.RSS_FETCH_TIMEOUT_MS, DEFAULTS.rssFetchTimeoutMs),
    aiTimeoutMs: toNumber(process.env.AI_TIMEOUT_MS, DEFAULTS.aiTimeoutMs),
    stateMaxItems: toNumber(process.env.STATE_MAX_ITEMS, DEFAULTS.stateMaxItems),
  };
}
