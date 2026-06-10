/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WEB_TRIAL_MODULE_BYPASS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
