/**
 * The provider process needs only enough ambient state to locate its own binary
 * dependencies and cached desktop credentials. All application and provider
 * secrets stay in the Electron main process.
 */
const PROVIDER_ENVIRONMENT_NAMES = new Set([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'LANG',
  'LANGUAGE',
  'TMPDIR',
  'TMP',
  'TEMP',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_CACHE_HOME',
  'XDG_RUNTIME_DIR',
  'DBUS_SESSION_BUS_ADDRESS',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'APPDATA',
  'LOCALAPPDATA',
  'SYSTEMROOT',
  'WINDIR',
  'COMSPEC',
  'PATHEXT',
])

const EXCLUDED_PREFIXES = [
  'PAPERBRIDGE_',
  'SUPABASE_',
  'OPENAI_',
  'ANTHROPIC_',
  'GOOGLE_',
  'GEMINI_',
  'CLAUDE_',
  'AWS_',
  'AZURE_',
  'GITHUB_',
  'GITLAB_',
  'HUGGINGFACE_',
  'HF_',
  'ELECTRON_',
]

const SENSITIVE_NAME = /(?:^|_)(?:API_?KEY|ACCESS_?KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|PRIVATE_?KEY|SESSION|ENCRYPTION)(?:_|$)/i

function normalizeEnvironmentName(name: string): string {
  return name.toUpperCase()
}

/** Kept exported so integration tests can assert the credential boundary. */
export function isProviderEnvironmentNameAllowed(name: string): boolean {
  const normalized = normalizeEnvironmentName(name)
  // This exact socket address is needed by Linux credential stores; it is an
  // allowlisted transport endpoint, not a session credential itself.
  if (PROVIDER_ENVIRONMENT_NAMES.has(normalized)) return true
  if (SENSITIVE_NAME.test(normalized)) return false
  if (EXCLUDED_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return false
  return normalized.startsWith('LC_')
}

/**
 * Copy a narrow compatibility allowlist instead of passing `process.env` to an
 * untrusted local CLI. The caller may supply a fixture environment for tests.
 */
export function buildProviderEnvironment(parent: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {}
  for (const [name, value] of Object.entries(parent)) {
    if (value !== undefined && isProviderEnvironmentNameAllowed(name)) environment[name] = value
  }
  return environment
}
