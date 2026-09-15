import { createMemo, createSignal, onCleanup, Show } from "solid-js"
import { TextareaRenderable, TextAttributes } from "@opentui/core"
import { useTheme } from "@context/theme"
import { useKeyboard } from "@opentui/solid"
import { useKeybind } from "@context/keybind"
import { Spinner } from "@components/spinner"
import { useApplication } from "@context/application"
import { useWorkspace } from "@context/workspace"
import { Opencode } from "@lib/opencode"
import { Git } from "@lib/git"
import { useToast } from "@context/toast"

interface CommitDialogProps {
  onConfirm: () => void
}

const PROMPT = `
Generate a conventional commit message for the staged changes.
- Use format: <type>: <description>
- Types: feat, fix, docs, refactor, test, chore
- Keep it under 50 characters
- No scope parentheses
- Return only the message, nothing else
`

export default function CommitDialog({ onConfirm }: CommitDialogProps) {
  const app = useApplication()
  const workspace = useWorkspace()
  const theme = useTheme().theme
  const keybind = useKeybind()
  const toast = useToast()

  let input: TextareaRenderable
  let disposed = false

  const files = createMemo(() => workspace.files.filter((file) => Git.isFileStaged(file.status)))
  const [commitMessage, setCommitMessage] = createSignal<string>("")
  const [generatingMessage, setGeneratingMessage] = createSignal(false)
  const [loading, setLoading] = createSignal(false)

  async function submit() {
    if (loading() || generatingMessage()) return
    if (files().length === 0) return
    if (commitMessage().trim() === "") return

    setLoading(true)
    const ok = await workspace.commit(commitMessage())
    setLoading(false)
    if (!ok) return

    onConfirm()
  }

  async function generateWithAi() {
    if (generatingMessage() || loading()) return
    if (files().length === 0) return

    setGeneratingMessage(true)
    if (input && !input.isDestroyed) {
      input.focusable = false
      input.blur()
    }

    try {
      const diff = await Git.getDiffStaged()
      if (disposed) return

      const res = await Opencode.prompt(PROMPT.concat("\n\n").concat(diff), app.config.aiModel)
      if (disposed) return

      const message = res.trim().split("\n")[0]
      if (message && input && !input.isDestroyed) {
        input.setText(message)
        input.cursorOffset = message.length
        setCommitMessage(message)
      }
    } catch (error) {
      toast.show({ message: "Failed to generate message with ai", variant: "error" })
      console.error("Failed to generate message with ai", error)
    } finally {
      setGeneratingMessage(false)
      setTimeout(() => {
        if (!input || input.isDestroyed) return
        input.focusable = true
        input.focus()
      }, 0)
    }
  }

  onCleanup(() => {
    disposed = true
  })

  useKeyboard((key) => {
    if (
      files().length > 0 &&
      !generatingMessage() &&
      !loading() &&
      app.config.aiEnabled &&
      keybind.match("trigger_generic_action", key)
    ) {
      generateWithAi()
      return
    }

    if (key.name === "return" && !key.shift) {
      key.preventDefault()
      key.stopPropagation()
      submit()
    }
  })

  return (
    <box paddingBottom={1} gap={1}>
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
          Commit files
        </text>
        <text fg={theme.textMuted}>esc</text>
      </box>
      <box paddingLeft={4} paddingRight={4} marginBottom={1} flexDirection="column" gap={1}>
        <Show when={files().length === 0}>
          <text fg={theme.textMuted}>No files to be committed</text>
        </Show>
        <Show when={files().length > 0}>
          <textarea
            focused={!generatingMessage()}
            placeholder="commit message..."
            textColor={generatingMessage() ? theme.textMuted : theme.text}
            focusedTextColor={generatingMessage() ? theme.textMuted : theme.text}
            showCursor={!generatingMessage()}
            minHeight={1}
            maxHeight={6}
            onContentChange={() => {
              if (generatingMessage()) return
              const value = input.plainText
              setCommitMessage(value)
            }}
            ref={(r: TextareaRenderable) => {
              input = r
              setTimeout(() => {
                if (!input) return
                if (input.isDestroyed) return
                input.focus()
                input.cursorColor = theme.text
              }, 0)
            }}
            cursorColor={theme.primary}
            focusedBackgroundColor={theme.backgroundPanel}
          />
          <Show when={app.config.aiEnabled}>
            <box flexDirection="row" gap={1}>
              <Show
                when={generatingMessage()}
                fallback={<text fg={theme.text}>{keybind.print("trigger_generic_action")}</text>}
              >
                <Spinner />
              </Show>
              <text fg={theme.textMuted}>
                {generatingMessage() ? "generating message with ai" : "generate message with ai"}
              </text>
            </box>
          </Show>
        </Show>
      </box>
      <box
        paddingLeft={4}
        paddingRight={4}
        width="100%"
        flexDirection="row"
        alignItems="flex-end"
        justifyContent="flex-end"
        gap={1}
      >
        <Show when={files().length > 0}>
          <Show when={loading()}>
            <Spinner />
          </Show>
          <text fg={generatingMessage() || loading() ? theme.textMuted : theme.text}>enter</text>
          <text fg={theme.textMuted}>confirm</text>
        </Show>
      </box>
    </box>
  )
}
