import { useTheme } from "@context/theme"
import { TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import { useWorkspace } from "@context/workspace"
import { type File } from "@lib/git"
import { DialogBody, DialogFooter } from "@ui/dialog"

interface DiscardDialogProps {
  file?: File
  all?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function DiscardDialog({ file, all, onConfirm }: DiscardDialogProps) {
  const theme = useTheme().theme
  const workspace = useWorkspace()

  useKeyboard((key) => {
    if (key.name === "return") {
      submit()
    }
  })

  async function submit() {
    if (all) await workspace.discardAll()
    else await workspace.discard(file!)

    onConfirm()
  }

  return (
    <DialogBody>
      <box
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
        gap={1}
        paddingLeft={4}
        paddingRight={4}
        marginBottom={1}
      >
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Discard {all ? "all changes" : "changes"}?
        </text>
        <text fg={theme.textMuted}>esc</text>
      </box>
      <box paddingLeft={4} paddingRight={4} marginBottom={1} flexDirection="column" gap={1}>
        <text fg={theme.textMuted}>
          {all ? "Discard all unstaged changes and untracked files?" : "Are you sure you want to discard changes to:"}
        </text>
        <text fg={theme.error}>{all ? "This cannot be undone." : `[*] ${file!.path}`}</text>
      </box>
      <DialogFooter>
        <text fg={theme.text}>enter</text>
        <text fg={theme.textMuted}>confirm</text>
      </DialogFooter>
    </DialogBody>
  )
}
