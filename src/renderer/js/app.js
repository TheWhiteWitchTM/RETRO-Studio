import { state } from './state.js';
import { applySettings, initEditor, openPath } from './editor.js';
import { initTree } from './tree.js';
import { focusBottom, initBottom, renderProblems } from './bottom.js';
import { initSearch } from './search.js';
import { initPalette } from './palette.js';
import { applyTheme } from './theme.js';
import { paintScreen } from './screen.js';
import {
  afterTabsChanged,
  applyTargetControls,
  bindChrome,
  fillRecent,
  layout,
  loadRunConfigs,
  openFolder,
  refreshOutline,
  refreshStatus,
  registerAll,
  wireHooks,
} from './commands.js';

export async function start() {
  if (!window.studio) throw new Error('The studio bridge did not load.');
  state.info = await window.studio.getInfo();
  state.settings = state.info.settings || {};
  if (state.settings.theme !== 'light') state.settings.theme = 'black';
  applyTheme(state.settings.theme);
  wireHooks();
  initEditor({
    onTabs: afterTabsChanged,
    onCursor: refreshStatus,
    onOutline: refreshOutline,
    onProblems() {
      refreshStatus();
      renderProblems();
    },
  });
  initTree();
  initBottom();
  initSearch();
  initPalette();
  registerAll();
  bindChrome();
  applySettings();
  applyTargetControls();
  layout();
  fillRecent();
  await loadRunConfigs();
  const splash = document.getElementById('splash');
  splash.hidden = true;
  if (location.search.includes('smoke=1')) {
    await smokeProbe();
    return;
  }
  const launch = state.info.launch;
  if (launch?.project) await openFolder(launch.project);
  if (launch?.file) await openPath(launch.file);
  if (!state.project) document.getElementById('welcome').hidden = false;
  refreshStatus();
}

async function smokeProbe() {
  try {
    const result = await window.studio.run({
      source: 'print "studio"\n',
      filename: 'smoke.magic',
      target: 'c64',
      lang: 'magic',
      mode: 'host',
    });
    if (!result.ok || !String(result.output).includes('studio')) {
      throw new Error(result.problems?.[0]?.message || `smoke run failed: ${result.output}`);
    }
    if (!document.querySelector('.monaco-editor')) throw new Error('editor missing');
    if (!document.getElementById('run-term')) throw new Error('run console missing');
    if (!document.querySelector('.activity')) throw new Error('activity bar missing');
    if (!document.getElementById('menubar')) throw new Error('menu bar missing');
    if (document.getElementById('grok')) throw new Error('ask panel does not belong in this window');
    const sceneFile = `${state.info.examples}/scene.magic`;
    const sceneText = await window.studio.readFile(sceneFile);
    if (!sceneText?.content) throw new Error(sceneText?.message || 'missing scene');
    const apple = await window.studio.run({
      source: sceneText.content,
      filename: sceneFile,
      target: 'apple2',
      lang: 'magic',
      mode: 'host',
    });
    if (!apple.ok || !apple.screen?.caption?.includes('no sprite chip')) {
      throw new Error(apple.problems?.[0]?.message || 'apple screen missing');
    }
    if (!apple.screen.sprites.some((sprite) => sprite.emoji === '✦' && sprite.bits?.length === 8)) {
      throw new Error('apple emoji bits missing');
    }
    const c64 = await window.studio.run({
      source: sceneText.content,
      filename: sceneFile,
      target: 'c64',
      lang: 'magic',
      mode: 'host',
    });
    if (!c64.screen?.sprites?.some((sprite) => sprite.emoji === '✦' && sprite.hardware)) {
      throw new Error('c64 sprite missing');
    }
    state.screen = c64.screen;
    focusBottom('screen');
    paintScreen(document.getElementById('screen-canvas'), c64.screen);
    document.getElementById('screen-caption').textContent = c64.screen.caption || 'Commodore 64';
    if (document.getElementById('screen-canvas').width < 10) throw new Error('canvas did not paint');
    const basic = await window.studio.run({
      source: '10 PRINT "HELLO"\n20 END\n',
      filename: 'smoke.bas',
      target: 'c64',
      lang: 'basic-c64',
    });
    if (!basic.ok || !String(basic.output).includes('HELLO')) throw new Error('basic smoke failed');
    window.studio.smokeReady();
  } catch (error) {
    window.studio.smokeFail(error?.stack || String(error));
  }
}
