import { createOpencode } from "@opencode-ai/sdk"
import type { Provider } from "@opencode-ai/sdk"
import { NamedError } from "@util/error"

const AI_MODEL = { providerID: "opencode", modelID: "big-pickle" }

let _client: Awaited<ReturnType<typeof createOpencode>> | null = null
let _providers: Promise<Array<Provider>> | undefined

export namespace Opencode {
  export const defaultModel = AI_MODEL

  async function getClient() {
    if (!_client) {
      _client = await createOpencode({
        port: 0,
      })
    }
    return _client
  }

  export function closeClient() {
    if (_client) {
      _client.server.close()
      _client = null
      _providers = undefined
    }
  }

  export function providers() {
    if (!_providers) {
      _providers = (async () => {
        try {
          const opencode = await getClient()
          const result = await opencode.client.config.providers()
          return result.data?.providers ?? []
        } catch (e) {
          console.log("Error fetching opencode providers", e)
          return []
        }
      })()
    }
    return _providers
  }

  export async function prompt(message: string, model = defaultModel): Promise<string> {
    const opencode = await getClient()
    const session = await opencode.client.session.create()
    const result = await opencode.client.session.prompt({
      path: { id: session.data!.id },
      body: {
        model,
        parts: [{ type: "text", text: message }],
        tools: { "*": false },
      },
    })
    const text = result.data?.parts?.find((p) => p.type === "text")?.text
    if (!text) throw NamedError.create("opencode_error", { message: "No response from model" })
    return text
  }
}
