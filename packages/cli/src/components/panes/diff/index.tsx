import { createMemo, Show } from "solid-js"
import { useApplication } from "@context/application"
import { useWorkspace } from "@context/workspace"
import { Pane } from "@ui/pane"
import { useTheme } from "@context/theme"
import { filetype } from "@util/code"
import { Git } from "@lib/git"
import KeybindHelper from "@components/keybind-helper"
import { useFileContent } from "@components/panes/content"

export default function Diff() {
  const app = useApplication()
  const workspace = useWorkspace()
  const { theme, syntax } = useTheme()

  const diff = useFileContent(
    () => workspace.file,
    (_absolute, file) => Git.getDiff(file.path, file.status),
  )

  const counts = createMemo(() => Git.getLineCounts(diff()))
  const dimmed = createMemo(() => app.config.diffDimStaged && Git.isFileFullyStaged(workspace.file.status))
  const rendered = createMemo(() => {
    const value = diff()
    if (!value) return
    return { value, dimmed: dimmed() }
  })
  const diffFiletype = createMemo(() => {
    const type = filetype(workspace.file.path)
    if (type === "astro") return "html"
    return type
  })

  const subtitle = createMemo(() => {
    const d = diff()
    if (!d) return undefined
    const c = counts()
    if (c.added === 0 && c.removed === 0) return undefined
    return (
      <box flexDirection="row" gap={1} paddingRight={1}>
        {c.added > 0 && <text fg={dimmed() ? theme.textMuted : theme.success}>+{c.added}</text>}
        {c.removed > 0 && <text fg={dimmed() ? theme.textMuted : theme.error}>-{c.removed}</text>}
      </box>
    )
  })

  return (
    <Pane title={workspace.file.path} subtitle={subtitle()} contentPadding={0}>
      <box width="100%" height="100%" flexDirection="column" gap={1}>
        <Show when={!diff()} keyed>
          <box>
            <text fg={theme.textMuted}>No changes to display</text>
          </box>
        </Show>
        <Show when={rendered()} keyed>
          {(d: { value: string; dimmed: boolean }) => (
            <>
              <scrollbox width="100%" height="100%" scrollX={true}>
                <diff
                  keyed
                  diff={d.value}
                  view={app.config.diffView}
                  wrapMode={app.config.diffWrap ? "word" : "none"}
                  filetype={d.dimmed ? "opengit-plain-text" : diffFiletype()}
                  syntaxStyle={syntax()}
                  showLineNumbers={true}
                  width="100%"
                  fg={dimmed() ? theme.textMuted : theme.text}
                  addedBg={dimmed() ? theme.backgroundElement : "#1F3025"}
                  removedBg={dimmed() ? theme.backgroundElement : "#372526"}
                  contextBg={theme.background}
                  addedSignColor={dimmed() ? theme.textMuted : "#88d39b"}
                  removedSignColor={dimmed() ? theme.textMuted : "#f0a0a0"}
                  lineNumberFg={theme.diffLineNumber}
                  lineNumberBg={theme.background}
                  addedLineNumberBg={dimmed() ? theme.backgroundElement : "#1F3025"}
                  removedLineNumberBg={dimmed() ? theme.backgroundElement : "#372526"}
                />
              </scrollbox>
              <KeybindHelper label="View File" key="trigger_diff" />
            </>
          )}
        </Show>
      </box>
    </Pane>
  )
}
