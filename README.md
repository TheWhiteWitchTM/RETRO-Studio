# RETRO Studio

Alpha. This is early work, and it can still change. Mira, [The White Witch™](https://thewhitewitchtm.github.io/whitewitch/). [X](https://x.com/TheWhiteWitchTM) · [thewhitewitchtm@google.com](mailto:thewhitewitchtm@google.com) · [GitHub](https://github.com/TheWhiteWitchTM) · [YouTube](https://youtube.com/@TheWhiteWitchTM) · [Bluesky](https://bsky.app/profile/thewhitewitchtm.sociallydead.me) · [MIT License](LICENSE)

RETRO Studio is the IDE for [RETRO-MAGIC](https://github.com/TheWhiteWitchTM/RETRO-MAGIC). It looks like [MAGIC Studio](https://github.com/TheWhiteWitchTM/MAGIC-Studio): black window, gold spark, Monaco, the same side bar and bottom panel. It edits MAGIC, BASIC, and assembly for three machines.

| Machine | BASIC | CPU |
| --- | --- | --- |
| Commodore 64 | BASIC V2 | 6502 |
| Apple II | Applesoft | 6502 |
| TI-99/4A | Extended BASIC | TMS9900 |

Run on a MAGIC file uses the host screen. The same toolbar can run the BASIC listing or the assembly listing instead. A `.bas` file runs as BASIC. A `.asm` file runs as 6502. A `.a99` file runs as TMS9900.

An emoji used as a sprite becomes an 8×8 picture. On the C64 and the TI-99/4A the Screen tab draws it as a hardware sprite. The Apple II has no sprite chip, so the same bits are the lo-res picture, and the caption says so. `@3d` stops with an error. It does not fit these machines.

## Install

```bash
npm install
npm test
npm start
```

`npm test` runs the studio smoke. It compiles hello, a sprite scene, and the hand-written BASIC and assembly samples through the same functions the window calls. If a display is set, it also opens the Electron window, runs `print "studio"`, and closes.

`npm start` builds RETRO-MAGIC, then opens the IDE. Examples live in `RETRO-MAGIC/examples`. The Examples button opens that folder.

The terminal is a pipe. Each line runs in `bash`. There is no PTY, so full-screen programs will not work. There is no Ask panel.
