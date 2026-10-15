import { createStore } from "solid-js/store"
import { createSimpleContext } from "./helper"
import { onCleanup, onMount } from "solid-js"
import { Git, type File } from "@lib/git"
import { useToast } from "@context/toast"

export const { use: useWorkspace, provider: WorkspaceProvider } = createSimpleContext({
  name: "Workspace",
  init: () => {
    const toast = useToast()
    const [store, setStore] = createStore<{
      file: File
      files: File[]
      filesLoaded: boolean
      filesError: boolean
      branch: string
    }>({
      file: { status: "", path: "" },
      files: [],
      filesLoaded: false,
      filesError: false,
      branch: "",
    })

    let pending: Promise<void> | undefined

    function loadFiles() {
      pending = (async () => {
        setStore(
          "files",
          (await Git.getChangedFiles()).sort((a, b) => a.path.localeCompare(b.path)),
        )
        setStore("filesLoaded", true)
        setStore("filesError", false)
      })()
        .catch(() => {
          setStore("filesLoaded", true)
          setStore("filesError", true)
        })
        .finally(() => {
          pending = undefined
        })
      return pending
    }

    function refreshFiles() {
      const current = pending
      if (!current) return loadFiles()
      return current.then(() => pending ?? loadFiles())
    }

    async function mutate(fn: () => Promise<void>, log: string) {
      try {
        await fn()
      } catch (error) {
        toast.error(error)
        console.error(log, error)
        await refreshFiles()
        return false
      }
      await refreshFiles()
      return true
    }

    const stage = (file: File) => mutate(() => Git.stageFile(file.path), "Failed to stage file")
    const unstage = (file: File) => mutate(() => Git.unstageFile(file.path), "Failed to unstage file")
    const stageAll = () => mutate(() => Git.stageAllFiles(), "Failed to stage files")
    const unstageAll = () => mutate(() => Git.unstageAllFiles(), "Failed to unstage files")
    const discard = (file: File) => mutate(() => Git.discardFile(file.path, file.status), "Failed to discard file")
    const discardAll = () => mutate(() => Git.discardAllFiles(), "Failed to discard files")
    const commit = (message: string) => mutate(() => Git.commit(message), "Failed to commit")
    const push = (force: boolean) =>
      Git.push(force)
        .then(() => ({ ok: true as const }))
        .catch((error) => {
          console.error("Failed to push", error)
          return {
            ok: false as const,
            message: error instanceof Error ? error.message : "An unknown error has occurred",
          }
        })

    onMount(async () => {
      loadFiles()
      const interval = setInterval(() => {
        if (!pending) loadFiles()
      }, 1000)
      onCleanup(() => clearInterval(interval))
      const branch = await Git.getCurrentBranch()
      if (branch) setStore("branch", branch)
    })

    return {
      get file() {
        return store.file
      },
      get files() {
        return store.files
      },
      get filesLoaded() {
        return store.filesLoaded
      },
      get filesError() {
        return store.filesError
      },
      get branch() {
        return store.branch
      },
      setFile(v: File) {
        setStore("file", v)
      },
      refreshFiles,
      stage,
      unstage,
      stageAll,
      unstageAll,
      discard,
      discardAll,
      commit,
      push,
    }
  },
})
