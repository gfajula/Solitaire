# Fonts

Self-hosted subsets, downloaded from Google Fonts. All three families are
licensed under the SIL Open Font License, Version 1.1. The full license text,
with each family's copyright notice, ships in [`OFL.txt`](OFL.txt).

| File | Family | Weights | Coverage | Source |
|---|---|---|---|---|
| `outfit-latin.woff2` | Outfit (variable) | 100–900 | latin | <https://fonts.google.com/specimen/Outfit> |
| `lora-400-latin.woff2` | Lora | 400 | latin | <https://fonts.google.com/specimen/Lora> |
| `symbols-400.woff2` | Noto Sans Symbols 2 | 400 | `♠ ♥ ♦ ♣` only | <https://fonts.google.com/noto/specimen/Noto+Sans+Symbols+2> |

Copyright:

- Outfit: Copyright 2021 The Outfit Project Authors
  (<https://github.com/Outfitio/Outfit-Fonts>)
- Lora: Copyright 2011 The Lora Project Authors
  (<https://github.com/cyrealtype/Lora-Cyrillic>), with Reserved Font Name "Lora"
- Noto Sans Symbols 2: Copyright 2022 The Noto Project Authors
  (<https://github.com/notofonts/symbols>)

The files are unmodified apart from Google Fonts' own subsetting, so the
Reserved Font Name clause does not come into play.

## Why these subsets

Only the `latin` subset is shipped: every string in the UI is ASCII. Outfit is
the variable build, so one 31 KB file serves every weight the CSS asks for
(400 to 700) with no synthesized bold. Noto Sans Symbols 2 is cut down to the
four suit glyphs the cards render: 1 KB instead of a full symbol face.

Total: ~53 KB.

## Regenerating

`@font-face` declarations live in `css/fonts.css`. To refresh, request the same
families from `https://fonts.googleapis.com/css2` with a modern browser
User-Agent (that is what selects `woff2`), keep the `latin` blocks, download
each `src` URL into this directory, and rewrite the URLs to `../fonts/…`.
Add any new file to `SHELL` in `sw.js` and bump `CACHE_VERSION`.
