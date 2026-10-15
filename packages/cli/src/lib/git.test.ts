import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm, chmod } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { $ } from "bun"
import { Git } from "./git"

async function failure(fn: () => Promise<void>) {
  const error = await fn().then(
    () => undefined,
    (error) => error,
  )
  if (error instanceof Error) return error
  throw new Error("Expected operation to fail")
}

describe("Git.push", () => {
  const cwd = process.cwd()
  let dir = ""
  let local = ""
  let remote = ""

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "opengit-push-"))
    local = path.join(dir, "local")
    remote = path.join(dir, "remote.git")
    await $`git init --bare ${remote}`.quiet()
    await $`git init -b main ${local}`.quiet()
    await $`git -C ${local} config user.name "OpenGit Test"`.quiet()
    await $`git -C ${local} config user.email "opengit@example.com"`.quiet()
    await Bun.write(path.join(local, "file.txt"), "initial\n")
    await $`git -C ${local} add file.txt`.quiet()
    await $`git -C ${local} commit -m initial`.quiet()
    await $`git -C ${local} remote add origin ${remote}`.quiet()
    await $`git -C ${local} push -u origin main`.quiet()
    process.chdir(local)
  })

  afterAll(async () => {
    process.chdir(cwd)
    await rm(dir, { recursive: true, force: true })
  })

  test("pushes and preserves complete failure diagnostics", async () => {
    const prompt = path.join(local, ".git", "hooks", "pre-push")
    await Bun.write(prompt, '#!/bin/sh\ntest "$GIT_TERMINAL_PROMPT" = 0\n')
    await chmod(prompt, 0o755)
    await Bun.write(path.join(local, "file.txt"), "normal push\n")
    await $`git add file.txt`.quiet()
    await $`git commit -m normal`.quiet()
    await Git.push()
    expect(await $`git --git-dir ${remote} show main:file.txt`.text()).toBe("normal push\n")

    await $`git switch -c no-upstream`.quiet()
    const upstream = await failure(() => Git.push())
    expect(upstream.message).toContain("has no upstream branch")
    expect(upstream.message).toContain("git push --set-upstream")
    await $`git switch main`.quiet()

    await $`git commit --amend -m rewritten`.quiet()
    await Git.push(true)
    expect((await $`git rev-parse HEAD`.text()).trim()).toBe(
      (await $`git --git-dir ${remote} rev-parse refs/heads/main`.text()).trim(),
    )

    const other = path.join(dir, "other")
    await $`git clone -b main ${remote} ${other}`.quiet()
    await $`git -C ${other} config user.name "OpenGit Test"`.quiet()
    await $`git -C ${other} config user.email "opengit@example.com"`.quiet()
    await Bun.write(path.join(other, "file.txt"), "remote change\n")
    await $`git -C ${other} add file.txt`.quiet()
    await $`git -C ${other} commit -m remote`.quiet()
    await $`git -C ${other} push`.quiet()
    await Bun.write(path.join(local, "file.txt"), "local change\n")
    await $`git add file.txt`.quiet()
    await $`git commit -m local`.quiet()
    const lease = await failure(() => Git.push(true))
    expect(lease.message).toContain("stale info")

    await $`git fetch origin`.quiet()
    await $`git reset --hard origin/main`.quiet()
    await Bun.write(path.join(local, "file.txt"), "rejected change\n")
    await $`git add file.txt`.quiet()
    await $`git commit -m rejected`.quiet()
    const hook = path.join(remote, "hooks", "pre-receive")
    await Bun.write(hook, "#!/bin/sh\necho 'first failure' >&2\necho 'second failure' >&2\nexit 1\n")
    await chmod(hook, 0o755)
    const rejected = await failure(() => Git.push())
    expect(rejected.message).toContain("first failure")
    expect(rejected.message).toContain("second failure")
  })
})
