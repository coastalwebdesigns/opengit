import { createEffect, createMemo, createSignal, For, Show, untrack } from "solid-js"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useKeybind } from "@context/keybind"
import { tint, useTheme, getNameStatusColor } from "@context/theme"
import { useKeybindRoute } from "@ui/route"
import { Pane } from "@ui/pane"
import { Selection } from "@ui/selection"
import { useApplication } from "@context/application"
import { useWorkspace } from "@context/workspace"
import { Git } from "@lib/git"
import { useDialog } from "@ui/dialog"
import DiscardDialog from "@components/dialogs/discard"
import {
  buildFileTree,
  firstTreeChild,
  flattenTree,
  getFile,
  moveTreeSelection,
  treeParent,
  treePrefix,
} from "@util/tree"

export default function Files(props: { visible: boolean }) {
  const app = useApplication()
  const workspace = useWorkspace()
  const dialog = useDialog()
  const theme = useTheme().theme
  const keybind = useKeybind()
  const active = () => app.config.activePane === "files"
  const faded = () => tint(theme.text, theme.background, 0.75)
  const restorePath = workspace.file.path

  const [highlighted, setHighlighted] = createSignal(restorePath)
  const [collapsed, setCollapsed] = createSignal<ReadonlySet<string>>(new Set())
  const [loaded, setLoaded] = createSignal(false)

  let fileListScrollbox: ScrollBoxRenderable | undefined
  let previous: string[] = []

  const files = () => workspace.files
  const tree = createMemo(() => buildFileTree(files()))
  const rows = createMemo(() => flattenTree(tree(), collapsed()))
  const allRows = createMemo(() => flattenTree(tree()))
  const fileCount = createMemo(() => files().length)
  const selected = createMemo(() =>
    allRows()
      .filter((node) => node.type === "file")
      .findIndex((node) => node.fullPath === highlighted()),
  )

  const toggle = (path: string) => {
    const next = new Set(collapsed())
    if (next.has(path)) next.delete(path)
    else next.add(path)
    setCollapsed(next)
  }

  useKeybindRoute(async (event) => {
    if (!props.visible) return
    if (app.config.activePane !== "files") return

    if (keybind.match("next", event)) {
      setHighlighted(moveTreeSelection(rows(), highlighted(), 1))
      return
    }

    if (keybind.match("previous", event)) {
      setHighlighted(moveTreeSelection(rows(), highlighted(), -1))
      return
    }

    const node = rows().find((node) => node.fullPath === highlighted())

    if (keybind.match("tree_expand", event)) {
      if (node?.type !== "directory") return
      if (collapsed().has(node.fullPath)) {
        toggle(node.fullPath)
        return
      }
      setHighlighted(firstTreeChild(rows(), node.fullPath))
      return
    }

    if (keybind.match("tree_collapse", event)) {
      if (node?.type === "directory" && !collapsed().has(node.fullPath)) {
        toggle(node.fullPath)
        return
      }
      setHighlighted(treeParent(rows(), highlighted()))
      return
    }

    if (keybind.match("confirm", event) && node?.type === "directory") {
      toggle(node.fullPath)
      return
    }

    if (keybind.match("discard_file", event)) {
      const file = getFile(node)
      if (!file) return
      event.preventDefault()
      event.stopPropagation()
      dialog.replace(() => (
        <DiscardDialog
          file={file}
          onConfirm={async () => {
            await workspace.refreshFiles()
            dialog.clear()
          }}
          onCancel={() => {}}
        />
      ))
      return
    }

    if (keybind.match("discard_all_files", event)) {
      if (files().length === 0) return
      event.preventDefault()
      event.stopPropagation()
      dialog.replace(() => (
        <DiscardDialog
          all
          onConfirm={async () => {
            await workspace.refreshFiles()
            dialog.clear()
          }}
          onCancel={() => {}}
        />
      ))
      return
    }

    if (keybind.match("stage_unstage_file", event)) {
      const file = getFile(node)
      if (!file) return
      if (Git.isFileStaged(file.status)) {
        await workspace.unstage(file)
      } else {
        await workspace.stage(file)
      }
      return
    }
  })

  createEffect(() => {
    const next = rows()
    const all = allRows()
    const path = highlighted()
    if (!workspace.filesLoaded) return

    const index = previous.indexOf(path)
    previous = next.map((node) => node.fullPath)
    const first = all.find((node) => node.type === "file")

    if (!loaded()) {
      const restored = all.find((node) => node.fullPath === restorePath && node.type === "file")
      const target = restored ?? first
      setHighlighted(target?.fullPath ?? "")
      workspace.setFile(getFile(target) ?? { status: "", path: "" })
      setLoaded(true)
      return
    }

    const visible = next.find((node) => node.fullPath === path)
    if (!visible) {
      const target = next[Math.max(0, Math.min(next.length - 1, index))]
      setHighlighted(target?.fullPath ?? "")
      workspace.setFile(getFile(target) ?? getFile(first) ?? { status: "", path: "" })
      return
    }

    const current = all.find((node) => node.type === "file" && node.fullPath === untrack(() => workspace.file.path))
    workspace.setFile(getFile(visible) ?? getFile(current) ?? getFile(first) ?? { status: "", path: "" })
  })

  createEffect(() => {
    highlighted()
    const scrollbox = fileListScrollbox
    if (!scrollbox) return

    const selectedRowIndex = rows().findIndex((row) => row.fullPath === highlighted())
    if (selectedRowIndex < 0) return

    const viewportHeight = Math.max(1, scrollbox.viewport.height)
    const visibleStart = scrollbox.scrollTop
    const visibleEnd = visibleStart + viewportHeight - 1
    const minVisibleIndex = visibleStart
    const maxVisibleIndex = visibleEnd
    const maxScrollTop = Math.max(0, scrollbox.scrollHeight - viewportHeight)

    if (selectedRowIndex < minVisibleIndex) {
      scrollbox.scrollTo(selectedRowIndex)
      return
    }

    if (selectedRowIndex > maxVisibleIndex) {
      const targetScrollTop = selectedRowIndex - (viewportHeight - 1)
      const clampedScrollTop = Math.min(maxScrollTop, Math.max(0, targetScrollTop))
      if (clampedScrollTop !== visibleStart) {
        scrollbox.scrollTo(clampedScrollTop)
      }
    }
  })

  return (
    <Pane
      subtitle={selected() >= 0 ? `${selected() + 1}/${fileCount().toString()}` : undefined}
      active={active()}
      open={active()}
      fill={active()}
      flexGrow={active() ? 1 : 0}
      contentPadding={0}
    >
      <box width="100%" height="100%">
        <Show when={workspace.filesLoaded && !workspace.filesError && files().length === 0}>
          <box paddingLeft={1} paddingRight={1}>
            <text fg={theme.textMuted}>Working directory clean</text>
          </box>
        </Show>
        <Show when={rows().length > 0}>
          <scrollbox
            width="100%"
            height="100%"
            ref={(r) => {
              fileListScrollbox = r
            }}
          >
            <For each={rows()}>
              {(row) => {
                return (
                  <box
                    height={1}
                    onMouseUp={() => {
                      setHighlighted(row.fullPath)
                      if (row.type === "directory") toggle(row.fullPath)
                    }}
                  >
                    <Selection active={row.fullPath === highlighted()} inset={0} paddingRight={1}>
                      <box flexDirection="row" flexGrow={1} minWidth={0}>
                        <text fg={faded()} wrapMode="none" flexShrink={0}>
                          {treePrefix(row, collapsed())}
                        </text>
                        <text
                          fg={
                            row.type === "directory" ||
                            (app.config.diffDimStaged && Git.isFileFullyStaged(row.status ?? ""))
                              ? theme.textMuted
                              : theme.text
                          }
                          wrapMode="none"
                          truncate
                        >
                          {row.name}
                        </text>
                      </box>
                      <Show when={row.type === "file"}>
                        <text
                          flexShrink={0}
                          fg={
                            app.config.diffDimStaged && Git.isFileFullyStaged(row.status ?? "")
                              ? theme.textMuted
                              : getNameStatusColor(theme, row.status || "")
                          }
                        >
                          {row.status}
                        </text>
                      </Show>
                    </Selection>
                  </box>
                )
              }}
            </For>
          </scrollbox>
        </Show>
      </box>
    </Pane>
  )
}
