async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendTelegramMessages(env, messages) {
  if (!env.telegramBotToken || !env.telegramChatId) {
    console.log("[telegram] missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID, skip send.");
    return false;
  }

  const url = `https://api.telegram.org/bot${env.telegramBotToken}/sendMessage`;

  for (const text of messages) {
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: env.telegramChatId,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
        });

        if (resp.status === 429) {
          const body = await resp.json().catch(() => ({}));
          const retryAfter = Number(body?.parameters?.retry_after ?? 1);
          await sleep(Math.max(retryAfter, 1) * 1000);
          continue;
        }

        if (!resp.ok) {
          const bodyText = await resp.text().catch(() => "");
          throw new Error(
            `sendMessage failed status=${resp.status}${bodyText ? ` body=${bodyText}` : ""}`
          );
        }

        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        await sleep(1000 * attempt);
      }
    }

    if (lastError) {
      throw lastError;
    }
  }

  return true;
}
