# Starter release validation

This distribution was assembled in a separate directory from an explicit selection
of application source files. Project directories, personal context, native chat
history, runtime state, account configuration, attachments and previous Git history
were excluded. Context and onboarding documents were written fresh.

Checks performed for 0.1.2:
- Empty workspace manifest, generic labels, empty MCP config and bypass disabled.
- Production TypeScript/Vite build and Windows x64 Tauri/NSIS installer build.
- Isolated packaged-service browser smoke test: no saved chats, no Workspace cards,
  working first-chat screen and customizable ship/captain/assistant labels.
- Source and packaged-runtime scan for previous-owner markers and credential patterns.
- Native binary rebuilt with generic source/cache paths before packaging.
- ZIP contents restricted to tracked starter files, installer and start instructions.
- ZIP integrity check and SHA-256 download checksum.

The installer is unsigned. A clean Windows virtual-machine installation was not
performed; the desktop service and UI were tested in isolation without launching
real agents or signing into an account. Optional dictation requires a separately
configured Whisper engine/model. Optional live voice needs the recipient's API key.
