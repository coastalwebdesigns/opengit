import { RGBA } from "@opentui/core"
import type { ParentProps } from "solid-js"
import { tint, useTheme } from "@context/theme"
import { SplitBorder } from "@util/border"

export function Selection(
  props: ParentProps<{ active: boolean; background?: RGBA; inset?: number; paddingRight?: number }>,
) {
  const theme = useTheme().theme
  return (
    <box
      width="100%"
      minWidth={0}
      border={["left"]}
      customBorderChars={{ ...SplitBorder.customBorderChars, vertical: "│" }}
      borderColor={props.active ? theme.secondary : RGBA.fromInts(0, 0, 0, 0)}
    >
      <box
        flexDirection="row"
        minWidth={0}
        paddingLeft={props.inset ?? 2}
        paddingRight={props.paddingRight ?? 3}
        gap={1}
        backgroundColor={
          props.active
            ? (props.background ?? tint(theme.backgroundPanel, theme.secondary, 0.25))
            : RGBA.fromInts(0, 0, 0, 0)
        }
      >
        {props.children}
      </box>
    </box>
  )
}
