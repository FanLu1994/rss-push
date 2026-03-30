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
  const bodySparse = body.trim().length < 50;

  return [
    "你是一个资讯编辑，擅长将各类文章提炼为中文摘要。",
    "请基于给定文章信息输出 JSON（禁止输出额外文本）。",
    "所有字段必须使用中文。",
    "字段要求:",
    "title_zh: 【必填，不可省略】无论原标题是什么语言，必须翻译并输出中文标题；若原标题已是中文则直接返回原文",
    "brief: 50-100字中文摘要，概括文章核心内容；若正文不足，则根据标题和来源推断文章可能的内容进行描述",
    "highlights: 2-4条中文要点数组，每条不超过30字；若正文不足，根据标题推断关键看点",
    "why_it_matters: 1句中文，说明此文章的价值或意义",
    "tags: 1-4个中文标签数组",
    ...(bodySparse ? ["", "注意：正文内容较少，请务必根据标题和来源来推断并生成完整的中文摘要，不要直接复制正文。"] : []),
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

async function callAi(article, env, attempt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.aiTimeoutMs);
  const base = env.llmBaseUrl.replace(/\/$/, "");
  const url = `${base}/chat/completions`;
  console.log(`[ai] attempt=${attempt} model=${env.llmModel} title="${article.title}"`);
  try {
    const resp = await fetch(url, {
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
      const body = await resp.text().catch(() => "");
      throw new Error(`HTTP ${resp.status}: ${body.slice(0, 200)}`);
    }

    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content ?? "";
    console.log(`[ai] attempt=${attempt} ok, raw response length=${text.length}`);
    const parsed = parseJsonBlock(text);

    const result = {
      title_zh: String(parsed.title_zh ?? "").trim() || String(article.title ?? "").trim(),
      brief: String(parsed.brief ?? "").trim() || fallback(article).brief,
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights.map(String).slice(0, 4) : [],
      why_it_matters: String(parsed.why_it_matters ?? "").trim() || "可作为信息追踪参考。",
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 4) : [],
    };
    console.log(`[ai] attempt=${attempt} parsed title_zh="${result.title_zh}"`);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

export async function summarizeArticle(article, env) {
  if (!env.llmApiKey) {
    console.warn("[ai] no API key configured, skipping AI summarization");
    return fallback(article);
  }

  console.log(`[ai] provider=${env.llmProvider} model=${env.llmModel} baseUrl=${env.llmBaseUrl} timeoutMs=${env.aiTimeoutMs}`);
  try {
    return await callAi(article, env, 1);
  } catch (firstError) {
    console.warn(`[ai] attempt=1 failed: ${String(firstError?.message || firstError)}`);
    try {
      return await callAi(article, env, 2);
    } catch (error) {
      console.warn(`[ai] attempt=2 failed: ${String(error?.message || error)}, using fallback`);
      return fallback(article);
    }
  }
}
