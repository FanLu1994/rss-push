import fs from "node:fs/promises";
import path from "node:path";

const STATE_DIR = "state";
const STATE_FILE = "processed.json";

function buildStatePath(cwd) {
  return path.join(cwd, STATE_DIR, STATE_FILE);
}

export async function loadState(cwd) {
  const p = buildStatePath(cwd);
  try {
    const raw = await fs.readFile(p, "utf8");
    const data = JSON.parse(raw);
    const items = data?.items && typeof data.items === "object" ? data.items : {};
    return { updated_at: data?.updated_at ?? "", items };
  } catch {
    return { updated_at: "", items: {} };
  }
}

export async function saveState(cwd, state) {
  const p = buildStatePath(cwd);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(state, null, 2) + "\n", "utf8");
}

export function isNewArticle(state, id) {
  return !state.items[id];
}

export function markProcessed(state, ids) {
  const now = new Date().toISOString();
  for (const id of ids) {
    state.items[id] = now;
  }
  state.updated_at = now;
}

export function trimState(state, maxItems) {
  const entries = Object.entries(state.items);
  if (entries.length <= maxItems) {
    return;
  }

  entries.sort((a, b) => String(b[1]).localeCompare(String(a[1])));
  state.items = Object.fromEntries(entries.slice(0, maxItems));
}
