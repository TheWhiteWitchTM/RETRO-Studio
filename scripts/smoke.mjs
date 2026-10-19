import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { keywordWords, languageOf } from '../src/shared/lang.js';
import { HELLO_MAGIC, createProject, searchText } from '../src/services/files.js';
import { runSource } from '../src/services/run.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const examples = path.resolve(root, '../RETRO-MAGIC/examples');
let failed = 0;

function flat(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${name}${detail ? `\n${detail}` : ''}`);
}

function read(name) {
  return fs.readFileSync(path.join(examples, name), 'utf8');
}

check('magic language', languageOf('hello.magic') === 'magic');
check('apple basic language', languageOf('add.bas', 'apple2') === 'basic-apple');
check('ti basic language', languageOf('add.bas', 'ti99') === 'basic-ti');
check('c64 basic language', languageOf('add.bas', 'c64') === 'basic-c64');
check('6502 language', languageOf('add.asm') === 'asm6502');
check('9900 language', languageOf('add.a99') === 'asm9900');
check('drops symbol keywords', !keywordWords(['PRINT', 'HCOLOR=', 'TAB(']).includes('HCOLOR='));

const hello = read('hello.magic');
const scene = read('scene.magic');
for (const target of ['c64', 'apple2', 'ti99']) {
  const host = runSource({ source: hello, filename: 'hello.magic', target, lang: 'magic', mode: 'host' });
  check(`host hello ${target}`, host.ok && flat(host.output) === 'Hello, MAGIC', flat(host.output));
  check(`listings ${target}`, host.basic.includes('PRINT') && /jsr |bl /i.test(host.asm));
  const basic = runSource({ source: hello, filename: 'hello.magic', target, lang: 'magic', mode: 'basic' });
  check(`basic hello ${target}`, basic.ok && flat(basic.output) === 'Hello, MAGIC', flat(basic.output));
  const asm = runSource({ source: hello, filename: 'hello.magic', target, lang: 'magic', mode: 'asm' });
  check(`asm hello ${target}`, asm.ok && flat(asm.output) === 'Hello, MAGIC', `${asm.asmError || ''} ${flat(asm.output)}`);
}

const c64Scene = runSource({ source: scene, filename: 'scene.magic', target: 'c64', lang: 'magic', mode: 'host' });
check('c64 scene', c64Scene.ok && flat(c64Scene.output) === 'scene ok', flat(c64Scene.output));
check('c64 emoji sprites', c64Scene.screen?.sprites?.length === 2 && c64Scene.screen.sprites.some((sprite) => sprite.emoji === '✦' && sprite.hardware));
const appleScene = runSource({ source: scene, filename: 'scene.magic', target: 'apple2', lang: 'magic', mode: 'host' });
check('apple scene', appleScene.ok && flat(appleScene.output) === 'scene ok', flat(appleScene.output));
check('apple has no sprite chip', appleScene.screen?.hardwareSprites === false && appleScene.screen.caption.includes('no sprite chip'));
check('apple still draws the emoji', appleScene.screen?.sprites?.some((sprite) => sprite.emoji === '✦' && sprite.bits?.length === 8));
const tiScene = runSource({ source: scene, filename: 'scene.magic', target: 'ti99', lang: 'magic', mode: 'host' });
check('ti scene sprites', tiScene.ok && tiScene.screen?.hardwareSprites === true && tiScene.screen.sprites.some((sprite) => sprite.emoji === '●'));

const cross = runSource({ source: read('cross.magic'), filename: 'cross.magic', target: 'apple2', lang: 'magic', mode: 'host' });
check('cross compile apple', cross.ok && flat(cross.output).includes('on apple') && flat(cross.output).includes('all') && !flat(cross.output).includes('on c64'), flat(cross.output));

const dropped = runSource({ source: read('drop3d.magic'), filename: 'drop3d.magic', target: 'c64', lang: 'magic' });
check('drops 3d', !dropped.ok && dropped.problems.some((item) => /3d/i.test(item.message)), dropped.problems.map((item) => item.message).join('; '));

const basicFile = runSource({ source: read('add.bas'), filename: 'add.bas', target: 'c64', lang: 'basic-c64' });
check('hand basic', basicFile.ok && flat(basicFile.output) === '42', flat(basicFile.output));
const asmFile = runSource({ source: read('add.asm'), filename: 'add.asm', target: 'c64', lang: 'asm6502' });
check('hand 6502', asmFile.ok && asmFile.halted === 'brk' && asmFile.image?.format === 'prg', asmFile.asmError || asmFile.halted);
const tiFile = runSource({ source: read('add.a99'), filename: 'add.a99', target: 'ti99', lang: 'asm9900' });
check('hand 9900', tiFile.ok && tiFile.halted === 'jmp' && tiFile.image?.cpu === '9900', tiFile.asmError || tiFile.halted);

const hits = await searchText({ root: examples, query: 'scene ok' });
check('search finds scene', hits.matches.some((hit) => hit.file.endsWith('scene.magic')));

const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retro-studio-'));
const project = await createProject(projectDir, 'sample');
const projectHello = fs.readFileSync(project.file, 'utf8');
const projectRun = runSource({ source: projectHello, filename: project.file, target: 'c64', lang: 'magic', mode: 'host' });
check('new project greets', projectRun.ok && flat(projectRun.output) === 'Hello, RETRO', flat(projectRun.output));
check('new project sprite', projectRun.screen?.sprites?.some((sprite) => sprite.emoji === '✦'));
check('new project basic and asm', fs.existsSync(path.join(project.dir, 'hello.bas')) && fs.existsSync(path.join(project.dir, 'hello.asm')) && fs.existsSync(path.join(project.dir, 'hello.a99')));
check('starter matches export', projectHello === HELLO_MAGIC);

const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
const editor = fs.readFileSync(path.join(root, 'src/renderer/js/editor.js'), 'utf8');
const commands = fs.readFileSync(path.join(root, 'src/renderer/js/commands.js'), 'utf8');
check('electron shell', html.includes('RETRO Studio') && html.includes('id="menubar"') && html.includes('xterm.js') && html.includes('id="run-term"') && html.includes('class="activity"'));
check('screen and listing tabs', html.includes('data-bottom="screen"') && html.includes('data-bottom="listing"') && html.includes('id="target"') && html.includes('TI-99/4A'));
check('no ask panel', !html.includes('id="grok"'));
check('basic and assembler languages', editor.includes("basic('basic-c64'") && editor.includes("asm('asm6502'") && editor.includes("asm('asm9900'"));
check('run goes through the studio', commands.includes('runRetro') && commands.includes('paintScreen'));

const display = process.env.DISPLAY || process.env.WAYLAND_DISPLAY;
const electron = path.join(root, 'node_modules', '.bin', 'electron');
if (!display) {
  console.log('skip electron: no DISPLAY');
} else if (!fs.existsSync(electron)) {
  console.log('skip electron: binary not installed');
  failed += 1;
} else {
  const code = await new Promise((resolve) => {
    const child = spawn(electron, ['.', '--no-sandbox', '--disable-gpu'], {
      cwd: root,
      env: { ...process.env, RETRO_STUDIO_SMOKE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout.on('data', (buf) => { log += buf; });
    child.stderr.on('data', (buf) => { log += buf; });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ code: 124, log });
    }, 45000);
    child.on('exit', (exitCode) => {
      clearTimeout(timer);
      resolve({ code: exitCode ?? 1, log });
    });
  });
  check('electron window loads and runs', code.code === 0, `exit ${code.code}\n${code.log.slice(-2000)}`);
}

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('studio smoke ok');
