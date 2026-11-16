# OpenGit

█ Flat6 Solutions

To install globally:

```bash
npm i -g @flat6/opengit
```

```bash
bun install -g @flat6/opengit
```

This project was created using `bun create tui`. [create-tui](https://git.new/create-tui) is the easiest way to get started with OpenTUI.

## AI commit messages

AI messages are optional and require OpenCode 2.3 or later with a connected provider or an available local model.
OpenGit reuses the local OpenCode service and can start it when OpenCode is installed but not running.
It never installs, upgrades, replaces, or stops your shared OpenCode service.

Choose a model under **Settings → AI → Model**. On first discovery, OpenGit randomly selects an eligible model
and saves that choice for future launches. Usage follows your provider's billing or subscription limits.
OpenCode-only free chat models, including Big Pickle, are excluded.
If your saved model becomes unavailable, choose a replacement explicitly; OpenGit does not silently switch providers.

Connect providers in OpenCode, then reopen the model picker to refresh the list. If OpenCode is missing or
unavailable, manual commits work normally. Provider credentials remain managed by OpenCode.
