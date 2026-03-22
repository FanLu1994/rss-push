# rss_push

基于 GitHub Actions 的 RSS 增量聚合与 Telegram 推送骨架：

1. 定时抓取 RSS 源（支持 `subscriptions.opml` 和 `feeds.yaml`）。
2. 根据 `state/processed.json` 去重，仅处理新文章。
3. 调用 LLM 生成中文简介（失败自动降级到原摘要）。
4. 汇总消息并通过 Telegram Bot 发送。

## 目录

- `src/main.js`: 主流程编排
- `src/rss.js`: RSS 抓取与标准化
- `src/ai.js`: LLM 摘要
- `src/render.js`: 消息渲染与拆分
- `src/telegram.js`: Telegram 发送
- `src/state.js`: 去重状态读写
- `src/config.js`: 配置与 OPML/YAML 源加载
- `subscriptions.opml`: OPML 订阅样例
- `feeds.yaml`: YAML 订阅样例（可选）
- `state/processed.json`: 已处理文章状态
- `.github/workflows/rss-push.yml`: 定时任务

## 本地运行

```bash
npm install
npm run start
```

## RSS 配置

默认会读取两种来源并合并去重（按 URL 去重）：

- `subscriptions.opml`（默认主来源）
- `feeds.yaml`（可选补充）

你可以用环境变量自定义 OPML 文件名：

- `OPML_FILE`（默认 `subscriptions.opml`）

如果你只想维护 OPML，保留 `subscriptions.opml` 即可；`feeds.yaml` 可以不使用。

## LLM 配置（GLM 推荐）

默认 provider 是 `glm`，默认模型与地址如下：

- `LLM_PROVIDER=glm`
- `LLM_MODEL=glm-4-flash`
- `LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4`

你至少需要配置：

- `LLM_API_KEY`

完整变量参考 `.env.example`。

## GitHub 配置

在仓库 `Settings -> Secrets and variables -> Actions` 中设置：

- Secrets:
  - `LLM_API_KEY`（推荐）
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_CHAT_ID`
- Variables（可选）:
  - `LLM_PROVIDER`（默认 `glm`）
  - `LLM_MODEL`（默认 `glm-4-flash`）
  - `LLM_BASE_URL`（默认 `https://open.bigmodel.cn/api/paas/v4`）
  - `MAX_ITEMS`
  - `RSS_FETCH_TIMEOUT_MS`
  - `AI_TIMEOUT_MS`
  - `STATE_MAX_ITEMS`
  - `OPML_FILE`

兼容旧变量：`OPENAI_*` 和 `GLM_*` 仍可用，但建议统一迁移到 `LLM_*`。

## 说明

这是实现骨架，便于你继续扩展：

- 多模型路由
- 更强的 Prompt 与 JSON Schema 校验
- 按主题分组推送
- 周报/月报汇总
