import { ConsolePosition } from "@opentui/core"
import { render } from "@opentui/solid"
import { tui, version } from "./app"
import { Clipboard } from "@lib/clipboard"

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  console.log(version)
  process.exit(0)
}

await render(tui, {
  targetFps: 60,
  gatherStats: false,
  exitOnCtrlC: true,
  consoleOptions: {
    position: ConsolePosition.BOTTOM,
    maxStoredLogs: 1000,
    sizePercent: 70,
    onCopySelection: (text) => {
      Clipboard.copy(text).catch(console.error)
      console.info("Copied to clipboard")
    },
  },
})
