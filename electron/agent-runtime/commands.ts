import type { AgentRunOptions } from './contracts.js'

/** Command construction is isolated so product integration can revise CLI flags without touching parsers. */
export function buildAgyArgs(options: AgentRunOptions): readonly string[] {
  const args: string[] = [
    '-p', options.prompt,
    '--output-format', 'stream-json',
    '--mode', 'plan',
    '--sandbox',
    '--disable-slash-commands',
  ]
  if (options.model) args.push('--model', options.model)
  if (options.effort) args.push('--effort', options.effort)
  if (options.agent) args.push('--agent', options.agent)
  if (options.conversationId) args.push('--conversation', options.conversationId)
  if (options.printTimeout) args.push('--print-timeout', options.printTimeout)
  return args
}

export function buildClaudeCodeArgs(options: AgentRunOptions): readonly string[] {
  const args: string[] = [
    '-p', options.prompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--permission-mode', 'plan',
  ]
  if (options.model) args.push('--model', options.model)
  return args
}

export function buildCodexArgs(options: AgentRunOptions): readonly string[] {
  // `read-only` keeps the first desktop integration from granting write access.
  const args: string[] = ['exec', '--json', '--sandbox', 'read-only']
  if (options.model) args.push('--model', options.model)
  // Codex accepts an optional positional prompt. The end-of-options marker
  // prevents a renderer prompt such as --dangerously-bypass-approvals-and-sandbox
  // from being reparsed as an executable control flag.
  args.push('--', options.prompt)
  return args
}
