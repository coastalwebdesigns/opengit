import { $ } from "bun"
import { NamedError } from "@util/error"

export type File = {
  status: string
  path: string
  previousPath?: string
  added?: number
  removed?: number
}

let cachedGitRoot: Promise<string> | undefined

function expect(res: { exitCode: number; stdout: Buffer; stderr: Buffer }, fallback: string) {
  if (res.exitCode === 0) return
  const stderr = res.stderr.toString().trim()
  const stdout = res.stdout.toString().trim()
  const useful =
    stderr.split("\n").find((line) => line.trim().length > 0) ||
    stdout.split("\n").find((line) => line.trim().length > 0) ||
    fallback
  throw NamedError.create("git_error", { message: useful })
}

export namespace Git {
  export async function getGitRoot() {
    if (cachedGitRoot) return cachedGitRoot
    cachedGitRoot = $`git rev-parse --show-toplevel`
      .quiet()
      .nothrow()
      .text()
      .then((root) => root.trim())
    return cachedGitRoot
  }

  export async function getCurrentBranch() {
    const root = await getGitRoot()
    const res = await $`git -C ${root} branch --show-current`.quiet().nothrow()
    return res.stdout.toString().trim()
  }

  export function isFileStaged(status: string) {
    if (["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(status)) return false
    return ["M", "A", "D", "R", "C", "T"].includes(status[0] ?? "")
  }

  export function isFileFullyStaged(status: string) {
    return isFileStaged(status) && status[1] === " "
  }

  export async function getChangedFiles() {
    const root = await getGitRoot()
    const head = await Bun.$`git -C ${root} rev-parse --verify HEAD`.quiet().nothrow()
    const [status, stats] = await Promise.all([
      Bun.$`git -C ${root} status --porcelain=v1 --untracked-files=all --no-renames -z -- .`.quiet().nothrow(),
      head.exitCode === 0
        ? Bun.$`git -C ${root} diff --no-ext-diff --no-renames --numstat -z HEAD -- .`.quiet().nothrow()
        : undefined,
    ])
    if (status.exitCode !== 0) {
      throw NamedError.create("git_error", {
        message: status.stderr.toString().trim() || "git status failed",
      })
    }

    const counts = new Map<string, { added: number; removed: number }>()
    for (const item of stats?.text().split("\0") ?? []) {
      const a = item.indexOf("\t")
      const b = item.indexOf("\t", a + 1)
      if (a === -1 || b === -1) continue
      const path = item.slice(b + 1)
      if (!path) continue
      const adds = item.slice(0, a)
      const dels = item.slice(a + 1, b)
      const added = adds === "-" ? 0 : Number.parseInt(adds || "0", 10)
      const removed = dels === "-" ? 0 : Number.parseInt(dels || "0", 10)
      counts.set(path, {
        added: Number.isFinite(added) ? added : 0,
        removed: Number.isFinite(removed) ? removed : 0,
      })
    }

    return Array.fromAsync(status.text().split("\0").filter(Boolean), async (item) => {
      const code = item.slice(0, 2)
      const path = item.slice(3)
      const stat = counts.get(path)
      if (stat || (code !== "??" && (!code.includes("A") || code.includes("D")))) {
        return { status: code, path, added: stat?.added ?? 0, removed: stat?.removed ?? 0 }
      }

      const result = await Bun.$`git -C ${root} diff --no-index --numstat -- /dev/null ${path}`.quiet().nothrow()
      const parts = result.text().split("\t")
      const added = parts[0] === "-" ? 0 : Number.parseInt(parts[0] || "0", 10)
      const removed = parts[1] === "-" ? 0 : Number.parseInt(parts[1] || "0", 10)
      return {
        status: code,
        path,
        added: Number.isFinite(added) ? added : 0,
        removed: Number.isFinite(removed) ? removed : 0,
      }
    })
  }

  export async function stageFile(path: string) {
    const root = await getGitRoot()
    expect(await $`git -C ${root} add ${path}`.quiet().nothrow(), "git add failed")
  }

  export async function unstageFile(path: string) {
    const root = await getGitRoot()
    expect(await $`git -C ${root} restore --staged ${path}`.quiet().nothrow(), "git restore --staged failed")
  }

  export async function stageAllFiles() {
    const root = await getGitRoot()
    expect(await $`git -C ${root} add .`.quiet().nothrow(), "git add failed")
  }

  export async function getDiffStaged() {
    const root = await getGitRoot()
    const res = await $`git -C ${root} diff --staged`.quiet().nothrow()
    return res.stdout.toString().trim()
  }

  export async function unstageAllFiles() {
    const root = await getGitRoot()
    expect(await $`git -C ${root} restore --staged .`.quiet().nothrow(), "git restore --staged failed")
  }

  export async function commit(message: string) {
    const root = await getGitRoot()
    expect(await $`git -C ${root} commit -m "${message}"`.quiet().nothrow(), "git commit failed")
  }

  export async function discardFile(path: string, status?: string) {
    const root = await getGitRoot()
    if (status === "??") {
      expect(await $`git -C ${root} clean -f -- ${path}`.quiet().nothrow(), "git clean failed")
      return
    }
    expect(await $`git -C ${root} restore ${path}`.quiet().nothrow(), "git restore failed")
  }

  export async function discardAllFiles() {
    const root = await getGitRoot()
    expect(await $`git -C ${root} restore .`.quiet().nothrow(), "git restore failed")
    expect(await $`git -C ${root} clean -fd`.quiet().nothrow(), "git clean failed")
  }

  export function getLineCounts(diff: string): {
    added: number
    removed: number
  } {
    let added = 0
    let removed = 0
    for (const line of diff.split("\n")) {
      if (line.startsWith("+") && !line.startsWith("+++")) added++
      else if (line.startsWith("-") && !line.startsWith("---")) removed++
    }
    return { added, removed }
  }

  export async function getDiff(path: string, status: string) {
    const root = await getGitRoot()
    const isUntracked = status === "??"
    const isStaged = status[0] !== " " && status[0] !== "?"
    const hasUnstagedChanges = status[1] !== " "

    if (isUntracked) {
      // Untracked file - compare against nothing (shows all content as additions)
      return await Bun.$`git -C ${root} diff -U5 --no-index -- /dev/null ${path}`.quiet().nothrow().text()
    } else if (isStaged && !hasUnstagedChanges) {
      // Only staged changes (e.g., "M ", "A ", "D ")
      return await Bun.$`git -C ${root} diff -U5 --cached -- ${path}`.quiet().nothrow().text()
    }

    // Unstaged changes (e.g., " M", " D") or mixed (e.g., "MM"m "AM")
    // Shows work tree changes by default
    return await Bun.$`git -C ${root} diff -U5 -- ${path}`.quiet().nothrow().text()
  }
}
