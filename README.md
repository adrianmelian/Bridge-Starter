# The Bridge - clean starter

A Windows desktop workspace for your own Codex and Claude chats, local files,
project reports and browser tabs. This edition starts with **zero projects and
zero conversations**. It includes no previous owner's data or accounts.

## Quick start (no developer tools needed)

1. Download **Bridge-Starter-0.1.2.zip** from this repository's Releases.
2. Extract the entire ZIP to a permanent folder such as `Documents/My Bridge`.
3. Run `The Bridge_0.1.2_x64-setup.exe` once. This installer is not code-signed;
   Windows may display a publisher warning. Use only the release you trust.
4. Install and sign in to at least one supported CLI using your own account:
   [Codex](https://developers.openai.com/codex/cli) or
   [Claude Code](https://code.claude.com/docs/en/setup).
5. Double-click **Start Bridge.cmd** inside the extracted `Bridge-Starter` folder.
   If a folder picker appears, select that same folder, which contains
   `workspace/workspace.json`.
6. Press **+** in the Ready Room and start a chat. Paste the first-session prompt below.

No Node.js or Rust installation is needed to run the packaged app. The installer
bundles Node and installs WebView2 when needed. Keep the extracted workspace:
your projects and local chat state will be saved there. Use the launcher when
switching workspace folders. The normal Start menu shortcut reopens the last one.

## Make it your ship

Edit `bridge.json` to set your ship name, captain label and assistant label, then
restart the app when your chats are idle. These labels do not set an AI's identity;
edit `context/data.md` for that. The context folder starts with blank owner data.

Suggested first message:

> Read AGENTS.md and the context documents. This is my new Bridge. Help me name
> my ship and establish my preferences, then ask about my first project. Do not
> configure paid integrations or publish anything without my instruction.

## Included features

- Saved chat history, rename/reconnect controls, model and effort selection.
- Latest-message tab ordering, resizable input, local typo correction and Stop.
- Conversation cards, collapsible tools, visible file links that reveal in Explorer.
- Workspace file browsing, report previews and browser tabs.
- Microphone dictation controls (a local Whisper engine/model must be configured
  separately; the engine and model are **not** included).

Agent subscriptions, CLI logins, MCP tools and optional voice API billing belong
to you. Connections start empty; bypass permissions are off by default. Optional
live voice needs your own API key in `.env`; text chats do not. There are no paid
calls or sign-ins performed by extracting this package.

## Backup and privacy

Keep `.env`, `.data`, `.mrmak`, account files and native CLI transcripts private.
A Git backup of project files is not a backup of native conversation history.
This repository has fresh history and contains only app source and starter files.
Your own workspace can be private; choose its Git destination before publishing.

## Build from source

Install Node.js 22.20+, Rust/MSVC and Tauri's Windows build prerequisites, then run
`npm ci`, `npm test`, then `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-starter.ps1`. The installer appears under
`src-tauri/target/release/bundle/nsis/`. Normal users should use the release ZIP.
See [getting started](docs/getting-started.md) and [third-party notices](THIRD_PARTY_NOTICES.md).
