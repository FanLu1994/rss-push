import MarkdownIt from "markdown-it";

const md = new MarkdownIt({
  html: false,
  linkify: false,
  breaks: false,
});

function escapeMarkdown(text) {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/([`*_{}\[\]()#+\-.!>~|])/g, "\\$1")
    .trim();
}

function normalizeTelegramHtml(html) {
  return html
    .replace(/^\s*<p>/, "")
    .replace(/<\/p>\s*$/g, "")
    .replace(/<\/p>\s*<p>/g, "\n\n")
    .replace(/<br\s*\/?>/g, "\n")
    .trim();
}

export function renderBatch(nowIso, items) {
  const now = nowIso.slice(0, 16).replace("T", " ");
  const lines = [];
  lines.push(`**RSS 更新** (${escapeMarkdown(now)} UTC)`);
  lines.push("");

  for (const it of items) {
    const title = escapeMarkdown(it.ai.title_zh || it.article.title);
    const source = escapeMarkdown(it.article.source);
    const brief = escapeMarkdown(it.ai.brief);
    const link = String(it.article.link ?? "").trim();

    if (title) {
      lines.push(`**${title}**`);
    }
    if (source) {
      lines.push(`_来源: ${source}_`);
    }
    if (brief) {
      lines.push(brief);
    }
    if (link) {
      lines.push(`<${link}>`);
    }
    lines.push("");
  }

  return normalizeTelegramHtml(md.render(lines.join("\n").trim()));
}

export function chunkTelegram(text, maxLen = 3500) {
  const chunks = [];
  let cur = "";
  for (const line of text.split("\n")) {
    const next = cur ? `${cur}\n${line}` : line;
    if (next.length > maxLen) {
      if (cur) {
        chunks.push(cur);
        cur = line;
      } else {
        // Single line too long, hard split.
        chunks.push(line.slice(0, maxLen));
        cur = line.slice(maxLen);
      }
    } else {
      cur = next;
    }
  }
  if (cur) {
    chunks.push(cur);
  }
  return chunks;
}
