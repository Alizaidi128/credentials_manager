import { spawn } from 'child_process'
import type { DbLaunchRequest, DbLaunchResult } from '../shared/types'

function substitute(template: string, vars: DbLaunchRequest['vars']): string {
  return template
    .split('{host}').join(vars.host)
    .split('{port}').join(vars.port)
    .split('{database}').join(vars.database)
    .split('{instance}').join(vars.instance)
    .split('{username}').join(vars.username)
    .split('{password}').join(vars.password)
}

/** Splits a command line into argv tokens, honoring double-quoted segments
 * (e.g. a quoted path to an .exe with spaces). */
function tokenize(command: string): string[] {
  const tokens: string[] = []
  const re = /"([^"]*)"|(\S+)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(command)) !== null) {
    tokens.push(match[1] ?? match[2])
  }
  return tokens
}

export function launch(request: DbLaunchRequest): DbLaunchResult {
  const resolved = substitute(request.commandTemplate.trim(), request.vars)
  if (!resolved) {
    return { ok: false, message: 'No command configured for this database client.' }
  }

  const tokens = tokenize(resolved)
  const command = tokens[0]
  const args = tokens.slice(1)
  if (!command) {
    return { ok: false, message: 'Command template is invalid.' }
  }

  const env = { ...process.env }
  if (command.toLowerCase().includes('psql')) {
    env.PGPASSWORD = request.vars.password
  }

  try {
    if (request.openInTerminal) {
      const child = spawn('cmd.exe', ['/c', 'start', '""', 'cmd.exe', '/k', resolved], {
        detached: true,
        stdio: 'ignore',
        env
      })
      child.unref()
    } else {
      const child = spawn(command, args, {
        detached: true,
        stdio: 'ignore',
        env
      })
      child.unref()
    }
    return { ok: true, message: 'Launched.' }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Failed to launch database client.' }
  }
}
