import { spawn } from "node:child_process"

interface ClipboardBackend {
  command: string
  args: string[]
}

const PLATFORM_BACKENDS: Record<string, ClipboardBackend[]> = {
  darwin: [{ command: "pbcopy", args: [] }],
  linux: [
    { command: "wl-copy", args: [] },
    { command: "xclip", args: ["-selection", "clipboard"] },
    { command: "xsel", args: ["--clipboard", "--input"] },
  ],
  win32: [{ command: "clip.exe", args: [] }],
}

/**
 * Write `text` to the system clipboard using whichever backend the platform
 * provides. Rejects with a descriptive error when nothing is installed so the
 * CLI can print a user-facing diagnostic rather than crashing with ENOENT.
 */
export const copyToClipboard = async (text: string): Promise<string> => {
  const backends = PLATFORM_BACKENDS[process.platform] ?? []
  if (backends.length === 0) throw new Error(`No clipboard backend for platform "${process.platform}"`)

  const failures: string[] = []
  for (const { command, args } of backends) {
    try {
      await runBackend(command, args, text)
      return command
    } catch (err) {
      failures.push(`${command}: ${(err as Error).message}`)
    }
  }
  throw new Error(`No clipboard backend found. Tried: ${failures.join(", ")}`)
}

const runBackend = (command: string, args: string[], text: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "ignore", "pipe"] })
    let stderr = ""
    let settled = false
    const done = (err?: Error): void => {
      if (settled) return
      settled = true
      if (err) reject(err)
      else resolve()
    }

    child.on("error", (err) => done(err))
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on("close", (code) => {
      if (code === 0) done()
      else done(new Error(stderr.trim() || `exited with code ${code}`))
    })

    // Writable.end handles internal buffering, but an early EPIPE (e.g. the
    // backend died before we finished writing) would otherwise bubble as an
    // uncaught stream error. Forward it into the promise so the caller sees a
    // clean rejection.
    child.stdin.on("error", (err) => done(err))
    child.stdin.end(text, "utf-8")
  })
