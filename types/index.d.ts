export type Row = { name: string; value: string | null }
export type Check = { name: string; inProcess: string | null; inChild: string | null; time: string }

declare module 'claude-code' {
  interface PluginState {
    'system-variables': {
      rows: Row[]
      originals: Row[]
      lastCheck: Check | null
    }
  }
}
