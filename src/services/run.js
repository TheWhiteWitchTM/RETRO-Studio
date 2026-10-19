/**
 * In-process door from the IDE to RETRO-MAGIC.
 * MAGIC runs on the host screen. BASIC and assembly run on their own machines.
 */

import {
  KEYWORDS,
  MACHINE,
  PALETTE,
  RetroError,
  assembleSource,
  checkBasic,
  checkSource,
  compileMagic,
  paint,
  runAsm,
  runBasicSource,
} from 'retro-magic';
import { basicTarget, languageOf } from '../shared/lang.js';

export { KEYWORDS, MACHINE };

export function normalizeTarget(target) {
  return target === 'apple2' || target === 'ti99' ? target : 'c64';
}

function problemFrom(error, filename) {
  if (error instanceof RetroError) {
    return {
      line: error.line,
      column: error.column,
      message: error.message,
      filename: error.filename || filename,
      severity: 'error',
    };
  }
  return {
    line: 1,
    column: 1,
    message: error instanceof Error ? error.message : String(error),
    filename,
    severity: 'error',
  };
}

function imageInfo(image) {
  if (!image) return null;
  return {
    cpu: image.cpu,
    org: image.org,
    entry: image.entry,
    format: image.format,
    bytes: image.image.length,
  };
}

function hostScreen(screen) {
  return {
    target: screen.target,
    title: screen.title,
    cols: screen.cols,
    rows: screen.rows,
    pixelWidth: screen.pixelWidth,
    pixelHeight: screen.pixelHeight,
    border: screen.border,
    background: screen.background,
    foreground: screen.foreground,
    cells: screen.cells,
    sprites: screen.sprites,
    palette: screen.palette,
    caption: screen.caption,
    hardwareSprites: screen.hardwareSprites,
    pixels: [],
  };
}

function basicScreen(result) {
  const machine = MACHINE[result.target];
  const foreground = paint(result.target, machine.foreground);
  const background = paint(result.target, machine.background);
  const caption = result.target === 'apple2'
    ? 'Apple II has no sprite chip. Emoji are lo-res software sprites.'
    : `${machine.name} BASIC`;
  return {
    target: result.target,
    title: machine.name,
    cols: result.cols,
    rows: result.rows,
    pixelWidth: machine.pixelWidth,
    pixelHeight: machine.pixelHeight,
    border: paint(result.target, machine.border),
    background,
    foreground,
    cells: result.cells.map((cell) => ({
      ch: cell.ch || ' ',
      fg: foreground,
      bg: background,
      bits: null,
    })),
    sprites: result.sprites.filter((sprite) => sprite.on).map((sprite) => ({
      emoji: String(sprite.id),
      x: sprite.x,
      y: sprite.y,
      size: result.target === 'ti99' ? 16 : 24,
      bits: [],
      color: paint(result.target, sprite.color),
      hardware: result.target !== 'apple2',
      label: `#${sprite.id}`,
    })),
    palette: [...PALETTE[result.target]],
    caption,
    hardwareSprites: result.target !== 'apple2',
    pixels: result.pixels || [],
  };
}

function failed(language, target, filename, error) {
  return {
    ok: false,
    language,
    target,
    output: '',
    halted: 'error',
    screen: null,
    basic: '',
    asm: '',
    problems: [problemFrom(error, filename)],
    warnings: [],
    notes: [],
    asmError: null,
    image: null,
  };
}

function fromCompiled(compiled, extra) {
  return {
    ok: extra.ok !== false,
    language: 'magic',
    target: compiled.target,
    output: extra.output ?? compiled.output,
    halted: extra.halted ?? 'host',
    cycles: extra.cycles,
    pc: extra.pc,
    screen: extra.screen ?? hostScreen(compiled.screen),
    basic: compiled.basic,
    asm: compiled.asm,
    problems: extra.problems ?? [],
    warnings: extra.warnings ?? compiled.warnings,
    notes: compiled.notes,
    asmError: compiled.asmError,
    image: imageInfo(compiled.image),
  };
}

export function runSource({ source, filename = '', target = 'c64', lang, mode = 'host' } = {}) {
  const safeTarget = normalizeTarget(target);
  const language = lang && lang !== 'plaintext' ? lang : languageOf(filename, safeTarget);
  try {
    if (language.startsWith('basic')) {
      const basic = basicTarget(language, safeTarget);
      const result = runBasicSource(source, { target: basic, filename });
      return {
        ok: true,
        language,
        target: basic,
        output: result.output,
        halted: result.halted,
        screen: basicScreen(result),
        basic: source,
        asm: '',
        problems: [],
        warnings: [],
        notes: [],
        asmError: null,
        image: null,
      };
    }
    if (language === 'asm6502' || language === 'asm9900') {
      const cpu = language === 'asm9900' ? '9900' : '6502';
      const cpuTarget = cpu === '9900' ? 'ti99' : (safeTarget === 'ti99' ? 'c64' : safeTarget);
      const ran = runAsm(source, { cpu, target: cpuTarget });
      let image = null;
      let asmError = null;
      try {
        image = imageInfo(assembleSource(source, { cpu, target: cpuTarget }));
      } catch (error) {
        asmError = error instanceof Error ? error.message : String(error);
      }
      return {
        ok: !asmError,
        language,
        target: cpu === '9900' ? 'ti99' : cpuTarget,
        output: ran.output,
        halted: ran.halted,
        cycles: ran.cycles,
        pc: ran.pc,
        screen: null,
        basic: '',
        asm: source,
        problems: asmError ? [problemFrom(new Error(asmError), filename)] : [],
        warnings: [],
        notes: [],
        asmError,
        image,
      };
    }
    const compiled = compileMagic(source, { filename, target: safeTarget });
    const warnings = [...compiled.warnings];
    if (compiled.asmError) warnings.push(compiled.asmError);
    if (mode === 'basic') {
      const ran = runBasicSource(compiled.basic, { target: compiled.target, filename });
      return fromCompiled(compiled, {
        output: ran.output,
        halted: ran.halted,
        screen: basicScreen(ran),
        warnings,
      });
    }
    if (mode === 'asm') {
      if (compiled.asmError) {
        return fromCompiled(compiled, {
          ok: false,
          output: '',
          warnings,
          problems: [{
            line: 1,
            column: 1,
            message: compiled.asmError,
            filename,
            severity: 'error',
          }],
        });
      }
      const cpu = compiled.target === 'ti99' ? '9900' : '6502';
      const ran = runAsm(compiled.asm, { cpu, target: compiled.target });
      return fromCompiled(compiled, {
        output: ran.output,
        halted: ran.halted,
        cycles: ran.cycles,
        pc: ran.pc,
        warnings,
      });
    }
    return fromCompiled(compiled, { output: compiled.output, halted: 'host', warnings });
  } catch (error) {
    return failed(language, safeTarget, filename, error);
  }
}

export function checkBuffer({ source, filename = '', target = 'c64', lang } = {}) {
  const safeTarget = normalizeTarget(target);
  const language = lang && lang !== 'plaintext' ? lang : languageOf(filename, safeTarget);
  try {
    if (language.startsWith('basic')) {
      const result = checkBasic(source, filename);
      return {
        ok: result.ok,
        problems: result.problems.map((item) => ({ ...item, filename, severity: 'error' })),
        warnings: [],
      };
    }
    if (language === 'asm6502' || language === 'asm9900') {
      const cpu = language === 'asm9900' ? '9900' : '6502';
      const cpuTarget = cpu === '9900' ? 'ti99' : (safeTarget === 'ti99' ? 'c64' : safeTarget);
      assembleSource(source, { cpu, target: cpuTarget });
      return { ok: true, problems: [], warnings: [] };
    }
    const result = checkSource(source, { filename, target: safeTarget });
    return {
      ok: result.ok,
      problems: result.problems.map((item) => ({ ...item, severity: 'error' })),
      warnings: result.warnings,
    };
  } catch (error) {
    return { ok: false, problems: [problemFrom(error, filename)], warnings: [] };
  }
}
