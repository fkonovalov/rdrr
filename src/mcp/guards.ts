export const installProcessGuards = (proc: NodeJS.Process): void => {
  // A crashed handler or a client that vanished mid-write (EPIPE) must not
  // take the server down -- log to stderr and keep serving. stdout is the
  // JSON-RPC channel, so stderr is the only safe place to write.
  proc.on("uncaughtException", (error: unknown) => {
    console.error("[rdrr-mcp] uncaught exception:", error instanceof Error ? error.message : error)
  })
  proc.on("unhandledRejection", (reason: unknown) => {
    console.error("[rdrr-mcp] unhandled rejection:", reason instanceof Error ? reason.message : reason)
  })
  // stdio "error" events (EPIPE on client disconnect) throw without a listener.
  proc.stdout.on("error", () => {})
  proc.stderr.on("error", () => {})
}

export interface IdleTimer {
  /** Mark a tool call in flight -- pauses the countdown so long calls are never killed mid-request. */
  begin: () => void
  /** Mark the call finished -- restarts the countdown once nothing is in flight. */
  end: () => void
}

/**
 * Calls `onExpire` after `timeoutMs` with no tool call in flight.
 * Disabled (no-op) when `timeoutMs` is absent, zero, or not a number.
 * The timer is unref'd so it never keeps the process alive on its own.
 */
export const createIdleTimer = (timeoutMs: number, onExpire: () => void): IdleTimer => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return { begin: () => {}, end: () => {} }

  let handle: NodeJS.Timeout | undefined
  let inflight = 0
  const arm = (): void => {
    if (handle) clearTimeout(handle)
    handle = setTimeout(onExpire, timeoutMs)
    handle.unref()
  }
  const disarm = (): void => {
    if (handle) clearTimeout(handle)
    handle = undefined
  }
  arm()
  return {
    begin: (): void => {
      inflight++
      disarm()
    },
    end: (): void => {
      inflight = Math.max(0, inflight - 1)
      if (inflight === 0) arm()
    },
  }
}
