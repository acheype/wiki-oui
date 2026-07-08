---
name: verify
description: Drive WikiOui end-to-end in a headless browser to verify changes at the real surface (pages, editor, revisions, server actions).
---

# Verify WikiOui

## Launch

```bash
pnpm dev -p 3210          # needs DATABASE_URL in .env pointing at Postgres
pnpm prisma db seed       # idempotent, restores the special pages
```

Server actions (save/delete/restore) need a real browser. Playwright browsers
are cached in `~/.cache/ms-playwright/`; `/usr/bin/chromium-browser` is a snap
stub — do NOT use it. In a scratch dir:

```bash
pnpm add playwright-core
# executablePath: ~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome, headless
```

A full scenario lives at the scratchpad `verify/verify.mjs` of past sessions;
rewrite from this outline if gone.

## Flows worth driving

1. `/` redirects to `/page-principale`; layout slots (title, menu, quick
   access, footer) come from the seeded pages.
2. Unknown slug → creation invite → editor → type MDX → save → shows page.
   Cover: `{{ id: '…' }}` annotation applied, `{expr}` neutralized (sandbox),
   unknown `<Component>` renders nothing, tags chip, menu updates.
3. Toolbar: select word + bold; link dialog (autocomplete chip, modal target)
   → on show page the link opens a Dialog with an iframe.
4. Second save → `/slug/revisions`: timeline dots, code checkbox, diff views,
   restore (appends a labeled revision).
5. Probes: broken MDX (`… {`) must show the error box, uppercase slug
   redirects, invalid slug 404s, special pages have no delete button,
   delete flow via the confirm dialog.

## Gotchas

- Type into `.cm-content` after `ControlOrMeta+a` + `Delete`; CodeMirror has
  no closeBrackets, so `{{` types literally.
- After clicking a timeline dot, `goto` its href (or wait for the URL) before
  clicking a view tab — the tab links embed the selected revision.
- Changing `next.config.ts` while `next dev` runs corrupts module resolution;
  restart the server (and `rm -rf .next` if errors persist).
- Cleanup: delete `bac-a-sable` through the UI at scenario start, not in SQL.
