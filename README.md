# WikiOui

WikiOui is a wiki engine: it lets you run collaborative sites where every page is written in MDX and edited in place, in the browser. It is a **rewrite of [YesWiki](https://github.com/YesWiki/yeswiki)** on a modern stack — Next.js, Prisma, PostgreSQL, shadcn/ui — with a stronger focus on ergonomics and visual polish (UI/UX) than the PHP original.

Design docs live in this repo: [`docs/architecture.md`](docs/architecture.md) (plus one ADR per structural decision, in [`docs/adr/`](docs/adr/)) and a domain glossary in [`CONTEXT.md`](CONTEXT.md).

## What is YesWiki?

[YesWiki](https://github.com/YesWiki/yeswiki) is a mature, widely deployed open-source wiki engine (PHP), popular in the French non-profit, cooperative and community sector. Its main building blocks:

- **Wiki pages** — any page can be created and edited by visiting its URL; every save is versioned.
- **BazaR** — a forms module: an admin defines a form (a set of typed fields), visitors fill it in, and each submission becomes a structured "fiche" (entry/record). Entries can then be listed back on any page through a family of display actions — list, grid/blocks, map, calendar, directory, carousel, photo gallery — with search, filters and sorting.
- **Rich content components** ("actions"), inserted through a builder UI, for buttons, images, file downloads, embeds, menus, and more.
- **File/media management**, **access rights & authentication**, **page history with diff/restore**, **theming**, and an **extension/plugin ecosystem**.

WikiOui re-implements this feature set — currently pages, revisions, components, forms & entries, and the entries-display views — on a typed, contract-driven codebase, starting from scratch on today's frontend tooling.

## Why a rewrite?

- **Modern stack**: Next.js App Router, Prisma/PostgreSQL, TypeScript end to end, Zod as the runtime contract, shadcn/ui + Tailwind — instead of YesWiki's PHP/jQuery/Bazaar stack.
- **Ergonomics first**: every screen (editor, builders, history, entries views) is designed for a smooth, modern editing experience, not just functional parity.
- **Explicit contracts**: components and forms are described by co-located descriptors (YAML/Zod), verified by signature at build time — see [ADR 0013](docs/adr/0013-yaml-only-descriptor-verified-by-signature.md) and [ADR 0015](docs/adr/0015-shared-field-renderer-zod.md).

## Releases

### v0.1 — MVP

Core wiki engine: page CRUD by slug, native Next.js page/handler routing, sandboxed MDX rendering, the built-in `<Menu>` and `<Button>` components, full revision history (diff + restore), the layout special pages, a rich CodeMirror editor (markdown toolbar, link modal, cursor-anchored contextual tools), and hard delete.

### v0.2 — File upload & component authoring

File upload (toolbar button, drag & drop, paste) routed to `<Image>`, `<Pdf>` or `<FileLink>` by file family, with the `files/` directory as source of truth. **ComponentBuilder**: an authoring modal auto-generated from each component's YAML descriptor, with live preview through the real rendering pipeline, and an embedded Iconify icon picker.

### v0.3 — Forms & entries

The BazaR equivalent: a **FormBuilder** (14 field types, drag & drop) to define forms, `<EntryForm>` to fill them in, entries rendered by an optional MDX template or a generated default view, a field renderer shared with ComponentBuilder, and Zod as the runtime contract. Along the way: an HTML-tag allowlist and an `<Embed>` component hardening the MDX sandbox, plus "change address" (slug renaming with full reference rewrite, no redirect) for pages, forms and fields.

### v0.4 — EntriesView (in progress)

`<EntriesView>`: the nine entries-display views (list, grid, table, map, calendar, agenda, directory, carousel, photo gallery) in a single component, with instant client-side search/filter/sort, per-field color & icon, and a shared entry popup. Along the way: automatic entry titles moved from a read-time computation to a write-time one (stored, never stale — [ADR 0020](docs/adr/0020-automatic-title-stored-at-write.md)).

### Backlog (not yet scheduled)

Access rights & authentication, admin pages (dashboard, site management), search/filter by tags, an overlay-modal history view, and a hot-editable `Settings` table. See [`docs/architecture.md`](docs/architecture.md) for the full list.

## Tech stack

Next.js (App Router) · React 19 · TypeScript · Prisma · PostgreSQL · shadcn/ui + Tailwind CSS · CodeMirror 6 (editor) · Zod · `next-mdx-remote` + `remark-gfm` + `mdx-annotations` (MDX pipeline) · FullCalendar, Embla, Leaflet (entries views) · Vitest · pnpm.

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or later
- [pnpm](https://pnpm.io/)
- A PostgreSQL database

### Installation

```bash
# 1. Clone the repository
git clone <this-repository-url>
cd wiki-oui

# 2. Install dependencies
pnpm install

# 3. Configure the database connection
echo 'DATABASE_URL="postgresql://user:password@localhost:5432/wikioui"' > .env

# 4. Apply migrations and seed sample data
pnpm prisma migrate dev
pnpm prisma db seed

# 5. Start the development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to the wiki's home page.

### Other scripts

```bash
pnpm build   # production build (also verifies component descriptors)
pnpm start   # run the production build
pnpm lint    # ESLint
pnpm test    # Vitest test suite
```

Site-level configuration (special page slugs, upload limits and allowed extensions, embedded icon sets) lives in the typed module [`wiki.config.ts`](wiki.config.ts) — see [ADR 0004](docs/adr/0004-config-as-typed-ts-module.md).

### Deploying to a VPS (Dokploy)

To run WikiOui on your own server rather than locally, see [`docs/deployment-dokploy.md`](docs/deployment-dokploy.md) (in French) — a step-by-step guide to deploying on any VPS with [Dokploy](https://dokploy.com), including PostgreSQL setup and HTTPS.

## Documentation

- [`CONTEXT.md`](CONTEXT.md) — domain glossary (in French) and scope per release.
- [`docs/architecture.md`](docs/architecture.md) — architecture overview.
- [`docs/adr/`](docs/adr/) — architecture decision records.
- [`docs/component-builder.md`](docs/component-builder.md), [`docs/forms.md`](docs/forms.md), [`docs/entries-view.md`](docs/entries-view.md) — feature specifications.
- [`docs/deployment-dokploy.md`](docs/deployment-dokploy.md) — VPS deployment guide (in French).

## License

WikiOui is free software, licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**, the same license as YesWiki. See [`LICENSE`](LICENSE) for the full text.

The AGPL extends the GPL's copyleft to network use: if you run a modified version of WikiOui as a service accessible to others over a network, you must make the modified source code available to those users.
