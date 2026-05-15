const TELEGRAM_SEND_MESSAGE_URL = (token) => `https://api.telegram.org/bot${token}/sendMessage`

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

  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!botToken || !chatId) {
    console.error('Telegram feedback env vars are missing')
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
