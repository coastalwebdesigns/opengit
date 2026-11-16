import { createMemo, onMount } from "solid-js"
import { DialogSelect } from "@ui/dialog-select"
import { useApplication } from "@context/application"
import type { AIModel } from "@util/config"
import { useDialog } from "@ui/dialog"

export default function ModelsDialog() {
  const app = useApplication()
  const dialog = useDialog()
  onMount(() => {
    void app.refreshAi()
  })

  const options = createMemo(() =>
    app.models
      .toSorted((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name))
      .map((model) => ({
        title: model.name,
        value: { providerID: model.providerID, modelID: model.modelID },
        category: model.provider,
      })),
  )

  function select(model: AIModel) {
    app.setAiModel(model).then(() => dialog.clear())
  }

  return (
    <DialogSelect
      title={app.aiLoading ? "Loading OpenCode models" : "AI Model"}
      placeholder="Search models"
      empty={app.aiLoading ? "Checking OpenCode..." : (app.aiError ?? "No models available")}
      options={options()}
      current={app.config.aiModel}
      onSelect={(option) => select(option.value)}
    />
  )
}
