function parseJsonBlock(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI response is not JSON");
  }
  return JSON.parse(text.slice(start, end + 1));
}

function stripHtml(html) {
  return String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function buildPrompt(article) {
  const contentText = stripHtml(article.content_raw || "");
  const summaryText = stripHtml(article.summary_raw || "");
  // Prefer full content; fall back to summary snippet
  const body = contentText.length > summaryText.length ? contentText : summaryText;

  return [
    "你是一个资讯编辑，擅长将各类文章提炼为中文摘要。",
    "请基于给定文章信息输出 JSON（禁止输出额外文本）。",
    "所有字段必须使用中文。",
    "字段要求:",
    "title_zh: 无论原标题是什么语言，必须输出中文标题；若原标题已是中文则直接返回原文",
    "brief: 50-100字中文摘要，概括文章核心内容",
    "highlights: 2-4条中文要点数组，每条不超过30字",
    "why_it_matters: 1句中文，说明此文章的价值或意义",
    "tags: 1-4个中文标签数组",
    "",
    `标题: ${article.title}`,
    `来源: ${article.source}`,
    `发布时间: ${article.published_at || "未知"}`,
    `正文:\n${body.slice(0, 3000)}`,
  ].join("\n");
}

function fallback(article) {
  const brief = (article.summary_raw || "").replace(/\s+/g, " ").trim().slice(0, 80) || "暂无摘要";
  return {
    title_zh: String(article.title ?? "").trim(),
    brief,
    highlights: [],
    why_it_matters: "可作为信息追踪参考。",
    tags: [],
  };
}

export async function summarizeArticle(article, env) {
  if (!env.llmApiKey) {
    return fallback(article);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.aiTimeoutMs);
  try {
    const base = env.llmBaseUrl.replace(/\/$/, "");
    const resp = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.llmApiKey}`,
      },
      body: JSON.stringify({
        model: env.llmModel,
        temperature: 0.2,
        messages: [{ role: "user", content: buildPrompt(article) }],
      }),
    });

    if (!resp.ok) {
      throw new Error(`AI request failed with status ${resp.status}`);
    }

    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content ?? "";
    const parsed = parseJsonBlock(text);

    return {
      title_zh: String(parsed.title_zh ?? "").trim() || String(article.title ?? "").trim(),
      brief: String(parsed.brief ?? "").trim() || fallback(article).brief,
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights.map(String).slice(0, 4) : [],
      why_it_matters: String(parsed.why_it_matters ?? "").trim() || "可作为信息追踪参考。",
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 4) : [],
    };
  } catch (error) {
    console.warn(`[ai] summarize fallback: ${String(error?.message || error)}`);
    return fallback(article);
  } finally {
    clearTimeout(timer);
  }
}
