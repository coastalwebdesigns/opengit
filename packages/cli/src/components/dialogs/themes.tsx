import { DialogSelect } from "@ui/dialog-select"
import { useTheme } from "@context/theme"
import { useDialog } from "@ui/dialog"
import { onCleanup } from "solid-js"

export default function ThemesDialog() {
  const theme = useTheme()
  const dialog = useDialog()

  const options = Object.keys(theme.all())
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map((value) => ({
      title: value,
      value,
    }))

  const initial = theme.selected
  let confirmed = false

  onCleanup(() => {
    if (!confirmed && initial) theme.set(initial)
  })

  return (
    <DialogSelect
      title="Themes"
      options={options}
      current={initial}
      onFilter={(query, filtered) => {
        const next = query.length === 0 ? initial : filtered[0]?.value
        if (next) theme.set(next)
      }}
      onMove={(opt) => {
        theme.set(opt.value)
      }}
      onSelect={(opt) => {
        theme.set(opt.value).then(() => {
          confirmed = true
          dialog.clear()
        })
      }}
    />
  )
}
