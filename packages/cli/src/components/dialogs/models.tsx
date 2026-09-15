import { createMemo, createResource } from "solid-js"
import { DialogSelect } from "@ui/dialog-select"
import { useApplication } from "@context/application"
import type { AIModel } from "@util/config"
import { useDialog } from "@ui/dialog"
import { Opencode } from "@lib/opencode"

export default function ModelsDialog() {
  const app = useApplication()
  const dialog = useDialog()
  const [providers] = createResource(Opencode.providers)

  const options = createMemo(() =>
    (providers() ?? [])
      .toSorted((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
      .flatMap((provider) =>
        Object.values(provider.models)
          .toSorted((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
          .map((model) => ({
            title: model.name,
            value: {
              providerID: model.providerID,
              modelID: model.id,
            },
            category: provider.name,
          })),
      ),
  )

  function select(model: AIModel) {
    app.setAiModel(model).then(() => dialog.clear())
  }

  return (
    <DialogSelect
      title="AI Model"
      placeholder="Search models"
      options={options()}
      current={app.config.aiModel}
      onSelect={(option) => select(option.value)}
    />
  )
}
