/** One JSON line per log entry; requestId ties Lambda logs to the app request. */
export function log(level: 'info' | 'warn' | 'error', msg: string, fields: Record<string, unknown> = {}) {
  console[level](JSON.stringify({ level, msg, ...fields }));
}
