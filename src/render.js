function escapeMd(s) {
  return String(s ?? "")
    .replace(/([_\*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1")
    .trim();
}

export function renderBatch(nowIso, items) {
  const now = nowIso.slice(0, 16).replace("T", " ");
  const lines = [];
  lines.push(`*RSS 更新*  (${escapeMd(now)} UTC)`);
  lines.push("");

  for (const it of items) {
    const title = escapeMd(it.article.title);
    const source = escapeMd(it.article.source);
    const brief = escapeMd(it.ai.brief);
    const link = it.article.link;

    lines.push(`*${title}*`);
    lines.push(`_${source}_`);
    lines.push(brief);
    if (link) {
      lines.push(link);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
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
