import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Row, Check } from '../types'

const PANE = 'variables'
const ORANGE = '#d97757' // Claude Code icon orange
// Variables the commands may change: $.env.set needs the name as a string literal, so the list is closed.
const EDITABLE = ['CLAUDE_CONFIG_DIR', 'MOD_ENV_TEST'] as const
type Editable = (typeof EDITABLE)[number]
// Always shown, even when unset; the others only when set (so each OS shows its own).
const ALWAYS = ['CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_PLUGIN_DIRS', 'MOD_ENV_TEST']
const NOT_SET = '(not set)'

const rowsAtom = atom({ plugin: 'system-variables', key: 'rows' } as const, [] as Row[])
const originalsAtom = atom({ plugin: 'system-variables', key: 'originals' } as const, [] as Row[])
const lastCheckAtom = atom({ plugin: 'system-variables', key: 'lastCheck' } as const, null as Check | null)

const SECRET = /KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL/i

async function readAll($: EngineInterface): Promise<Row[]> {
  const all: Row[] = [
    { name: 'CLAUDE_CONFIG_DIR', value: (await $.env.get('CLAUDE_CONFIG_DIR')) ?? null },
    { name: 'CLAUDE_CODE_PLUGIN_DIRS', value: (await $.env.get('CLAUDE_CODE_PLUGIN_DIRS')) ?? null },
    { name: 'MOD_ENV_TEST', value: (await $.env.get('MOD_ENV_TEST')) ?? null },
    { name: 'COMPUTERNAME', value: (await $.env.get('COMPUTERNAME')) ?? null },
    { name: 'HOSTNAME', value: (await $.env.get('HOSTNAME')) ?? null },
    { name: 'USERNAME', value: (await $.env.get('USERNAME')) ?? null },
    { name: 'USER', value: (await $.env.get('USER')) ?? null },
    { name: 'USERPROFILE', value: (await $.env.get('USERPROFILE')) ?? null },
    { name: 'HOME', value: (await $.env.get('HOME')) ?? null },
    { name: 'APPDATA', value: (await $.env.get('APPDATA')) ?? null },
    { name: 'TEMP', value: (await $.env.get('TEMP')) ?? null },
    { name: 'TMPDIR', value: (await $.env.get('TMPDIR')) ?? null },
    { name: 'SHELL', value: (await $.env.get('SHELL')) ?? null },
  ]

  return all.filter(r => r.value !== null || ALWAYS.includes(r.name))
}

async function setVar($: EngineInterface, name: Editable, value: string | undefined) {
  if (name === 'CLAUDE_CONFIG_DIR') await $.env.set('CLAUDE_CONFIG_DIR', value)
  else await $.env.set('MOD_ENV_TEST', value)
}

async function isWindows($: EngineInterface): Promise<boolean> {
  return (await $.env.get('OS')) === 'Windows_NT'
}

// Exact size of the content: columns = longest line, rows = one per variable + footer (+ last check).
function measure(rows: Row[], last: Check | null) {
  const widths = rows.map(r => r.name.length + 2 + 1 + (r.value ?? NOT_SET).length)

  return {
    columns: Math.min(80, Math.max(24, ...widths, 26) + 2),
    rows: rows.length + 1 + (last ? 2 : 0),
  }
}

async function refresh($: EngineInterface) {
  const rows = await readAll($)
  await update($, rowsAtom, () => rows)
}

// Reads the variable back from this process and from a child process, to see whether a change propagates.
async function check($: EngineInterface, name: Editable): Promise<Check> {
  const rows = await readAll($)
  const inProcess = rows.find(r => r.name === name)?.value ?? null
  let inChild: string | null = null
  try {
    const argv = (await isWindows($))
      ? ['cmd', '/c', 'echo', `%${name}%`]
      : ['sh', '-c', `printf %s "$${name}"`]
    const out = await $.process.run(argv, { timeoutMs: 10_000 })
    const text = out.stdout.trim()
    inChild = text === '' || text === `%${name}%` ? null : text
  } catch {
    inChild = 'error: $.process.run not available'
  }

  return { name, inProcess, inChild, time: new Date().toISOString().slice(11, 19) }
}

const report = (c: Check) =>
  `${c.name}: process=${c.inProcess ?? NOT_SET}; child=${c.inChild ?? NOT_SET}`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'env', description: 'Open the environment variables pane' })
    await $.command.register({ name: 'env-all', description: 'List every variable of the process (secrets masked)' })
    await $.command.register({ name: 'env-set', description: 'Set an editable variable: /env-set NAME value' })
    await $.command.register({ name: 'env-unset', description: 'Unset an editable variable: /env-unset NAME' })
    await $.command.register({ name: 'env-reset', description: 'Restore the values found at session start' })
    const rows = await readAll($)
    await update($, rowsAtom, () => rows)
    await update($, originalsAtom, () => rows)
    void $.ui.open({ id: PANE, title: 'Variables', ...measure(rows, null) })

    return next(e)
  })

  on('command.run', { command: 'env' }, async $ => {
    await refresh($)
    await $.ui.open({
      id: PANE,
      title: 'Variables',
      ...measure(await read($, rowsAtom), await read($, lastCheckAtom)),
    })

    return { text: 'Variables pane opened.' }
  })

  on('command.run', { command: 'env-all' }, async $ => {
    try {
      const argv = (await isWindows($)) ? ['cmd', '/c', 'set'] : ['env']
      const out = await $.process.run(argv, { timeoutMs: 10_000 })
      const lines = out.stdout
        .split(/\r?\n/)
        .filter(l => l.includes('='))
        .map(l => {
          const i = l.indexOf('=')
          const name = l.slice(0, i)
          return SECRET.test(name) ? `${name}=***` : l
        })
        .sort()

      return { text: `${lines.length} variables (secrets masked):\n${lines.join('\n')}` }
    } catch (err) {
      return { text: `Cannot list them: ${String(err)}` }
    }
  })

  on('command.run', { command: 'env-set' }, async ($, e) => {
    const m = e.args.trim().match(/^(\S+)\s+(.+)$/)
    if (!m) return { text: 'Usage: /env-set NAME value' }
    const name = m[1] as Editable
    if (!EDITABLE.includes(name)) {
      return { text: `${m[1]} is not editable (allowed: ${EDITABLE.join(', ')}).` }
    }
    await setVar($, name, m[2])
    const c = await check($, name)
    await update($, lastCheckAtom, () => c)
    await refresh($)

    return { text: report(c) }
  })

  on('command.run', { command: 'env-unset' }, async ($, e) => {
    const name = e.args.trim() as Editable
    if (!EDITABLE.includes(name)) {
      return { text: `Usage: /env-unset NAME, NAME one of ${EDITABLE.join(', ')}.` }
    }
    await setVar($, name, undefined)
    const c = await check($, name)
    await update($, lastCheckAtom, () => c)
    await refresh($)

    return { text: report(c) }
  })

  on('command.run', { command: 'env-reset' }, async $ => {
    const originals = await read($, originalsAtom)
    for (const name of EDITABLE) {
      await setVar($, name, originals.find(r => r.name === name)?.value ?? undefined)
    }
    await update($, lastCheckAtom, () => null)
    await refresh($)

    return { text: 'Editable variables restored to their session-start values.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const rows = await read($, rowsAtom)
    const last = await read($, lastCheckAtom)

    return (
      <Box flexDirection="column">
        {rows.map(r => (
          <Box flexDirection="row" columnGap={1}>
            <Text bold color={ORANGE}>
              {r.name}
              {(EDITABLE as readonly string[]).includes(r.name) ? ' *' : ''}
            </Text>
            <Text dimColor={r.value === null}>{r.value === null ? NOT_SET : r.value}</Text>
          </Box>
        ))}
        <Text dimColor>* editable with /env-set</Text>
        {last && (
          <Text>
            {`Last check ${last.time} ${last.name}: process=${last.inProcess ?? '-'} child=${last.inChild ?? '-'}`}
          </Text>
        )}
      </Box>
    )
  })
}
