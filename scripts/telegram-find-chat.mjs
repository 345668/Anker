#!/usr/bin/env node
/**
 * Prints the chat id to use as TELEGRAM_CHAT_ID. Send any message to your bot first, then run:
 *   TELEGRAM_BOT_TOKEN=<token> node scripts/telegram-find-chat.mjs
 * The token is read from the environment so it does not land in your shell history.
 */
const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim()
if (!token) { console.error("Set TELEGRAM_BOT_TOKEN first."); process.exit(2) }
const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`)
const body = await res.json().catch(() => ({}))
if (!body.ok) { console.error(`Telegram said no (${res.status}): ${body.description ?? "unknown error"}. Check the token.`); process.exit(1) }
const chats = new Map()
for (const u of body.result ?? []) { const c = u.message?.chat ?? u.channel_post?.chat ?? u.my_chat_member?.chat; if (c) chats.set(c.id, c) }
if (!chats.size) { console.error("No messages yet. Open your bot in Telegram, press Start, send it a message, then run this again."); process.exit(1) }
for (const c of chats.values()) console.log(`TELEGRAM_CHAT_ID=${c.id}   (${c.type}${c.title ? `, ${c.title}` : c.first_name ? `, ${c.first_name}` : ""})`)
