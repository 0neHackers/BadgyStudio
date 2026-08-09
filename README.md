# Badgy Studio

**All-in-One ID Card, Badge, & Frame Creator** — built for the HH Goa 2026 Open Trials.
Version **V06.04**, shown in the app as **V6.4-PROD**.

Upload a photo, get a branded HH Goa 2026 graphic, download it, share it on X with
**#FrameInGoa**. Nothing is uploaded to produce the image.

This folder is the deployable build. It contains only what a live deployment needs.
The full development history, every version and the test harness live in
`../webapp/` and `../docs/`.

---

## 1. What it does

**Three formats**, all generated in the browser.

| Format | Size | What it is |
| ------ | ---- | ---------- |
| ID card | 1080×1350 | Builder ID card. Photo, name, handle, team, stack, a generated builder class, pass tier, and a scannable code. |
| PFP frame | 1024×1024 | A branded frame around the photo, ready to use as an X profile picture. |
| Team frame | 1600×900 | Up to five people in one combined graphic. |

**Two ways in.**

- `/` — the individual generator. One person, one badge, download or share.
- `/bulk` — the bulk generator. A CSV roster of up to 500 people, edited in place,
  rendered to a folder on disk or to zip parts.

**Two ways back to a pass.**

- `/passes` — every pass this browser has issued, re-renderable at 2× or 3×. Pages at
  10 to 1000 per page, or all of them, with numbered pages above and below the list.
- `/v/<serial>` — look a pass up by its number and recover the card. Shows the photo
  stored with the pass and lets you replace, re-crop or remove it; the change is shared
  with `/passes` and every later render, because both read one record.

Downloads are offered at 2× and 3× everywhere, with the pixel dimensions of all three
formats printed under the canvas.

**What makes it more than a badge generator.** Pass numbers are deterministic and carry a
check character, so a transposed pair fails validation offline. Contact fields have
per-field privacy masking. The Data Matrix or QR carries the full pass record and a verify
URL. None of it needs a server.

---

## 2. Setup

Requires **Node 20.9 or newer**. Check with `node -v`.

```bash
npm install
npm run dev          # http://localhost:3000
```

**Windows PowerShell** is the same for these two, and differs elsewhere. Three things to
know before you hit them:

- **`&&` does not work in Windows PowerShell 5.1**, which is what `powershell.exe` starts.
  Use `;` to run commands in sequence, or install PowerShell 7 where `&&` works. Every
  chained command below is given in both forms.
- **`curl` is an alias for `Invoke-WebRequest`**, not the real curl, and it does not accept
  curl's flags. Use `curl.exe` to get the real one.
- **`grep`, `cp`, `rm` and `cat` do not exist.** The equivalents are `Select-String`,
  `Copy-Item`, `Remove-Item` and `Get-Content`.

`npm run dev` and `npm run build` both run `tools/preflight.mjs` first. It refuses to start
if a file or package the build needs is missing, and names the consequence rather than the
filename. That check exists because V05.07 shipped with `postcss.config.mjs` deleted, which
meant Tailwind never ran and the app loaded as unstyled HTML while every other check passed.

```bash
npm run build && npm start    # production build, http://localhost:3000
npm run typecheck             # tsc --noEmit
npm run lint                  # eslint
```

PowerShell:

```powershell
npm run build; npm start      # ";" rather than "&&" on Windows PowerShell 5.1
npm run typecheck
npm run lint
```

**If port 3000 is taken**, which usually means a dev server you left running:

```powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000 -State Listen).OwningProcess
Stop-Process -Id <that id>
```

Or sidestep it entirely with `npm start -- -p 3001`. Note that a vault on port 3000 and a
vault on port 3001 are different origins and therefore different IndexedDB stores, so
`/passes` will look empty on the new port. That is correct behaviour, not a bug.

### Environment variables

Copy `.env.example` to `.env.local`. Both are optional; the app works without either.

```bash
cp .env.example .env.local
```

```powershell
Copy-Item .env.example .env.local
```

| Variable | What it does | Without it |
| -------- | ------------ | ---------- |
| `NEXT_PUBLIC_SITE_URL` | The public origin, used to build absolute share and verify URLs. | Locally the verify line inside the code reads `localhost`. On Vercel it falls back to whichever domain Vercel treats as canonical, which is **not always the one you are handing out** if the project has more than one. Set it in production and redeploy; it is compiled in at build time. |
| `BLOB_READ_WRITE_TOKEN` | Enables `/s/<id>`, the share page whose OG image is the generated graphic. | Share to X still works: the native share sheet on mobile, download plus a pre-filled composer on desktop. Only the rich link preview is lost. |

Deployment, hardening and access control are in
[`../docs/deployment-live-production.md`](../docs/deployment-live-production.md).

---

## 3. Tech stack

| Package | Version | Why it is here |
| ------- | ------- | -------------- |
| next | 16.3.0 | The brief asks that a shared link preview show the actual graphic. That needs a server route to host the image and a page to advertise it. Everything else is static. |
| react | 19.2.0 | Current stable, paired with Next 16. |
| typescript | 5.8 | `strict: true`. No `any` in the source. |
| tailwindcss | 4.3 | CSS-first config. The theme is a `@theme` block in `globals.css`, so there is no `tailwind.config.js`. |
| html-to-image | 1.11 | Rasterises the live preview, so the download *is* the preview. No second layout engine to drift from. |
| bwip-js | 4.11 | Code 128, Data Matrix and QR. Real symbologies with real quiet zones, not a font trick. |
| papaparse | 5.5 | CSV with quoted fields, embedded commas and BOMs. Hand-rolled splitting gets these wrong. |
| client-zip | 2.5 | ~3 KB, streaming. Produces a zip without buffering every PNG twice. |
| heic-to | 1.5 | iPhone photos. Imported on demand, so the 1.5 MB wasm never loads for people who do not need it. |
| @vercel/blob | 2.0 | Stores the one image the share page needs. Server-side only. |

**No runtime dependency does image work on a server.** Decoding, layout, rasterisation and
compression all happen in the visitor's tab.

### The three ideas worth knowing before changing anything

**The export is a rasterisation of the preview.** Artboards are fixed-pixel boxes scaled by
a CSS transform. `html-to-image` serialises the same DOM the visitor is looking at. This is
why `style-src` keeps `'unsafe-inline'` and always will: artboards are positioned with
inline styles, and removing them would mean a second layout engine and a preview that
drifts from the file.

**Serials are deterministic.** Nine characters hashed from name, handle, email and team,
plus a mod-36 check character with alternating weights. The three-letter prefix (`IDX-`,
`BGX-`, `FMX-`) is a format tag and is deliberately *not* part of the hash, so one person's
card and frame share a body. Re-running a roster never renumbers anyone.

**A bulk run holds one badge at a time.** It writes each badge to disk as it is made rather
than accumulating them. The earlier design held forty finished PNGs and then built a zip on
top of them, which is roughly 380 MB at 3×, and the failure surfaced as a misleading
`Failed to fetch`. Do not reintroduce an array of finished output.

### Fonts

Cal Sans (MIT), Victor Mono (SIL OFL 1.1) and Imbue (SIL OFL 1.1), all self-hosted from
`/public/fonts` through plain `@font-face`. Self-hosted for two reasons: the export must
look identical on every machine, and `html-to-image` can only inline a font file it is
same-origin permitted to read.

---

## 4. Structure

```
prod/
├── package.json  package-lock.json
├── next.config.ts        version string, CSP and security headers
├── tsconfig.json  postcss.config.mjs  eslint.config.mjs
├── .env.example  .gitignore
├── public/
│   ├── fonts/            Cal Sans, Victor Mono, Imbue
│   ├── brand/            event marks, see public/brand/README.md
│   └── sample-roster-500.csv
├── tools/
│   └── preflight.mjs     runs before dev and build
└── src/
    ├── app/              routes: /, /bulk, /passes, /v/[serial], /s/[id], /api/share
    ├── components/       artboards, studios, chrome
    ├── lib/              badge building, serials, codes, export, batch, storage
    └── types/
```

`src/lib` is where the decisions live: `identifier.ts` (serials), `badge.ts` (what a badge
is), `export.ts` (raster and encode), `batch.ts` and `sink.ts` (bulk runs), `vault.ts` and
`roster-store.ts` (local storage), `toast.ts` (notifications).

---

## 5. Privacy and data

Worth stating plainly, because the app makes a strong claim and there is exactly one
exception to it.

- **Producing a badge never touches a server.** Photos are decoded, cropped and rasterised
  in the tab. Nothing is sent.
- **Saved passes are local.** `/passes` reads IndexedDB in that browser. A vault on a laptop
  and a vault on a phone are different vaults and neither is visible to anyone else. There
  is no account and no directory.
- **The one exception is Share to X by link.** It uploads the rendered PNG plus the pass
  number, name, team and builder class, so the link preview can show the badge. It asks
  first, names exactly what it sends, and remembers the answer. Declining falls back to
  download plus a pre-filled composer.
- **The download gate is honest about its limit.** Re-downloading a saved pass asks you to
  reproduce the details the serial was built from. It stops someone who wanders up to an
  unattended laptop at a registration desk. It does not stop the person who owns the
  laptop, who can read IndexedDB directly, and the app says so on the page.

---

## 6. Browser support

| Feature | Chrome / Edge | Firefox | Safari |
| ------- | ------------- | ------- | ------ |
| Generate, download, share | yes | yes | yes |
| HEIC upload | yes | yes | yes |
| Copy image to clipboard | yes | no, falls back to download and says so | yes |
| Bulk: write straight to a folder | yes | no, falls back to zip parts | no, falls back to zip parts |

The folder path uses the File System Access API. Where it is unavailable the run still
produces everything, as zip parts budgeted at 96 MB each.

---

## 7. Known limits

- **500 rows per bulk run.** The cap is deliberate.
- **A full page reload ends a run in progress.** Switching tabs, navigating to another part
  of the app and leaving it in the background are all fine; the run outlives the page. A
  reload cannot be survived, because the work lives in the JavaScript heap.
- **Photos do not survive a reload of the bulk roster.** Rows, edits and settings do. Photos
  are object URLs that die with the tab, so they come back as filenames and re-attaching the
  folder or zip re-matches them by name.
- **Team frames are single-only.** Bulk produces ID cards and PFP frames. A combined frame
  is one graphic for one group, so there is nothing to batch.
- **Microtext and VOID tiles on the backdrop set in a generic monospace**, not Victor Mono.
  The backdrop is an SVG loaded as an image, and an image is an isolated document that
  cannot see the page's `@font-face` rules. They are decorative texture at 7.5px.

---

## 8. Testing

The verification harness is not in this folder, deliberately: it needs Playwright, which
would make every deployment install a browser binary. It lives in `../webapp/V06.04/tools/`
and every script takes a `--url`, so it can be pointed at the live deployment:

```bash
cd ../webapp/V06.04
npm install
npx playwright install chromium
node tools/verify-v0603.mjs     --url https://your-deployment.vercel.app
node tools/audit-responsive.mjs --url https://your-deployment.vercel.app
node tools/verify-css.mjs       --url https://your-deployment.vercel.app
```

PowerShell is identical here, since these are all `node` and `npx` invocations:

```powershell
cd ..\webapp\V06.04
npm install
npx playwright install chromium
node tools\verify-v0603.mjs     --url https://your-deployment.vercel.app
node tools\audit-responsive.mjs --url https://your-deployment.vercel.app
node tools\verify-css.mjs       --url https://your-deployment.vercel.app
```

One edit is needed first. Each script sets `executablePath` to a Linux Chromium path from
the sandbox they were written in. On Windows, delete that line from the `chromium.launch`
call so Playwright uses the browser `npx playwright install` just put in place.

The manual checklist, including what the brief itself requires, is
[`../docs/testing-checklist.md`](../docs/testing-checklist.md). Start with sections 1 and 1B.

---

## 9. Troubleshooting

**The page has no styling, and the console says `Unknown at rule: @theme`.**
`postcss.config.mjs` is missing, so Tailwind never ran. Restore it. `npm run preflight`
detects this and names it.

**`sh: next: not found` while preflight passes.**
An interrupted `npm install` extracts the packages but never links the executables. Run
`npm install` again.

**`Error: listen EADDRINUSE :::3000`.**
Something already holds the port, usually a dev server left running.

```powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000 -State Listen).OwningProcess
Stop-Process -Id <that id>
```

```bash
lsof -ti:3000 | xargs kill        # macOS and Linux
```

Or use another port: `npm start -- -p 3001`.

**`Persisting failed during shutdown: Unable to write SST file ... not enough space`.**
Turbopack could not persist its incremental cache. **The build itself succeeded** if you
saw `✓ Compiled successfully` and the route table; only the cache was lost, so the next
build is slower. Free some disk. Old versions of this project keep their own
`node_modules` and `.next`, which is where the space usually went:

```powershell
Get-PSDrive C | Select-Object Used, Free

cd ..\webapp
Get-ChildItem -Directory | ForEach-Object {
  Remove-Item -Recurse -Force "$($_.FullName)\.next" -ErrorAction SilentlyContinue
}
```

Each `node_modules` is roughly 370 MB. Deleting one only removes regenerable files; the
source of every version stays intact and `npm install` brings it back.

```bash
find ../webapp -maxdepth 2 -name .next -type d -exec rm -rf {} +
```

**`git push` says `Permission denied (publickey)`.**
The remote is the SSH form and this machine has no key GitHub knows. Switch to HTTPS with
`git remote set-url origin https://github.com/<owner>/<repo>.git` and push again; Git
Credential Manager will open a browser.

**`git push` says `remote: Repository not found` and never prompts you to log in.**
A credential is cached for a different GitHub account, and GitHub returns 404 rather than
403 for a private repo you cannot see. Clear it and push again:

```powershell
cmdkey /list | Select-String -Pattern github
cmdkey /delete:git:https://github.com
git push -u origin main
```

**The repository page shows 404 in the browser.**
Normal for a private repo when you are signed out or signed in as an account without access.
GitHub does this deliberately so private names do not leak.

**`npm warn cleanup ... EPERM ... rmdir` on Windows.**
File locking during npm's own tidy-up, not a fault in this project. The install succeeds;
read the last lines. Usually a virus scanner, an open editor, or a running dev server.

**A hydration mismatch naming `bis_skin_checked`.**
A browser extension stamping attributes onto the DOM before React hydrates. Not fixable
from inside the app. Confirm by opening the same page in a private window with extensions
disabled.

**The exported PNG uses the wrong font.**
Something is injecting a cross-origin stylesheet, usually antivirus or an extension. The
export builds its own font embed stylesheet to avoid this; if it recurs, check
`src/lib/fonts.ts` still lists every face used on an artboard.

---

## 10. Licence

**Copyright © 2026 0neHackers ([@shanzalfiroz](https://x.com/shanzalfiroz)). All rights
reserved.**

This is **not** open source. No permission is granted to copy, modify, distribute, publish,
sublicense or create derivative works from this source, in whole or in part, without written
permission from the copyright holder.

Deliberately not an OSS licence. An open licence cannot be taken back once granted, and this
was built as a submission and a portfolio piece rather than as something to be forked. It can
be opened later; it cannot be closed later.

**What this does not do.** It does not stop anyone using the deployed site, which is the
point of the deployment and what the task brief requires. It does not conceal the client
bundle either, because a web app has to send its JavaScript to the browser. What it reserves
is the right to the source, the design and the work, not the right to visit the page.

### What this licence does not cover

Three categories inside this folder are not mine to license, and the notice above does not
extend to them.

| What | Whose | Terms |
| ---- | ----- | ----- |
| `public/brand/hacker-house.png`, `goa-devanagari.svg`, `247pm-studio.svg` | Hacker House Goa and 2:47 PM Studio | Used to identify the event this was built for. **Delete them if this code is reused for anything else.** See `public/brand/README.md`. |
| `public/fonts/CalSans-SemiBold.woff2` | Cal Sans | MIT |
| `public/fonts/VictorMono-*.woff2`, `Imbue-*.woff2` | Victor Mono, Imbue | SIL OFL 1.1. The licence text must travel with the font files if they are redistributed. |

Every npm dependency keeps its own licence. `npm ls --long` lists them; all are MIT or
similarly permissive, and none impose terms on this project's own source.

The sun, palm and perforation marks in `src/components/Marks.tsx` are drawn in code rather
than copied. The event site's illustrations are original artwork rather than identity marks,
and there is a difference between using someone's logo to identify their event and lifting
their illustrator's work.

*Not legal advice. If any of this matters commercially, have a lawyer read it.*

---

Built by **0neHackers** ([@shanzalfiroz](https://x.com/shanzalfiroz)).
