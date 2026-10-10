# Sound Asset Licenses

Both sound files in this directory are licensed under **CC0 1.0 Universal
(Public Domain Dedication)**. No attribution is legally required; the credits
below are a courtesy.

License text: <https://creativecommons.org/publicdomain/zero/1.0/>

## Files

### `contact1.wav`
- **Use in app:** card flip (`playFlipSound`), when a stock card is drawn or a tableau card is revealed.
- **Source pack:** [Playing Card Sounds](https://opengameart.org/content/playing-card-sounds) on OpenGameArt.org
- **Author:** BMacZero (Brian MacIntosh). The pack page asks, optionally, for credit as "Brian MacIntosh".
- **License:** CC0 1.0 Universal
- **Format:** RIFF WAVE, PCM 16-bit, mono, 44.1 kHz, ~7 KB

### `554208__memes_hodachy__cardsound32562.mp3`
- **Use in app:** card place (`playPlaceSound`), when a card lands on a pile (drag-drop, auto-move, double-click, autocollect).
- **Source:** [Freesound #554208](https://freesound.org/sounds/554208/)
- **Author:** Memes_Hodachy
- **License:** CC0 1.0 Universal
- **Format:** MPEG-3 audio, ~14 KB

## Adding a sound

Use CC0 only, so this file's opening line stays true. Add the file to
`SOUND_FILES` in `js/game.js` and to `EXTRAS` in `sw.js`, then append an entry
here with its source URL and author.
