import type { KeyEvent } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import { useDialog } from "@ui/dialog"
import { useKeybind } from "@context/keybind"
import type { KeybindsConfig } from "@util/config"

export function useKeybindRoute(handler: (event: KeyEvent) => void, bypass?: Array<keyof KeybindsConfig>) {
  const dialog = useDialog()
  const keybind = useKeybind()
  useKeyboard((event) => {
    if (dialog.stack.length > 0 && !bypass?.some((key) => keybind.match(key, event))) return
    handler(event)
  })
}
