/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WEB_TRIAL_MODULE_BYPASS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Injected at build time via Vite `define`.
declare const __APP_VERSION__: string
