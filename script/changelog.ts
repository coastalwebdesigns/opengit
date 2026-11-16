#!/usr/bin/env bun

import { $ } from "bun"
import { Opencode } from "../packages/cli/src/lib/opencode"

const repo = process.env.GITHUB_REPOSITORY ?? "flat6solutions/opengit"

type Release = {
  tag_name: string
}

export async function getLatestRelease(): Promise<string> {
  return fetch(`https://api.github.com/repos/${repo}/releases/latest`)
    .then((res) => {
      if (!res.ok) throw new Error(res.statusText)
      return res.json() as Promise<Release>
    })
    .then((data) => data.tag_name.replace(/^v/, ""))
    .catch(() => "0.0.0")
}

type Commit = {
  hash: string
  message: string
}

const VERSION_ONLY_RE = /^v?\d+(?:\.\d+)*$/i
const MERGE_COMMIT_RE = /^(merge pull request|merge branch)/i
const DISALLOWED_SUMMARY_RE = /(cannot access|need to see|provide the full commit message|without seeing|i can only|since i cannot|i don't have access|git history)/i


export async function getCommits(from: string, to: string): Promise<Commit[]> {
  const fromRef = from === "0.0.0" ? "" : from.startsWith("v") ? from : `v${from}`
  const toRef = to === "HEAD" ? to : to.startsWith("v") ? to : `v${to}`

  let compare = ""
  try {
    if (fromRef) {
      compare = await $`gh api "/repos/${repo}/compare/${fromRef}...${toRef}" --jq '.commits[] | {sha: .sha, message: .commit.message}'`.text()
    } else {
      compare = await $`gh api "/repos/${repo}/commits?per_page=100" --jq '.[] | {sha: .sha, message: .commit.message}'`.text()
    }
  } catch {
    console.log("Could not fetch commits from GitHub API")
    return []
  }

  const commitData = new Map<string, { message: string }>()
  for (const line of compare.split("\n").filter(Boolean)) {
    try {
      const data = JSON.parse(line) as { sha: string; message: string }
      commitData.set(data.sha, { message: data.message.split("\n")[0] ?? "" })
    } catch {
      // Skip malformed JSON lines
    }
  }

  let log = ""
  try {
    log = await $`git log ${fromRef ? `${fromRef}..${toRef}` : toRef} --oneline --format="%H" -- packages/cli packages/script script .github`.text()
  } catch {
    console.log("Could not fetch git log")
    return []
  }

  const hashes = log.split("\n").filter(Boolean)
  const commits: Commit[] = []

  for (const hash of hashes) {
    const data = commitData.get(hash)
    if (!data) continue

    const message = data.message
    if (message.match(/^(release:|chore:|ci:|test:|ignore:)/i)) continue
    if (MERGE_COMMIT_RE.test(message)) continue

    commits.push({
      hash: hash.slice(0, 7),
      message,
    })
  }

  return commits
}

function normalizeSummary(summary: string, fallback: string): string {
  const trimmed = summary.trim()
  if (!trimmed || trimmed.includes("\n") || DISALLOWED_SUMMARY_RE.test(trimmed)) {
    return fallback
  }
  return trimmed
}

function simpleSummary(message: string): string | null {
  const firstLine = message.split("\n")[0]?.trim() ?? ""
  if (!firstLine) return null
  if (VERSION_ONLY_RE.test(firstLine)) {
    return `Release ${firstLine.toLowerCase().startsWith("v") ? firstLine : `v${firstLine}`}`
  }
  const capitalized = firstLine[0]?.toUpperCase() + firstLine.slice(1)
  return capitalized
}

async function summarizeCommit(
  model: Opencode.Model,
  message: string
): Promise<string> {
  const fallback = simpleSummary(message) ?? message
  if (VERSION_ONLY_RE.test(message.trim())) {
    return fallback
  }
  console.log("Summarizing commit:", message)
  const result = await Opencode.prompt(
    `Summarize this commit message for a changelog entry. Use ONLY the message text provided. Return a single line summary starting with a capital letter. Be concise but specific. If the message is already well-written, just clean it up (capitalize, fix typos, proper grammar). Do not include any prefixes like "fix:" or "feat:". Do not mention missing context or ask questions.


Commit: ${message}`,
    model,
    AbortSignal.timeout(120_000),
  )
  return normalizeSummary(result, fallback)
}

function getRawChangelog(commits: Commit[]): string[] {
  return commits.map((commit) => `- ${commit.message}`)
}

async function summarizeWithOpenCode(commits: Commit[]): Promise<string[]> {
  console.log("Summarizing commits with OpenCode...")

  const model = Opencode.select(await Opencode.models())
  if (!model) return getRawChangelog(commits)
  const lines: string[] = []
  const summarizeStart = Bun.nanoseconds()

  try {
    // Summarize commits in parallel with max 5 concurrent requests
    const BATCH_SIZE = 5
    const summaries: string[] = []

    for (let i = 0; i < commits.length; i += BATCH_SIZE) {
      const batch = commits.slice(i, i + BATCH_SIZE)
      const results = await Promise.all(batch.map((c) => summarizeCommit(model, c.message)))
      summaries.push(...results)
    }
    console.log(`Summarized ${summaries.length} commits in ${Math.round((Bun.nanoseconds() - summarizeStart) / 1_000_000)}ms`)

    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i]
      if (!commit) continue
      const entry = `- ${summaries[i]}`
      lines.push(entry)
    }

    console.log("---- Generated Changelog ----")
    console.log(lines.join("\n"))
    console.log("-----------------------------")
    console.log(`Changelog formatting complete in ${Math.round((Bun.nanoseconds() - summarizeStart) / 1_000_000)}ms`)
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      console.log("Changelog generation timed out, using raw commits")
      return getRawChangelog(commits)
    }
    throw error
  } finally {
    Opencode.closeClient()
  }

  return lines
}

export async function buildNotes(from: string, to: string): Promise<string[]> {
  const commits = await getCommits(from, to)

  if (commits.length === 0) {
    return ["No notable changes"]
  }

  console.log(`Generating changelog for ${commits.length} commits since v${from}`)

  try {
    return await summarizeWithOpenCode(commits)
  } catch (error) {
    console.log("OpenCode unavailable, falling back to raw commits:", Opencode.message(error))
    return getRawChangelog(commits)
  }
}

// CLI entrypoint
if (import.meta.main) {
  const from = process.argv[2] || (await getLatestRelease())
  const to = process.argv[3] || "HEAD"

  console.log(`Generating changelog: v${from} -> ${to}\n`)

  const notes = await buildNotes(from, to)
  console.log("\n=== Changelog ===")
  console.log(notes.join("\n"))
}
