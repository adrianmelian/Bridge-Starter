# First launch

Follow the Quick start in README.md. There are no sample projects or hidden
connections to remove. `workspace/workspace.json` intentionally has an empty list.
Create your first project with your agent; reports can be added as Workspace cards.

Use `bridge.json` for the visible ship/captain/assistant names and `context/` for
instructions. Use your own CLI accounts and grant only the access you intend.
Do not copy somebody else's runtime state, .env, .codex or .claude account folder.
If a CLI was installed after the Bridge was opened, reopen the Bridge so its PATH
is refreshed. Do not restart while a chat is doing important unsaved work.

The app supports Windows x64. The installer does not bundle AI providers or model
weights. Dictation needs an independently configured local Whisper service.
Optional live voice is a separate API connection and can incur charges.
