// Only recognize native CLI error lines, never echo their credential-bearing text.
export function terminalNotice(screen, agent, session) {
  if (!['codex', 'claude'].includes(agent)) return null;
  // Codex redraws old errors when resuming history. They are not new failures.
  if (session?.startedAt && Date.parse(session.lastInputAt || '') < session.startedAt) return null;
  if (session?.startedAt && !session.lastInputAt) return null;
  let lines = String(screen).split('\n');
  // A resumed CLI's fresh heading supersedes retained terminal scrollback.
  const heading = lines.findLastIndex(line => />_ OpenAI Codex|Claude Code v\d/.test(line));
  if (heading >= 0) lines = lines.slice(heading + 1);
  let notice = null;
  for (const line of lines) {
    if (/^[•●] \S/.test(line)) notice = null;
    if (/^(?:■\s+(?:unexpected status\s+401|.*authentication)|API Error:\s*401|\s*⎿\s*API Error:\s*401)/i.test(line)) {
      notice = { kind: 'authentication', text: 'The agent could not reply because authentication failed. Your message is saved. Reconnect this chat to reload its login; if it fails again, sign in through Terminal.' };
    } else if (/^■\s+unexpected status\s+\d{3}/i.test(line)) {
      notice = { kind: 'request', text: 'The agent request failed. Your message is saved. Open Terminal for details before retrying.' };
    }
  }
  return notice;
}
