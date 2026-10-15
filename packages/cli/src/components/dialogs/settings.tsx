import { DialogSelect } from "@ui/dialog-select"
import { useApplication } from "@context/application"
import { useTheme } from "@context/theme"
import ThemesDialog from "./themes"
import ModelsDialog from "./models"

export default function SettingsDialog() {
  const app = useApplication()
  const theme = useTheme()

  return (
    <DialogSelect
      title="Settings"
      footer={false}
      options={[
        {
          title: "Layout",
          footer: app.config.diffView === "split" ? "Split" : "Unified",
          value: "diff-view",
          category: "Diff",
          onSelect: () => app.setDiffView(app.config.diffView === "split" ? "unified" : "split"),
        },
        {
          title: "Wrapping",
          footer: app.config.diffWrap ? "On" : "Off",
          value: "diff-wrap",
          category: "Diff",
          onSelect: () => app.setDiffWrap(!app.config.diffWrap),
        },
        {
          title: "Dim staged files",
          footer: app.config.diffDimStaged ? "On" : "Off",
          value: "diff-dim-staged",
          category: "Diff",
          onSelect: () => app.setDiffDimStaged(!app.config.diffDimStaged),
        },
        {
          title: "Model",
          footer: `${app.config.aiModel.providerID}/${app.config.aiModel.modelID}`,
          value: "ai-model",
          category: "AI",
          onSelect: (dialog) => dialog.replace(() => <ModelsDialog />),
        },
        {
          title: "Theme",
          footer: theme.selected,
          value: "theme",
          category: "Appearance",
          onSelect: (dialog) => dialog.replace(() => <ThemesDialog />),
        },
        {
          title: "Color mode",
          footer: theme.mode() === "dark" ? "Dark" : "Light",
          value: "theme-mode",
          category: "Appearance",
          onSelect: () => theme.setMode(theme.mode() === "dark" ? "light" : "dark"),
        },
      ]}
    />
  )
}
