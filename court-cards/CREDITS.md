# Card Art Credits & License

## Court-card faces (`*.svg`)

The face-card SVGs in this directory (Jacks, Queens, Kings of all four suits —
files `0_11.svg` … `3_13.svg`) are from:

> **Vectorized Playing Cards 3.2**
> https://totalnonsense.com/open-source-vector-playing-cards/
> Copyright 2011, 2021 — Chris Aguilar — conjurenation@gmail.com
> Licensed under **LGPL 3.0** — https://www.gnu.org/licenses/lgpl-3.0.html

Source project: https://sourceforge.net/p/vector-cards/

### Where these copies come from, and what changed

These are **modified** versions of Chris Aguilar's faces, not the verbatim 3.2
release. They arrived by way of
[pakastin/deck-of-cards](https://github.com/pakastin/deck-of-cards)
(`example/faces/`), whose README describes its faces as "slightly modified from
Chris Aguilar's Vector Playing Card Graphics Set" and licenses them LGPL.

Changes made in this repository:

- March 2026: cropped every face from 227×315 to 164×263 (new `viewBox`) to fit
  this game's card layout. In `0_11.svg` and `0_12.svg` two corner paths were
  also removed and the art repositioned.
- October 2026: minified with svgo 3.3.2 (float precision 5, `viewBox` kept),
  which drops the Sketch editor metadata and shortens path data. The result
  renders the same; file sizes went from 1.8 MB to 1.0 MB in total.

The modified files are released under the same LGPL 3.0 terms.

### LGPL 3.0 obligations (summary, not legal advice)

- **Attribution required** — this notice satisfies it; keep it in the repo.
- The card-art **library itself** must remain redistributable under LGPL 3.0.
  The application that *uses* the cards (this Solitaire game) is not forced to
  adopt LGPL — only the card assets retain their license.
- The license text ships alongside this file:
  - `LICENSE-LGPL-3.0.txt` (verbatim, gnu.org)
  - `LICENSE-GPL-3.0.txt` (LGPL 3.0 incorporates GPL 3.0 by reference)

## Card back (`Back1Small.jpeg`)

**AI-generated. No rights claimed — released under CC0 1.0 (public domain).**
https://creativecommons.org/publicdomain/zero/1.0/

The card-back image (`Back1Small.jpeg`, used by `css/cards.css`) was produced
by a generative-AI tool. Purely AI-generated output is generally not eligible
for copyright (no human authorship), so no exclusive copyright is asserted; it
is dedicated to the public domain to make reuse unambiguous. `Back1Small.jpeg`
is the only back image kept; it is the one the app references.
