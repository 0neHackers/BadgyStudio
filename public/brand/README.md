# Brand assets

Three files in this folder belong to Hacker House Goa and its organiser, not to
this project.

| File                 | What it is                      | Source on hhgoa.com      |
| -------------------- | ------------------------------- | ------------------------ |
| `hacker-house.png`   | The HACKER HOUSE wordmark       | `assets/Hacker house.png` |
| `goa-devanagari.svg` | The गोवा sticker                 | `assets/goa_hindi.svg`    |
| `247pm-studio.svg`   | 2:47 PM STUDIO organiser lockup | `assets/2-47.svg`         |

They are here because this is a badge generator built for that event, and the
task brief asks for an instantly recognisable HH Goa 2026 identity. **If this
code is reused for anything that is not this event, delete them.**

## Rules if you touch these

**Keep them same-origin.** `html-to-image` inlines what it can read. Point any
of these at a CDN and it will come out blank in the exported PNG. Serving them
from `/public` is what makes the export work.

**The wordmark needs a dark ground.** It is yellow with a black drop shadow. On
the yellow header it disappears entirely, leaving only the shadow. It sits on a
black plate on all three artboards for that reason. Do not "fix" this by putting
it back on the accent colour, and do not recolour it with a CSS filter.

**Verify against a real export, not the preview.** The preview and the PNG are
produced by different code paths at the last step. Crop the header out of an
actual downloaded file and look at it.

## What is not here, deliberately

The site's sun, palm and beach illustrations are original artwork rather than
identity marks, so they are not copied into this project. `SunBurst`, `PalmRow`
and `Perforation` in `src/components/Marks.tsx` are drawn in code, following the
same geometry the site uses (a half disc on the horizon, thin fanned rays,
reflection dashes below) without lifting the drawing itself.

Fonts are not taken from the mirror either. Cal Sans, Victor Mono and Imbue all
come from npm under their own open licences and live in `/public/fonts`.

## Swapping in different artwork

Replace the file, keep the name, keep it in this folder. If you change the
aspect ratio, check the header plate on all three artboards, because the
wordmark is sized by height with width left automatic.

Colours are separate. They live in `src/lib/brand.ts` and the `@theme` block in
`src/app/globals.css`.
