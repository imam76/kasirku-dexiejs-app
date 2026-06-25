import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { tanstackRouter } from '@tanstack/router-plugin/vite'

const host = process.env.TAURI_DEV_HOST;

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'),
) as { version: string };

// App version shown in the UI, format: v{major}.yy.mm.dd.HHmm (date/time = build time)
const buildAppVersion = (() => {
  const major = pkg.version.split('.')[0];
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `v${major}.${yy}.${mm}.${dd}.${time}`;
})();
const FEEDBACK_API_PATH = '/api/feedback';
const feedbackApiUrl = new URL('./api/feedback.js', import.meta.url).href;

type FeedbackResponse = ServerResponse & {
  status: (code: number) => FeedbackResponse;
  json: (body: unknown) => void;
};

type FeedbackHandler = (
  request: IncomingMessage,
  response: FeedbackResponse,
) => Promise<void>;

const withJsonResponseHelpers = (response: ServerResponse): FeedbackResponse => {
  const feedbackResponse = response as FeedbackResponse;

  feedbackResponse.status = (code: number) => {
    feedbackResponse.statusCode = code;
    return feedbackResponse;
  };

  feedbackResponse.json = (body: unknown) => {
    if (!feedbackResponse.headersSent) {
      feedbackResponse.setHeader('Content-Type', 'application/json');
    }
    feedbackResponse.end(JSON.stringify(body));
  };

  return feedbackResponse;
};

const feedbackApiDevPlugin = (): Plugin => ({
  name: 'frayukti-feedback-api-dev',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use(FEEDBACK_API_PATH, async (request: IncomingMessage, response: ServerResponse) => {
      try {
        const { default: feedbackHandler } = await import(feedbackApiUrl) as { default: FeedbackHandler };
        await feedbackHandler(request, withJsonResponseHelpers(response));
      } catch (error) {
        console.error('Local feedback API failed:', error);
        withJsonResponseHelpers(response)
          .status(500)
          .json({ error: 'Failed to submit feedback' });
      }
    });
  },
});

// https://vite.dev/config/
export default defineConfig(async () => {
  return {
    plugins: [feedbackApiDevPlugin(), tanstackRouter(), react()],

    define: {
      __APP_VERSION__: JSON.stringify(buildAppVersion),
    },

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
        protocol: "ws",
        host,
        port: 1421,
      }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    }
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
}});
