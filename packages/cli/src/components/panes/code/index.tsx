import { Show } from "solid-js"
import { useWorkspace } from "@context/workspace"
import { Pane } from "@ui/pane"
import { useTheme } from "@context/theme"
import { filetype } from "@util/code"
import KeybindHelper from "@components/keybind-helper"
import { useFileContent } from "@components/panes/content"

export default function Code() {
  const workspace = useWorkspace()
  const { theme, syntax } = useTheme()

  const code = useFileContent(
    () => workspace.file,
    (absolute) => Bun.file(absolute).text(),
  )

  return (
    <Pane title={workspace.file.path} contentPadding={0}>
      <box width="100%" height="100%" flexDirection="column" gap={1}>
        <Show when={!code()} keyed>
          <box>
            <text fg={theme.textMuted}>No changes to display</text>
          </box>
        </Show>
        <Show when={code()} keyed>
          {(value: string) => (
            <scrollbox width="100%" height="100%" scrollX={true}>
              <code
                syntaxStyle={syntax()}
                content={value}
                filetype={filetype(workspace.file.path)}
                width="100%"
                fg={theme.text}
              />
            </scrollbox>
          )}
        </Show>
        <KeybindHelper label="View Diff" key="trigger_diff" />
      </box>
    </Pane>
  )
}
