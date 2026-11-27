/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APPWRITE_ENDPOINT?: string;
  readonly VITE_APPWRITE_PROJECT_ID?: string;
  readonly VITE_APPWRITE_DB?: string;
  readonly VITE_SEALLM_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
