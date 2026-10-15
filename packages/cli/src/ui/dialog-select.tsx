import { InputRenderable, RGBA, ScrollBoxRenderable, TextAttributes } from "@opentui/core"
import { useTheme } from "@context/theme"
import { entries, filter, flatMap, groupBy, pipe } from "remeda"
import { batch, createEffect, createMemo, For, Show, type JSX, on } from "solid-js"
import { createStore } from "solid-js/store"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import * as fuzzysort from "fuzzysort"
import { isDeepEqual } from "remeda"
import { DialogBody, DialogFooter, useDialog, type DialogContext } from "./dialog"
import { Selection } from "./selection"
import { useKeybind } from "@context/keybind"
import { Keybind } from "@util/keybind"

function truncate(str: string, len: number): string {
  if (str.length <= len) return str
  return str.slice(0, len - 1) + "…"
}

export interface DialogSelectProps<T> {
  title: string
  placeholder?: string
  options: DialogSelectOption<T>[]
  flat?: boolean
  footer?: boolean
  marker?: boolean
  onMove?: (option: DialogSelectOption<T>) => void
  onFilter?: (query: string, filtered: DialogSelectOption<T>[]) => void
  onSelect?: (option: DialogSelectOption<T>) => void
  skipFilter?: boolean
  keybind?: {
    keybind?: Keybind.Info
    title: string
    side?: "left" | "right"
    disabled?: boolean
    onTrigger: (option: DialogSelectOption<T>) => void
  }[]
  current?: T
}

export interface DialogSelectOption<T = any> {
  title: string
  value: T
  description?: string
  footer?: JSX.Element | string
  category?: string
  categoryView?: JSX.Element
  disabled?: boolean
  bg?: RGBA
  gutter?: JSX.Element
  margin?: JSX.Element
  onSelect?: (ctx: DialogContext) => void
}

export function DialogSelect<T>(props: DialogSelectProps<T>) {
  const dialog = useDialog()
  const { theme } = useTheme()

  const [store, setStore] = createStore({
    selected: 0,
    filter: "",
    input: "keyboard" as "keyboard" | "mouse",
  })

  createEffect(
    on(
      () => props.current,
      (current) => {
        if (current) {
          const currentIndex = flat().findIndex((opt) => isDeepEqual(opt.value, current))
          if (currentIndex >= 0) {
            setStore("selected", currentIndex)
          }
        }
      },
    ),
  )

  let input: InputRenderable

  const filtered = createMemo(() => {
    if (props.skipFilter) return props.options.filter((x) => x.disabled !== true)
    const needle = store.filter.toLowerCase()
    const options = pipe(
      props.options,
      filter((x) => x.disabled !== true),
    )
    if (!needle) return options

    const result = fuzzysort
      .go(needle, options, {
        keys: ["title", "category"],
        scoreFn: (r) => r[0].score * 2 + r[1].score,
      })
      .map((x) => x.obj)

    return result
  })

  createEffect(() => {
    filtered()
    setStore("input", "keyboard")
  })

  const flatten = createMemo(() => props.flat && store.filter.length > 0)

  const grouped = createMemo<[string, DialogSelectOption<T>[]][]>(() => {
    if (flatten()) return [["", filtered()]]
    const result = pipe(
      filtered(),
      groupBy((x) => x.category ?? ""),
      entries(),
    )
    return result
  })

  const flat = createMemo(() => {
    return pipe(
      grouped(),
      flatMap(([_, options]) => options),
    )
  })

  const rows = createMemo(() => {
    const headers = grouped().reduce((acc, [category], i) => {
      if (!category) return acc
      return acc + (i > 0 ? 2 : 1)
    }, 0)
    return flat().length + headers
  })

  const dimensions = useTerminalDimensions()
  const height = createMemo(() => Math.min(rows(), Math.floor(dimensions().height / 2) - 6))

  const selected = createMemo(() => flat()[store.selected])

  createEffect(
    on([() => store.filter, () => props.current], ([filter, current]) => {
      setTimeout(() => {
        if (filter.length > 0) {
          moveTo(0, true)
        } else if (current) {
          const currentIndex = flat().findIndex((opt) => isDeepEqual(opt.value, current))
          if (currentIndex >= 0) {
            moveTo(currentIndex, true)
          }
        }
      }, 0)
    }),
  )

  function move(direction: number) {
    if (flat().length === 0) return
    let next = store.selected + direction
    if (next < 0) next = flat().length - 1
    if (next >= flat().length) next = 0
    moveTo(next, true)
  }

  function moveTo(next: number, center = false) {
    setStore("selected", next)
    const option = selected()
    if (option) props.onMove?.(option)
    if (!scroll) return
    const target = scroll.getChildren().find((child) => {
      return child.id === JSON.stringify(selected()?.value)
    })
    if (!target) return
    const y = target.y - scroll.y
    if (center) {
      const centerOffset = Math.floor(scroll.height / 2)
      scroll.scrollBy(y - centerOffset)
    } else {
      if (y >= scroll.height) {
        scroll.scrollBy(y - scroll.height + 1)
      }
      if (y < 0) {
        scroll.scrollBy(y)
        if (isDeepEqual(flat()[0].value, selected()?.value)) {
          scroll.scrollTo(0)
        }
      }
    }
  }

  const keybind = useKeybind()
  useKeyboard((evt) => {
    setStore("input", "keyboard")

    if (evt.name === "up" || (evt.ctrl && evt.name === "p")) move(-1)
    if (evt.name === "down" || (evt.ctrl && evt.name === "n")) move(1)
    if (evt.name === "pageup") move(-10)
    if (evt.name === "pagedown") move(10)
    if (evt.name === "home") moveTo(0)
    if (evt.name === "end") moveTo(flat().length - 1)

    if (evt.name === "return") {
      const option = selected()
      if (option) {
        evt.preventDefault()
        evt.stopPropagation()
        if (option.onSelect) option.onSelect(dialog)
        props.onSelect?.(option)
      }
    }

    for (const item of props.keybind ?? []) {
      if (item.disabled || !item.keybind) continue
      if (Keybind.match(item.keybind, keybind.parse(evt))) {
        const s = selected()
        if (s) {
          evt.preventDefault()
          item.onTrigger(s)
        }
      }
    }
  })

  let scroll: ScrollBoxRenderable | undefined

  const keybinds = createMemo(() => props.keybind?.filter((x) => !x.disabled && x.keybind) ?? [])
  const left = createMemo(() => keybinds().filter((item) => item.side !== "right"))
  const right = createMemo(() => keybinds().filter((item) => item.side === "right"))

  return (
    <DialogBody>
      <box paddingLeft={4} paddingRight={4}>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            {props.title}
          </text>
          <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
            esc
          </text>
        </box>
        <box paddingTop={1}>
          <input
            onInput={(e) => {
              batch(() => {
                setStore("filter", e)
                props.onFilter?.(e, filtered())
              })
            }}
            focusedBackgroundColor={theme.backgroundPanel}
            cursorColor={theme.primary}
            focusedTextColor={theme.textMuted}
            ref={(r) => {
              input = r
              input.traits = { status: "FILTER" }
              setTimeout(() => {
                if (!input) return
                if (input.isDestroyed) return
                input.focus()
              }, 1)
            }}
            placeholder={props.placeholder ?? "Search"}
            placeholderColor={theme.textMuted}
          />
        </box>
      </box>
      <Show
        when={grouped().length > 0}
        fallback={
          <box paddingLeft={4} paddingRight={4} paddingTop={1}>
            <text fg={theme.textMuted}>No results found</text>
          </box>
        }
      >
        <scrollbox
          paddingLeft={1}
          paddingRight={1}
          scrollbarOptions={{ visible: false }}
          ref={(r: ScrollBoxRenderable) => (scroll = r)}
          maxHeight={height()}
        >
          <For each={grouped()}>
            {([category, options], index) => (
              <>
                <Show when={category}>
                  <box paddingTop={index() > 0 ? 1 : 0} paddingLeft={3}>
                    <Show
                      when={options[0]?.categoryView}
                      fallback={
                        <text fg={theme.accent} attributes={TextAttributes.BOLD}>
                          {category}
                        </text>
                      }
                    >
                      {options[0]?.categoryView}
                    </Show>
                  </box>
                </Show>
                <For each={options}>
                  {(option) => {
                    const active = createMemo(() => isDeepEqual(option.value, selected()?.value))
                    const current = createMemo(() => props.marker !== false && isDeepEqual(option.value, props.current))
                    return (
                      <box
                        id={JSON.stringify(option.value)}
                        flexDirection="row"
                        position="relative"
                        onMouseMove={() => {
                          setStore("input", "mouse")
                        }}
                        onMouseUp={() => {
                          option.onSelect?.(dialog)
                          props.onSelect?.(option)
                        }}
                        onMouseOver={() => {
                          if (store.input !== "mouse") return
                          const index = flat().findIndex((x) => isDeepEqual(x.value, option.value))
                          if (index === -1) return
                          moveTo(index)
                        }}
                        onMouseDown={() => {
                          const index = flat().findIndex((x) => isDeepEqual(x.value, option.value))
                          if (index === -1) return
                          moveTo(index)
                        }}
                      >
                        <Show when={!current() && option.margin}>
                          <box position="absolute" left={1} flexShrink={0}>
                            {option.margin}
                          </box>
                        </Show>
                        <Selection active={active()} background={option.bg} inset={current() || option.gutter ? 0 : 2}>
                          <Option
                            title={option.title}
                            footer={flatten() ? (option.category ?? option.footer) : option.footer}
                            description={option.description !== category ? option.description : undefined}
                            current={current()}
                            gutter={option.gutter}
                          />
                        </Selection>
                      </box>
                    )
                  }}
                </For>
              </>
            )}
          </For>
        </scrollbox>
      </Show>
      <Show when={props.footer !== false} fallback={<box paddingBottom={1} />}>
        <DialogFooter>
          <box width="100%" flexDirection="row" justifyContent="space-between">
            <box flexDirection="row" gap={2}>
              <For each={left()}>
                {(item) => (
                  <text>
                    <span style={{ fg: theme.text }}>{Keybind.toString(item.keybind)} </span>
                    <span style={{ fg: theme.textMuted }}>{item.title}</span>
                  </text>
                )}
              </For>
            </box>
            <box flexDirection="row" gap={2}>
              <For each={right()}>
                {(item) => (
                  <text>
                    <span style={{ fg: theme.text }}>{Keybind.toString(item.keybind)} </span>
                    <span style={{ fg: theme.textMuted }}>{item.title}</span>
                  </text>
                )}
              </For>
              <box flexDirection="row" gap={1}>
                <text fg={selected() ? theme.text : theme.textMuted}>enter</text>
                <text fg={theme.textMuted}>select</text>
              </box>
            </box>
          </box>
        </DialogFooter>
      </Show>
    </DialogBody>
  )
}

function Option(props: {
  title: string
  description?: string
  current?: boolean
  footer?: JSX.Element | string
  gutter?: JSX.Element
  onMouseOver?: () => void
}) {
  const { theme } = useTheme()

  return (
    <>
      <Show when={props.current}>
        <text flexShrink={0} fg={theme.secondary} marginRight={0}>
          ●
        </text>
      </Show>
      <Show when={!props.current && props.gutter}>
        <box flexShrink={0} marginRight={0}>
          {props.gutter}
        </box>
      </Show>
      <text flexGrow={1} fg={theme.text} overflow="hidden" wrapMode="none">
        {truncate(props.title, 61)}
        <Show when={props.description}>
          <span style={{ fg: theme.textMuted }}> {props.description}</span>
        </Show>
      </text>
      <Show when={props.footer}>
        <box flexShrink={0}>
          <text fg={theme.textMuted}>{props.footer}</text>
        </box>
      </Show>
    </>
  )
}
