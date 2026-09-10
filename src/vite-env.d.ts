/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WEB_TRIAL_MODULE_BYPASS?: string
  readonly VITE_BILLING_API_URL?: string
  readonly VITE_BILLING_SUPABASE_PUBLISHABLE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Injected at build time via Vite `define`.
declare const __APP_VERSION__: string
