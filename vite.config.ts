import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { tanstackRouter } from '@tanstack/router-plugin/vite'

const host = process.env.TAURI_DEV_HOST;

const readJsonIfExists = <T>(path: URL): T | null => {
  const resolvedPath = fileURLToPath(path);
  if (!existsSync(resolvedPath)) return null;

  return JSON.parse(readFileSync(resolvedPath, 'utf-8')) as T;
};

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'),
) as { version: string };

const tauriConfig = readJsonIfExists<{ version?: string }>(
  new URL('./src-tauri/tauri.conf.json', import.meta.url),
);

const appVersion = tauriConfig?.version ?? pkg.version;
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
      __APP_VERSION__: JSON.stringify(appVersion),
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
