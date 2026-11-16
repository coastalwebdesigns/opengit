import { ClientError, OpenCode, type ModelInfo, type ProviderInfo } from "@opencode/client"
import { Service, fallback } from "@opencode/client/service"
import { execFile, spawn } from "node:child_process"
import { promisify } from "node:util"
import type { AIModel } from "../util/config"
import { NamedError } from "../util/error"

export namespace Opencode {
  export type Model = AIModel & { name: string; provider: string }

  export function eligible(model: ModelInfo, provider?: ProviderInfo) {
    if (!model.enabled || model.status === "deprecated" || provider?.activation === "disabled") return false
    if (model.type && model.type !== "chat") return false
    if (!model.capabilities.input.includes("text") || !model.capabilities.output.includes("text")) return false
    // Console free chat models are restricted to OpenCode, even when listed by its service.
    if ([model.providerID, model.canonical, provider?.canonical].includes("opencode")) {
      if (
        [model.id, model.modelID].some((id) => /^(big-pickle|.*-free)$/.test(id)) ||
        model.cost.every((cost) => cost.input === 0 && cost.output === 0)
      ) {
        return false
      }
    }
    return true
  }

  export function select(models: Model[], saved?: AIModel) {
    if (saved) return models.find((model) => model.providerID === saved.providerID && model.modelID === saved.modelID)
    return models[Math.floor(Math.random() * models.length)]
  }

  export function message(error: unknown): string {
    if (NamedError.is(error, "opencode_unavailable") || NamedError.is(error, "opencode_error")) return error.message
    if (error instanceof Error && "reason" in error) {
      if (error.reason === "authentication") return "Reconnect this provider in OpenCode."
      if (error.reason === "rate_limit") return "Provider usage limit reached. Try again later."
      if (error.reason === "overloaded") return "Provider is busy. Try again later."
    }
    if (
      error instanceof Error &&
      ["ModelNotFoundError", "ProviderNotFoundError", "UnsupportedModelError"].includes(error.name)
    ) {
      return "Model unavailable. Choose another model in Settings."
    }
    if (error instanceof Error && error.name === "UnauthorizedError") {
      return "OpenCode authentication failed. Reopen OpenCode."
    }
    if (error instanceof ClientError && error.reason === "Transport")
      return "Cannot reach OpenCode. Open it and try again."
    return "OpenCode request failed. Check OpenCode and try again."
  }

  export function create(options: { file?: string; binary?: string | null; timeout?: number } = {}) {
    let connection: Promise<ReturnType<typeof OpenCode.make>> | undefined

    const compatible = (version: string) => {
      const match = /^2\.(\d+)\./.exec(version)
      return !!match && Number(match[1]) >= 3
    }

    async function connect() {
      const endpoint = await Service.discover({ file: options.file, version: compatible })
      if (endpoint) return OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) })

      // Never use ensure(): it can terminate or replace the user's shared service.
      if (await Bun.file(options.file ?? fallback()).exists()) {
        throw NamedError.create("opencode_unavailable", {
          message: "Open OpenCode 2.3 or later to enable AI messages.",
        })
      }
      const binary = options.binary === undefined ? Bun.which("opencode") : options.binary
      if (!binary) {
        throw NamedError.create("opencode_unavailable", {
          message: "Install and connect OpenCode to enable AI messages.",
        })
      }
      const version = await promisify(execFile)(binary, ["--version"], { timeout: 3_000 }).catch(() => undefined)
      if (!version || !compatible(version.stdout.trim())) {
        throw NamedError.create("opencode_unavailable", {
          message: "OpenCode 2.3 or later is required for AI messages.",
        })
      }
      const child = spawn(binary, ["serve", "--service"], {
        detached: true,
        windowsHide: true,
        stdio: "ignore",
      })
      let failed = false
      child.once("error", () => {
        failed = true
      })
      child.once("exit", (code) => {
        if (code !== 0) failed = true
      })
      child.unref()
      const deadline = Date.now() + (options.timeout ?? 15_000)
      while (!failed && Date.now() < deadline) {
        const endpoint = await Service.discover({ file: options.file, version: compatible })
        if (endpoint) return OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) })
        await Bun.sleep(100)
      }
      throw NamedError.create("opencode_unavailable", {
        message: "Could not connect to OpenCode. Open it and try again.",
      })
    }

    function client() {
      return (connection ??= connect().catch((error: unknown) => {
        connection = undefined
        throw error
      }))
    }

    return {
      async models(): Promise<Model[]> {
        const sdk = await client()
        // Omit location: stateless generation uses the service's base configuration too.
        const [models, providers] = await Promise.all([
          sdk.model.list(undefined, { signal: AbortSignal.timeout(10_000) }),
          sdk.provider.list(undefined, { signal: AbortSignal.timeout(10_000) }),
        ]).catch((error: unknown) => {
          connection = undefined
          throw error
        })
        return models.data
          .filter((model) =>
            eligible(
              model,
              providers.data.find((provider) => provider.id === model.providerID),
            ),
          )
          .map((model) => ({
            providerID: model.providerID,
            modelID: model.id,
            name: model.name,
            provider: providers.data.find((provider) => provider.id === model.providerID)?.name ?? model.providerID,
          }))
      },
      async prompt(prompt: string, model: AIModel, signal?: AbortSignal) {
        if (signal?.aborted) throw signal.reason
        const sdk = await client()
        const timeout = AbortSignal.timeout(60_000)
        const result = await sdk.experimental.generate
          .text(
            {
              prompt,
              model: { providerID: model.providerID, id: model.modelID },
            },
            { signal: signal ? AbortSignal.any([signal, timeout]) : timeout },
          )
          .catch((error: unknown) => {
            connection = undefined
            if (signal?.aborted) throw signal.reason
            throw NamedError.create("opencode_error", {
              message: timeout.aborted ? "AI generation timed out. Try again." : message(error),
            })
          })
        if (!result.text.trim()) {
          throw NamedError.create("opencode_error", { message: "The model returned no message. Try another model." })
        }
        return result.text
      },
      closeClient() {
        // We only own a client reference, never the shared service.
        connection = undefined
      },
    }
  }

  const shared = create()
  export const models = shared.models
  export const prompt = shared.prompt
  export const closeClient = shared.closeClient
}
