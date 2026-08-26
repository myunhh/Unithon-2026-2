interface ImportMetaEnv {
  readonly VITE_PUBLIC_API_URL?: string
  readonly VITE_ENABLE_REACT_DEVTOOLS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
