# The Bridge

A Windows desktop home for your Codex and Claude chats, local files, project
reports and browser tabs. This starter gives you an empty Bridge to make your
own: **no existing projects, conversations, accounts or personal context**.

[Download the Windows starter](https://github.com/adrianmelian/Bridge-Starter/releases/latest)
or choose **Use this template** to create your own repository.

## Start with an agent

Install and sign in to at least one supported CLI with your own account first:
[Codex CLI](https://developers.openai.com/codex/cli) or
[Claude Code CLI](https://code.claude.com/docs/en/setup).

Download the starter ZIP from [Releases](https://github.com/adrianmelian/Bridge-Starter/releases/latest)
and extract the whole archive to a permanent location, such as `Documents/My Bridge`.
Open the **`Bridge-Starter` subfolder** in Codex CLI or Claude Code. This is the
workspace folder: it contains `AGENTS.md`, `bridge.json` and `Start Bridge.cmd`.
If you used the GitHub template instead, open your cloned repository folder.

Paste this prompt into your agent:

> Set up this Bridge starter workspace on my Windows computer. Read AGENTS.md,
> README.md and docs/getting-started.md first. Check that I am on Windows x64 and
> that Codex CLI or Claude Code CLI is installed and signed in with my own account.
> Install and open the desktop Workspace app for me. Use the Windows setup EXE
> included beside the extracted Bridge-Starter folder. If it is missing (for
> example, I cloned the template), download the starter ZIP from
> https://github.com/adrianmelian/Bridge-Starter/releases/latest and extract its
> installer without overwriting my workspace. Run `The Bridge_<version>_x64-setup.exe`
> and guide me through any Windows installer dialogs that require my input. If
> The Bridge is already installed, check it before reinstalling, and ask before
> closing any running app or chat. Then run Start Bridge.cmd from this workspace
> folder to launch the installed data-workspace.exe with this folder selected.
> If a folder picker appears, help me select the folder containing
> workspace/workspace.json. Verify that the Bridge window opens and loads this
> workspace; do not stop after downloading the installer. Use the packaged app
> unless I specifically ask to build from source.
> Leave optional voice, dictation, paid providers and MCP connections off until I
> choose to connect them. Leave CLI logins in their own account storage; keep any
> optional API keys in the ignored .env file and never commit credentials. Do not
> publish anything or make paid calls without asking me. Then
> help me set my ship, captain and assistant names in bridge.json, record my
> preferences in context/, and create my first project.

The repository contains the app source, instructions and an empty workspace. You
bring your own agent accounts and any services you choose to connect. Prefer to do
it by hand? Follow the Quick start below.

## Quick start (manual setup)

1. Download the **Bridge-Starter ZIP** from
   [Releases](https://github.com/adrianmelian/Bridge-Starter/releases/latest).
2. Extract the entire ZIP to a permanent folder such as `Documents/My Bridge`.
3. Run the included `The Bridge_<version>_x64-setup.exe` once. This installer is not code-signed;
   Windows may display a publisher warning. Use only the release you trust.
4. Install and sign in to at least one supported CLI using your own account:
   [Codex](https://developers.openai.com/codex/cli) or
   [Claude Code](https://code.claude.com/docs/en/setup).
5. Double-click **Start Bridge.cmd** inside the extracted `Bridge-Starter` folder.
   If a folder picker appears, select that same folder, which contains
   `workspace/workspace.json`.
6. Press **+** in the Ready Room and start a chat. Paste the first-session prompt below.

No Node.js or Rust installation is needed to run the packaged app. The launcher
opens the installed Workspace executable, `data-workspace.exe`, with your chosen
workspace folder. The installer bundles Node and installs WebView2 when needed.
Keep the extracted workspace:
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
