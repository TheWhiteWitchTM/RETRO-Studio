# RETRO Studio

Alpha. This is early work, and the window can still change.

Mira, [The White Witch™](https://thewhitewitchtm.github.io/whitewitch/). [X](https://x.com/TheWhiteWitchTM) · [thewhitewitchtm@google.com](mailto:thewhitewitchtm@google.com) · [GitHub](https://github.com/TheWhiteWitchTM) · [YouTube](https://youtube.com/@TheWhiteWitchTM) · [Bluesky](https://bsky.app/profile/thewhitewitchtm.sociallydead.me) · [MIT License](LICENSE)

RETRO Studio is [MAGIC Studio](https://github.com/TheWhiteWitchTM/MAGIC-Studio) for three 8-bit machines. It is an Electron window: black background, gold spark, menu bar, project tree, Monaco editor, run console, machine screen, listing, problems, and a terminal.

It edits [RETRO-MAGIC](https://github.com/TheWhiteWitchTM/RETRO-MAGIC), BASIC, and assembly.

| Machine | BASIC | CPU | Sprites |
| --- | --- | --- | --- |
| Commodore 64 | BASIC V2 | 6502 | VIC-II |
| Apple II | Applesoft | 6502 | none; emoji are lo-res |
| TI-99/4A | Extended BASIC | TMS9900 | TMS9918 |

The toolbar picks the machine and, for a MAGIC file, whether Run uses the host screen, the BASIC listing, or the assembly listing. A `.bas` file runs as BASIC. A `.asm` file runs as 6502. A `.a99` file runs as TMS9900.

An emoji used as a sprite becomes an 8×8 picture. The Screen tab draws it. `@3d` stops with an error. It does not fit these machines.

## Start

```bash
npm install
npm start
```

`bin/retro-studio` does the same thing. `npm run desktop` adds an application-menu launcher for this machine.

Open a folder, or create one from the welcome screen. The new folder holds `hello.magic`, `hello.bas`, `hello.asm`, and `hello.a99`. RETRO-MAGIC examples open with the examples button when that project sits next to this one.

## Run

Shift+F10 runs the active file. Ctrl+F9 checks it. Ctrl+Shift+F10 opens the machine screen. Ctrl+F2 stops a shell run.

The Run tab is the console. The Screen tab is the machine. The Listing tab is the BASIC or assembly the compiler wrote. Edit listing opens that text in the editor.

Click a `file:line:column` path in the run console to open it.

## Keys

Ctrl+Shift+A opens the command list. Ctrl+P opens a file. Ctrl+Shift+F searches the folder. Alt+1, Alt+3, and Alt+7 switch the side panel. Alt+F12 or Ctrl+` toggles the terminal. Ctrl+D duplicates a line. Ctrl+Y deletes a line. Shift+F6 renames a name in the file. Ctrl+B jumps to a declaration.

The editor starts on the black theme. Click Black in the status bar for the light theme. Settings for theme, font size, indent, wrap, machine, and the last folder are stored under the app's user data.

The terminal is a PTY when `node-pty` built, and a pipe otherwise. A pipe still runs commands. Full-screen programs need the PTY.
