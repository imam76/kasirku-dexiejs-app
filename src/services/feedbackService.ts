const LOCAL_FEEDBACK_API_PATH = '/api/feedback';
export const FEEDBACK_REQUEST_TIMEOUT_MS = 20_000;

export const isNativeFeedbackRuntime = () => (
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
);

const timeoutError = () => new Error('Feedback request timed out');

async function withFeedbackTimeout<T>(request: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(timeoutError()), FEEDBACK_REQUEST_TIMEOUT_MS);
  });

  try {
    return await Promise.race([request, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export async function submitFeedback(text: string) {
  if (isNativeFeedbackRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await withFeedbackTimeout(invoke('submit_feedback', { text }));
    return;
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), FEEDBACK_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(LOCAL_FEEDBACK_API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: abortController.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`Feedback API failed with status ${response.status}`);
  }
}
