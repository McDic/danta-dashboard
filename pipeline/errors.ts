/**
 * An error whose message is known to contain no trading data, so it may be printed
 * in public CI logs. Messages must only reference row numbers and column names, never cell values.
 */
export class SafeError extends Error {
  override name = 'SafeError'
}

/** Returns a message that is safe for public logs. Unknown errors are reduced to their class name. */
export function safeMessage(err: unknown): string {
  if (err instanceof SafeError) return err.message
  const name = err instanceof Error ? err.name : typeof err
  return `Unexpected ${name} (details suppressed to keep trading data out of logs; run locally with DEBUG_UNSAFE=1 to see them)`
}
