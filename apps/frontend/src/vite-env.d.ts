/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Secret base path the admin panel is mounted under in production (e.g. "/control-a7f3k9"). */
  readonly VITE_ADMIN_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
