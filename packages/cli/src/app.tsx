import { KVProvider } from "@context/kv"
import { ApplicationProvider, useApplication } from "@context/application"
import { WorkspaceProvider, useWorkspace } from "@context/workspace"
import { ThemeProvider, useTheme } from "@context/theme"
import { KeybindProvider, useKeybind } from "@context/keybind"
import { Clipboard } from "@lib/clipboard"
import { useRenderer } from "@opentui/solid"
import { TextAttributes } from "@opentui/core"
import { useDialog, DialogProvider } from "@ui/dialog"
import { Toast, ToastProvider, useToast } from "@context/toast"
import { useKeybindRoute } from "@ui/route"
import Keybinds from "@components/keybinds"
import { createMemo, createSignal, Show, onMount } from "solid-js"
import { Opencode } from "@lib/opencode"
import Sidebar from "@components/sidebar"
import Main from "@components/main"
import ThemesDialog from "@components/dialogs/themes"
import SettingsDialog from "@components/dialogs/settings"
import { Frame } from "@ui/frame"

declare const OPENGIT_VERSION: string | undefined

export const version = typeof OPENGIT_VERSION === "undefined" ? "dev" : OPENGIT_VERSION

export function tui() {
  return (
    <ToastProvider>
      <KVProvider>
        <ApplicationProvider>
          <WorkspaceProvider>
            <ThemeProvider mode="dark">
              <KeybindProvider>
                <DialogProvider>
                  <App />
                </DialogProvider>
              </KeybindProvider>
            </ThemeProvider>
          </WorkspaceProvider>
        </ApplicationProvider>
      </KVProvider>
    </ToastProvider>
  )
}

function App() {
  const renderer = useRenderer()
  const keybind = useKeybind()
  const theme = useTheme()
  const dialog = useDialog()
  const app = useApplication()
  const workspace = useWorkspace()
  const toast = useToast()
  const [sidebar, setSidebar] = createSignal(true)
  const count = () => workspace.files.length
  const changes = createMemo(() =>
    workspace.files.reduce(
      (total, file) => ({
        added: total.added + (file.added ?? 0),
        removed: total.removed + (file.removed ?? 0),
      }),
      { added: 0, removed: 0 },
    ),
  )

  function exit() {
    Opencode.closeClient()
    renderer.setTerminalTitle("")
    renderer.destroy()
    process.exit(0)
  }

  async function setup() {
    const available = await Opencode.providers()
    if (available.length > 0) {
      app.setConfig({ aiEnabled: true })
    }
  }

  useKeybindRoute(
    (event) => {
      if (keybind.match("theme_mode_toggle", event)) {
        event.preventDefault()
        event.stopPropagation()
        dialog.replace(() => <ThemesDialog />)
        return
      }

      if (keybind.match("debug_toggle", event)) {
        renderer?.console.toggle()
        renderer?.toggleDebugOverlay()
      }

      if (keybind.match("settings_open", event)) {
        event.preventDefault()
        event.stopPropagation()
        dialog.replace(() => <SettingsDialog />)
        return
      }

      if (keybind.match("diff_view_toggle", event)) {
        app.setDiffView(app.config.diffView === "split" ? "unified" : "split")
        return
      }

      if (keybind.match("trigger_sidebar", event)) {
        setSidebar(!sidebar())
        return
      }

      if (keybind.match("app_exit", event)) {
        exit()
      }
    },
    ["theme_mode_toggle", "debug_toggle"],
  )

  onMount(setup)

  return (
    <>
      <Toast />
      <box
        flexDirection="column"
        // gap={1}
        backgroundColor={theme.theme.background}
        // padding={1}
        width="100%"
        height="100%"
        onMouseUp={async () => {
          const text = renderer.getSelection()?.getSelectedText()
          if (text && text.length > 0) {
            const base64 = Buffer.from(text).toString("base64")
            const osc52 = `\x1b]52;c;${base64}\x07`
            const finalOsc52 = process.env["TMUX"] ? `\x1bPtmux;\x1b${osc52}\x1b\\` : osc52
            /* @ts-expect-error */
            renderer.writeOut(finalOsc52)
            await Clipboard.copy(text)
              .then(() => toast.show({ message: "Copied to clipboard", variant: "info" }))
              .catch(toast.error)
            renderer.clearSelection()
          }
        }}
      >
        <box
          height={1}
          flexShrink={0}
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
          paddingLeft={1}
          paddingRight={1}
        >
          <box flexDirection="row">
            <text fg={theme.theme.text} attributes={TextAttributes.BOLD} wrapMode="none">
              OpenGit
            </text>
            <text fg={theme.theme.textMuted} wrapMode="none">
              {` ${version === "dev" ? version : `v${version}`}`}
            </text>
          </box>
          <Show
            when={workspace.filesLoaded && !workspace.filesError}
            fallback={
              <text fg={theme.theme.textMuted} wrapMode="none">
                {workspace.filesError ? "Unavailable" : "Loading..."}
              </text>
            }
          >
            <box flexDirection="row" gap={1}>
              <Show when={changes().added > 0}>
                <text fg={theme.theme.success} wrapMode="none">
                  +{changes().added}
                </text>
              </Show>
              <Show when={changes().removed > 0}>
                <text fg={theme.theme.error} wrapMode="none">
                  -{changes().removed}
                </text>
              </Show>
              <Show when={count() > 0}>
                <text fg={theme.theme.textMuted} wrapMode="none">
                  {`${count()} ${count() === 1 ? "file" : "files"}`}
                </text>
              </Show>
            </box>
          </Show>
        </box>
        <Frame sidebar={sidebar()} side={<Sidebar visible={sidebar()} />}>
          <Main />
        </Frame>
        <Keybinds />
      </box>
    </>
  )
}
