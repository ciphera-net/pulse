# Third-party notices

Pulse is licensed under the AGPL-3.0 (see [LICENSE](LICENSE)). Some of its source is derived from the work listed
here, which its author published under a licence of its own. Each entry says what was taken and reproduces that
licence, as the licence asks.

This file covers source that was ported into this repository. The packages Pulse installs as dependencies are named
in `package.json` and are not repeated here.

## ascii-reveal

- **Source:** <https://github.com/quanhoangindex/ascii-reveal>, version 0.3.0, commit
  `ec413f44933e4c08df202edaaed83ce77c342c3e`
- **Licence:** MIT
- **What is derived from it:** the dither texture of the loading skeletons.
  - `lib/skeleton/dither.ts` ports the glyph pattern from the library's `src/core/skeleton.ts` and
    `src/core/util.ts`: the hash that picks a glyph for a cell, the rows, the two glyph ramps and the numbers of
    the sweeping band.
  - `lib/skeleton/band.ts` follows the library's `src/core/skeleton-anim.ts` for the sweep of the band, the fade
    of its two edges and its frame rate.
- **What is not:** the library is not a dependency of Pulse, and none of its files is copied whole. The still
  pattern is drawn here as one tiled picture in the stylesheet and the band from one shared picture, which the
  headers of the two files above describe.

```text
MIT License

Copyright (c) 2026 Quan Hoang

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
