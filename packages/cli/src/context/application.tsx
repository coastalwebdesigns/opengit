import { z } from "zod"
import { createStore } from "solid-js/store"
import { createSimpleContext } from "./helper"
import { AIModel, DiffView, KeybindsConfig } from "@/util/config"
import { useKV } from "./kv"
import { Opencode } from "@lib/opencode"
import { useToast } from "@context/toast"

type Config = {
  activePane: "files"
  mainView: "diff" | "code"
  diffView: DiffView
  diffWrap: boolean
  diffDimStaged: boolean
  keybinds: KeybindsConfig
  aiEnabled: boolean
  aiModel?: AIModel
}

export const { use: useApplication, provider: ApplicationProvider } = createSimpleContext({
  name: "Application",
  init: () => {
    const kv = useKV()
    const toast = useToast()
    const [store, setStore] = createStore<{
      config: Config
      models: Opencode.Model[]
      checking: boolean
      error?: string
    }>({
      models: [],
      checking: false,
      config: {
        activePane: "files",
        mainView: "diff",
        diffView: DiffView.catch("split").parse(kv.get("diff_view")),
        diffWrap: z.boolean().catch(true).parse(kv.get("diff_wrap")),
        diffDimStaged: z.boolean().catch(true).parse(kv.get("diff_dim_staged")),
        keybinds: KeybindsConfig.parse({}),
        aiEnabled: false,
        aiModel: AIModel.safeParse(kv.get("ai_model")).data,
      },
    })

    function save(promise: Promise<unknown>, message: string) {
      return promise.catch((error) => {
        toast.show({ message, variant: "error" })
        console.error(message, error)
      })
    }

    return {
      get config() {
        return store.config
      },
      get models() {
        return store.models
      },
      get aiLoading() {
        return store.checking
      },
      get aiError() {
        return store.error
      },
      async refreshAi() {
        if (store.checking) return
        setStore("checking", true)
        setStore("error", undefined)
        try {
          const models = await Opencode.models()
          const model = Opencode.select(models, store.config.aiModel)
          setStore("models", models)
          setStore("config", "aiEnabled", !!model)
          if (!model) {
            setStore(
              "error",
              models.length > 0
                ? "Saved model unavailable. Choose another model."
                : "No supported models. Connect a provider in OpenCode.",
            )
            return
          }
          if (model.providerID === store.config.aiModel?.providerID && model.modelID === store.config.aiModel.modelID)
            return
          const selected = { providerID: model.providerID, modelID: model.modelID }
          setStore("config", "aiModel", selected)
          await save(kv.set("ai_model", selected), "Failed to save AI model")
        } catch (error) {
          setStore("models", [])
          setStore("config", "aiEnabled", false)
          setStore("error", Opencode.message(error))
        } finally {
          setStore("checking", false)
        }
      },

      setConfig(patch: Partial<Config>) {
        setStore("config", { ...store.config, ...patch })
      },
      setDiffView(v: DiffView) {
        setStore("config", "diffView", v)
        return save(kv.set("diff_view", v), "Failed to save diff view")
      },
      setDiffWrap(v: boolean) {
        setStore("config", "diffWrap", v)
        return save(kv.set("diff_wrap", v), "Failed to save word wrapping")
      },
      setDiffDimStaged(v: boolean) {
        setStore("config", "diffDimStaged", v)
        return save(kv.set("diff_dim_staged", v), "Failed to save staged file appearance")
      },
      setAiModel(v: AIModel) {
        setStore("config", "aiModel", v)
        setStore("config", "aiEnabled", true)
        return save(kv.set("ai_model", v), "Failed to save AI model")
      },
    }
  },
})
