const LOCAL_FEEDBACK_API_PATH = '/api/feedback';

export const isNativeFeedbackRuntime = () => (
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
);

export async function submitFeedback(text: string) {
  if (isNativeFeedbackRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('submit_feedback', { text });
    return;
  }

  const response = await fetch(LOCAL_FEEDBACK_API_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error(`Feedback API failed with status ${response.status}`);
  }
}
