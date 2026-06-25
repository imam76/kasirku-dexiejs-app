/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WEB_TRIAL_MODULE_BYPASS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Injected at build time via Vite `define` — format: v{major}.yy.mm.dd.HHmm
declare const __APP_VERSION__: string
