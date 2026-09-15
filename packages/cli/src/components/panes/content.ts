import { createEffect, createSignal, on, onCleanup } from "solid-js"
import { unwatchFile, watchFile } from "fs"
import { join } from "path"
import { Git, type File } from "@lib/git"

export function useFileContent(file: () => File, fetch: (absolutePath: string, file: File) => Promise<string>) {
  const [content, setContent] = createSignal("")
  let watched: string | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  function unwatch() {
    if (!watched) return
    unwatchFile(watched)
    watched = null
  }

  async function refresh(file: File) {
    const absolute = join(await Git.getGitRoot(), file.path)
    setContent(await fetch(absolute, file))
  }

  createEffect(
    on(
      () => file().path,
      async (path) => {
        unwatch()
        if (!path) {
          setContent("")
          return
        }
        const absolute = join(await Git.getGitRoot(), path)
        if (file().path !== path) return
        watchFile(absolute, { interval: 200 }, (curr, prev) => {
          if (curr.mtime === prev.mtime) return
          if (timer) clearTimeout(timer)
          timer = setTimeout(() => refresh(file()), 150)
        })
        watched = absolute
      },
    ),
  )

  createEffect(
    on(
      () => [file().path, file().status] as const,
      ([path]) => {
        if (!path) {
          setContent("")
          return
        }
        refresh(file())
      },
    ),
  )

  onCleanup(() => {
    unwatch()
    if (timer) clearTimeout(timer)
  })

  return content
}
