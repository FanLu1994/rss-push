function parseJsonBlock(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI response is not JSON");
  }
  return JSON.parse(text.slice(start, end + 1));
}

function buildPrompt(article) {
  return [
    "你是一个技术资讯编辑。",
    "请基于给定文章信息输出 JSON（禁止输出额外文本）。",
    "字段要求:",
    "title_zh: 标题中文化结果；如果原标题是英文，翻译成简洁自然的中文标题；如果原标题已经是中文、或不适合翻译，则返回原标题",
    "brief: 40-80字中文简介",
    "highlights: 2-4条中文要点数组",
    "why_it_matters: 1句中文，说明价值",
    "tags: 1-4个标签数组",
    "",
    `标题: ${article.title}`,
    `来源: ${article.source}`,
    `发布时间: ${article.published_at || "未知"}`,
    `摘要: ${(article.summary_raw || "").slice(0, 1200)}`,
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
