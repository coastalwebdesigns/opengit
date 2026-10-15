import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { batch, createContext, Show, useContext, type JSX, type ParentProps } from "solid-js"
import { useTheme } from "@context/theme"
import { Renderable, RGBA } from "@opentui/core"
import { createStore } from "solid-js/store"

export function DialogBody(props: ParentProps) {
  const theme = useTheme().theme
  return (
    <box paddingTop={1} gap={1} backgroundColor={theme.backgroundPanel}>
      {props.children}
    </box>
  )
}

export function DialogFooter(props: ParentProps) {
  const theme = useTheme().theme
  return (
    <box
      width="100%"
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={4}
      paddingRight={4}
      flexDirection="row"
      justifyContent="flex-end"
      alignItems="center"
      gap={1}
      flexShrink={0}
      backgroundColor={theme.backgroundElement}
    >
      {props.children}
    </box>
  )
}

export function Dialog(
  props: ParentProps<{
    size?: "medium" | "large"
    onClose: () => void
  }>,
) {
  const dimensions = useTerminalDimensions()
  const { theme } = useTheme()
  const renderer = useRenderer()

  return (
    <box
      onMouseUp={async () => {
        if (renderer.getSelection()) return
        props.onClose?.()
      }}
      width={dimensions().width}
      height={dimensions().height}
      alignItems="center"
      position="absolute"
      paddingTop={dimensions().height / 4}
      left={0}
      top={0}
      backgroundColor={RGBA.fromInts(0, 0, 0, 150)}
    >
      <box
        onMouseUp={async (e) => {
          if (renderer.getSelection()) return
          e.stopPropagation()
        }}
        width={props.size === "large" ? 80 : 60}
        maxWidth={dimensions().width - 2}
        backgroundColor={theme.backgroundPanel}
      >
        {props.children}
      </box>
    </box>
  )
}

function init() {
  const [store, setStore] = createStore({
    stack: [] as {
      element: JSX.Element
      onClose?: () => void
      dismissible: boolean
    }[],
    size: "medium" as "medium" | "large",
  })

  function dismiss() {
    const current = store.stack.at(-1)
    if (!current || !current.dismissible) return
    current.onClose?.()
    setStore("stack", store.stack.slice(0, -1))
    if (store.stack.length === 0) refocus()
  }

  useKeyboard((evt) => {
    if (evt.name === "escape" && store.stack.length > 0) {
      evt.preventDefault()
      evt.stopPropagation()
      dismiss()
    }
  })

  const renderer = useRenderer()
  let focus: Renderable | null
  function refocus() {
    setTimeout(() => {
      if (!focus) return
      if (focus.isDestroyed) return
      function find(item: Renderable) {
        for (const child of item.getChildren()) {
          if (child === focus) return true
          if (find(child)) return true
        }
        return false
      }
      const found = find(renderer.root)
      if (!found) return
      focus.focus()
    }, 1)
  }

  return {
    dismiss,
    clear() {
      for (const item of store.stack) {
        if (item.onClose) item.onClose()
      }
      batch(() => {
        setStore("size", "medium")
        setStore("stack", [])
      })
      refocus()
    },
    replace(input: any, onClose?: () => void) {
      if (store.stack.at(-1)?.dismissible === false) return
      if (store.stack.length === 0) {
        focus = renderer.currentFocusedRenderable
        focus?.blur()
      }
      for (const item of store.stack) {
        if (item.onClose) item.onClose()
      }
      setStore("size", "medium")
      setStore("stack", [
        {
          element: input,
          onClose,
          dismissible: true,
        },
      ])
    },
    push(input: JSX.Element, onClose?: () => void) {
      if (store.stack.at(-1)?.dismissible === false) return
      setStore("stack", store.stack.length, {
        element: input,
        onClose,
        dismissible: true,
      })
    },
    pop() {
      const current = store.stack.at(-1)
      if (!current) return
      current.onClose?.()
      setStore("stack", store.stack.slice(0, -1))
      if (store.stack.length === 0) refocus()
    },
    setDismissible(dismissible: boolean) {
      if (store.stack.length === 0) return
      setStore("stack", store.stack.length - 1, "dismissible", dismissible)
    },
    get stack() {
      return store.stack
    },
    get size() {
      return store.size
    },
    setSize(size: "medium" | "large") {
      setStore("size", size)
    },
  }
}

export type DialogContext = ReturnType<typeof init>

const ctx = createContext<DialogContext>()

export function DialogProvider(props: ParentProps) {
  const value = init()
  return (
    <ctx.Provider value={value}>
      {props.children}
      <box position="absolute">
        <Show when={value.stack.length}>
          <Dialog onClose={value.dismiss} size={value.size}>
            {value.stack.at(-1)!.element}
          </Dialog>
        </Show>
      </box>
    </ctx.Provider>
  )
}

export function useDialog() {
  const value = useContext(ctx)
  if (!value) {
    throw new Error("useDialog must be used within a DialogProvider")
  }
  return value
}
