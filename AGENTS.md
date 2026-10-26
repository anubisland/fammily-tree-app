# AGENTS.md

Guidance for AI coding agents working in this repository. See `CLAUDE.md` for the full project guidance.

<!-- BEGIN firebase-access pointer -->

## Firebase access

Before asking which Firebase project this is, where its credentials are, or what
its environment variables are called, run:

```bash
node ~/.claude/skills/firebase-access/scripts/fbctl.mjs resolve
```

It answers from a machine-local registry — project id, platform, env var naming,
and whether credentials are stored — so none of that needs asking again. Use
`fbctl env <alias> --platform=<p>` for a filled `.env`, and `fbctl scaffold` for
the house client file.

Three rules that matter wherever Firebase is touched:

- **Never put a credential on a command line.** Use `fbctl exec <alias> -- <cmd>`,
  which injects it into the child's environment. Agent harnesses record an
  approved command verbatim, so a key inside one becomes permanent plaintext.
- **A web `apiKey` is public by design** — it ships in every client bundle.
  `firestore.rules` is the real access control, so fix rules, not keys.
- **If `resolve` refuses** because evidence "could not be read", fix the file it
  names rather than working around it. It means this folder's Firebase identity
  is unreadable, and guessing past it can point the session at another project.

Full rules live in the org's internal standards repo, installed locally at
`~/.claude/skills/firebase-access/` — `SKILL.md` for Claude Code, `AGENTS.md`
for any other assistant.

<!-- END firebase-access pointer -->
