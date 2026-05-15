import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const TELEGRAM_SEND_MESSAGE_URL = (token) => `https://api.telegram.org/bot${token}/sendMessage`
const ENV_FILES = ['.env.local', '.env']

const parseEnvLine = (line) => {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null

  const separatorIndex = trimmed.indexOf('=')
  if (separatorIndex === -1) return null

  const key = trimmed.slice(0, separatorIndex).trim()
  let value = trimmed.slice(separatorIndex + 1).trim()

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }

  return key ? [key, value] : null
}

const loadLocalEnv = () => {
  for (const file of ENV_FILES) {
    const filePath = resolve(process.cwd(), file)
    if (!existsSync(filePath)) continue

    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/)
    for (const line of lines) {
      const parsed = parseEnvLine(line)
      if (!parsed) continue

      const [key, value] = parsed
      if (process.env[key] === undefined) {
        process.env[key] = value
      }
    }
  }
}

const getTelegramConfig = () => {
  loadLocalEnv()

  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  }
}

const readJsonBody = async (request) => {
  if (typeof request.body === 'string') {
    return request.body ? JSON.parse(request.body) : {}
  }

  if (Buffer.isBuffer(request.body)) {
    return JSON.parse(request.body.toString('utf8'))
  }

  if (request.body && typeof request.body === 'object') {
    return request.body
  }

  const chunks = []
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk))
  }

  if (!chunks.length) {
    return {}
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Method not allowed' })
  }

  const { botToken, chatId } = getTelegramConfig()

  if (!botToken || !chatId) {
    console.error('Telegram feedback env vars are missing', {
      hasBotToken: Boolean(botToken),
      hasChatId: Boolean(chatId),
    })
    return response.status(500).json({ error: 'Feedback service is not configured' })
  }

  try {
    const { text } = await readJsonBody(request)

    if (typeof text !== 'string' || !text.trim()) {
      return response.status(400).json({ error: 'Feedback message is required' })
    }

    const telegramResponse = await fetch(TELEGRAM_SEND_MESSAGE_URL(botToken), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    })

    if (!telegramResponse.ok) {
      const body = await telegramResponse.text()
      console.error('Telegram feedback request failed:', body)
      return response.status(502).json({ error: 'Failed to send feedback' })
    }

    return response.status(200).json({ ok: true })
  } catch (error) {
    console.error('Feedback submission failed:', error)
    return response.status(500).json({ error: 'Failed to submit feedback' })
  }
}
