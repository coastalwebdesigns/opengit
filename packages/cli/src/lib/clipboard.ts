import { $ } from "bun"
import clipboardy from "clipboardy"
import { platform } from "os"

function lazy<T>(fn: () => T) {
  let value: T | undefined
  let loaded = false

  return (): T => {
    if (loaded) return value as T
    loaded = true
    value = fn()
    return value as T
  }
}

export namespace Clipboard {
  const getCopyMethod = lazy(() => {
    const os = platform()

    if (os === "darwin" && Bun.which("oascript")) {
      console.log("clipboard: using osascript")
      return async (text: string) => {
        const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
        await $`osascript -e 'set the clipboard to "${escaped}"'`.nothrow().quiet()
      }
    }

    if (os === "linux") {
      if (process.env["WAYLAND_DISPLAY"] && Bun.which("wl-copy")) {
        console.log("clipboard: using wl-copy")
        return async (text: string) => {
          const proc = Bun.spawn(["wl-copy"], {
            stdin: "pipe",
            stdout: "ignore",
            stderr: "ignore",
          })
          proc.stdin.write(text)
          proc.stdin.end()
          await proc.exited.catch(() => {})
        }
      }
      if (Bun.which("xclip")) {
        console.log("clipboard: using xclip")
        return async (text: string) => {
          const proc = Bun.spawn(["xclip", "-selection", "clipboard"], {
            stdin: "pipe",
            stdout: "ignore",
            stderr: "ignore",
          })
          proc.stdin.write(text)
          proc.stdin.end()
          await proc.exited.catch(() => {})
        }
      }
      if (Bun.which("xsel")) {
        console.log("clipboard: using xsel")
        return async (text: string) => {
          const proc = Bun.spawn(["xsel", "--clipboard", "--input"], {
            stdin: "pipe",
            stdout: "ignore",
            stderr: "ignore",
          })
          proc.stdin.write(text)
          proc.stdin.end()
          await proc.exited.catch(() => {})
        }
      }
    }

    if (os === "win32") {
      console.log("clipboard: using powershell")
      return async (text: string) => {
        const escaped = text.replace(/"/g, '""')
        await $`powershell -command "Set-Clipboard -Value \"${escaped}\""`.nothrow().quiet()
      }
    }

    console.log("clipboard: no native support")
    return async (text: string) => {
      await clipboardy.write(text).catch(() => {})
    }
  })

  export async function copy(text: string): Promise<void> {
    await getCopyMethod()(text)
  }
}
