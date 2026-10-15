import { createSignal, For, Show } from "solid-js"
import { ScrollBoxRenderable, TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import { Spinner } from "@components/spinner"
import { useWorkspace } from "@context/workspace"
import { useKeybind } from "@context/keybind"
import { useTheme } from "@context/theme"
import { useToast } from "@context/toast"
import { DialogBody, DialogFooter, useDialog } from "@ui/dialog"
import { Selection } from "@ui/selection"

const options = [
  {
    command: "git push",
    force: false,
  },
  {
    command: "git push --force-with-lease",
    force: true,
  },
]

export default function PushDialog() {
  const dialog = useDialog()
  const workspace = useWorkspace()
  const keybind = useKeybind()
  const toast = useToast()
  const theme = useTheme().theme
  const [selected, setSelected] = createSignal(0)
  const [loading, setLoading] = createSignal(false)

  async function push() {
    if (loading()) return
    if (options[selected()]!.force) {
      dialog.push(() => <ForcePushDialog />)
      return
    }

    setLoading(true)
    dialog.setDismissible(false)
    const result = await workspace.push(false)
    if (result.ok) {
      dialog.clear()
      toast.show({ message: "Push completed", variant: "success" })
      return
    }

    setLoading(false)
    dialog.setDismissible(true)
    dialog.push(() => <PushErrorDialog message={result.message} />)
  }

  useKeyboard((key) => {
    if (loading()) return
    if (keybind.match("previous", key) || keybind.match("next", key)) {
      key.preventDefault()
      key.stopPropagation()
      setSelected((value) => (value === 0 ? 1 : 0))
      return
    }
    if (key.name !== "return") return
    key.preventDefault()
    key.stopPropagation()
    push()
  })

  return (
    <DialogBody>
      <Header title="Push changes" />
      <box paddingLeft={1} paddingRight={1} flexDirection="column">
        <For each={options}>
          {(option, index) => {
            const active = () => selected() === index()
            return (
              <box
                flexDirection="column"
                onMouseOver={() => setSelected(index())}
                onMouseUp={() => {
                  setSelected(index())
                  push()
                }}
              >
                <Selection active={active()}>
                  <text fg={theme.text} attributes={TextAttributes.BOLD}>
                    {option.command}
                  </text>
                </Selection>
              </box>
            )
          }}
        </For>
      </box>
      <Footer loading={loading()} label="push" />
    </DialogBody>
  )
}

function ForcePushDialog() {
  const dialog = useDialog()
  const workspace = useWorkspace()
  const toast = useToast()
  const theme = useTheme().theme
  const [loading, setLoading] = createSignal(false)

  async function push() {
    if (loading()) return
    setLoading(true)
    dialog.setDismissible(false)
    const result = await workspace.push(true)
    if (result.ok) {
      dialog.clear()
      toast.show({ message: "Push completed", variant: "success" })
      return
    }

    setLoading(false)
    dialog.setDismissible(true)
    dialog.pop()
    dialog.push(() => <PushErrorDialog message={result.message} />)
  }

  useKeyboard((key) => {
    if (key.name !== "return" || loading()) return
    key.preventDefault()
    key.stopPropagation()
    push()
  })

  return (
    <DialogBody>
      <Header title="Force push?" />
      <box paddingLeft={4} paddingRight={4} marginBottom={1} flexDirection="column" gap={1}>
        <text fg={theme.warning} attributes={TextAttributes.BOLD}>
          This can overwrite remote history.
        </text>
        <text fg={theme.textMuted}>The push will be rejected if the remote branch changed since your last fetch.</text>
        <text fg={theme.text}>git push --force-with-lease</text>
      </box>
      <Footer loading={loading()} label="confirm" />
    </DialogBody>
  )
}

function PushErrorDialog(props: { message: string }) {
  const theme = useTheme().theme
  let scroll: ScrollBoxRenderable | undefined

  useKeyboard((key) => {
    if (key.name === "up" || key.name === "k") scroll?.scrollBy(-1)
    if (key.name === "down" || key.name === "j") scroll?.scrollBy(1)
    if (key.name === "pageup") scroll?.scrollBy(-8)
    if (key.name === "pagedown") scroll?.scrollBy(8)
  })

  return (
    <DialogBody>
      <Header title="Push failed" />
      <scrollbox
        ref={(value) => (scroll = value)}
        paddingLeft={4}
        paddingRight={4}
        maxHeight={12}
        scrollbarOptions={{ visible: true }}
      >
        <text fg={theme.error} wrapMode="word">
          {props.message}
        </text>
      </scrollbox>
      <DialogFooter>
        <text fg={theme.text}>esc</text>
        <text fg={theme.textMuted}>back</text>
      </DialogFooter>
    </DialogBody>
  )
}

function Header(props: { title: string }) {
  const theme = useTheme().theme
  return (
    <box
      flexDirection="row"
      alignItems="center"
      justifyContent="space-between"
      paddingLeft={4}
      paddingRight={4}
      marginBottom={1}
    >
      <text fg={theme.text} attributes={TextAttributes.BOLD}>
        {props.title}
      </text>
      <text fg={theme.textMuted}>esc</text>
    </box>
  )
}

function Footer(props: { loading: boolean; label: string }) {
  const theme = useTheme().theme
  return (
    <DialogFooter>
      <Show when={props.loading}>
        <Spinner />
      </Show>
      <text fg={props.loading ? theme.textMuted : theme.text}>enter</text>
      <text fg={theme.textMuted}>{props.loading ? "pushing" : props.label}</text>
    </DialogFooter>
  )
}
