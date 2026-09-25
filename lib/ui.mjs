// Jobdar — tiny terminal output helpers (zero dependencies).
// Color is disabled when not a TTY or when NO_COLOR is set.

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR

const c = (code, s) => (useColor ? `[${code}m${s}[0m` : String(s))

export const color = {
  green: (s) => c('32', s),
  yellow: (s) => c('33', s),
  red: (s) => c('31', s),
  dim: (s) => c('2', s),
  bold: (s) => c('1', s),
  cyan: (s) => c('36', s),
}

export const symbol = {
  ok: () => color.green('✓'),
  warn: () => color.yellow('!'),
  fail: () => color.red('✗'),
  info: () => color.dim('·'),
}

export function heading(text) {
  console.log('\n' + color.bold(text))
}
