# Notices

## The picture

The backdrop in this theme is the Reaching scene from
[neverblinks/backdrops](https://github.com/neverblinks/backdrops), copied at the commit in `vendor/backdrops/COMMIT`.

- `vendor/backdrops/scene-reaching.js` is upstream's file, unchanged.
- `theme.json` embeds that scene, rewritten by `build.mjs` into fewer characters that draw the same picture.

Upstream splits its terms in two, and both files are copied here unchanged:

- `vendor/backdrops/LICENSE`: the MIT License, for upstream's code. Copyright (c) 2026 neverblinks.
- `vendor/backdrops/ARTWORK.md`: the terms for the pictures, which the MIT licence does not cover. It counts every
  `scene-*.js` file as a picture, and the scene generators and their data in upstream's `themes/` too.

From `ARTWORK.md`, for Reaching:

- The hands are @samdape's dot rendering of the hands in Michelangelo's *Creation of Adam*, used upstream with
  permission. All rights stay with the artist. The fresco itself is public domain.
- The forearms past the artwork's left and right edges are upstream's extension, traced from the fresco.
- Anyone may install and use the theme for free, for any purpose, and may share links to upstream's repository.
- Without permission, nobody may sell the pictures or anything made from them, redistribute them outside
  upstream's repository, claim them as their own, or remove or hide the credits.

The scene file and `theme.json` both contain the picture. This repository publishes them with permission from
neverblinks, and from @samdape for the hands. Before you copy the picture anywhere else, ask them.

## This repository's own code

`build.mjs` and `check.mjs` are under the MIT License in `LICENSE`. They read upstream's scene. `build.mjs` also
holds twelve stroke offsets read from upstream's `themes/reaching/make-scene.py`, a file `ARTWORK.md` counts as
part of the picture.

## T3 Code

This theme is not affiliated with or endorsed by T3 Code. The screenshots show T3 Code running with an invented
demo project.
