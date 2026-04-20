import dayjs from '@/lib/dayjs'
import { db } from '@/lib/db'

const STORAGE_KEYS = {
  INSTALL_DATE: 'app_install_date',
  SESSION_COUNT: 'app_session_count',
  LAST_SESSION_TIME: 'app_last_session_time',
  WAVE1_SUBMITTED: 'feedback_wave1_submitted',
  WAVE2_SUBMITTED: 'feedback_wave2_submitted',
}

export const incrementSessionCount = () => {
  const now = dayjs()
  const lastSessionTime = localStorage.getItem(STORAGE_KEYS.LAST_SESSION_TIME)
  const currentCount = parseInt(localStorage.getItem(STORAGE_KEYS.SESSION_COUNT) || '0')

  // Increment if no last session or last session was more than 30 minutes ago
  if (!lastSessionTime || now.diff(dayjs(lastSessionTime), 'minute') > 30) {
    localStorage.setItem(STORAGE_KEYS.SESSION_COUNT, (currentCount + 1).toString())
    localStorage.setItem(STORAGE_KEYS.LAST_SESSION_TIME, now.toISOString())
  }

  // Ensure install date is set
  if (!localStorage.getItem(STORAGE_KEYS.INSTALL_DATE)) {
    localStorage.setItem(STORAGE_KEYS.INSTALL_DATE, now.toISOString())
  }
}

export const getFeedbackStats = async () => {
  const installDate = localStorage.getItem(STORAGE_KEYS.INSTALL_DATE)
  const sessionCount = parseInt(localStorage.getItem(STORAGE_KEYS.SESSION_COUNT) || '0')
  const transactionCount = await db.transactions.count()
  const daysActive = installDate ? dayjs().diff(dayjs(installDate), 'day') : 0

  return {
    daysActive,
    sessionCount,
    transactionCount,
  }
}

export const shouldTriggerWave1 = async () => {
  const isSubmitted = localStorage.getItem(STORAGE_KEYS.WAVE1_SUBMITTED) === 'true'
  if (isSubmitted) return false

  const { transactionCount } = await getFeedbackStats()
  return transactionCount >= 1
}

export const shouldTriggerWave2 = async () => {
  const isSubmitted = localStorage.getItem(STORAGE_KEYS.WAVE2_SUBMITTED) === 'true'
  if (isSubmitted) return false

  const { daysActive, sessionCount, transactionCount } = await getFeedbackStats()
  
  // Wave 2: >= 21 days AND >= 5 sessions AND >= 1 transaction
  return daysActive >= 21 && sessionCount >= 5 && transactionCount >= 1
}

export const markFeedbackSubmitted = (wave: 1 | 2) => {
  if (wave === 1) {
    localStorage.setItem(STORAGE_KEYS.WAVE1_SUBMITTED, 'true')
  } else {
    localStorage.setItem(STORAGE_KEYS.WAVE2_SUBMITTED, 'true')
  }
}
