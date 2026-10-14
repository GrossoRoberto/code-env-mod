# system-variables

A Claude Code mod: a small pane that shows environment variables (for example `CLAUDE_CONFIG_DIR`)
and slash commands to test which of them can be changed from inside a session.
Works on Windows, macOS and Linux.

## Pane

Opens by itself at session start (and with `/env`), sized to its content.
Shows `CLAUDE_CONFIG_DIR`, `CLAUDE_CODE_PLUGIN_DIRS`, `MOD_ENV_TEST` always, plus the host,
user, home and temp variables of the current OS when they are set. Names are orange; `*` marks editable ones.

## Commands

| Command | What it does |
| --- | --- |
| `/env` | Open the pane |
| `/env-all` | List every variable of the process (names containing KEY, TOKEN, SECRET, PASSWORD, PASSWD, CREDENTIAL are masked) |
| `/env-set NAME value` | Set `CLAUDE_CONFIG_DIR` or `MOD_ENV_TEST`, then read it back from this process and from a child process |
| `/env-unset NAME` | Unset one of them |
| `/env-reset` | Restore the values found at session start |

Changes only affect this process and the processes it starts afterwards. They are not permanent.
Changing `CLAUDE_CONFIG_DIR` can point later child processes at another config folder; use `/env-reset` to undo.

## Install

```
/plugin install system-variables --marketplace GrossoRoberto/code-env-mod
```

For development: `claude --plugin-dir <path-to-this-folder>`.

## License

MIT, see [LICENSE](LICENSE).
