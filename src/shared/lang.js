/** File name to a Monaco language. Toolbar target picks the BASIC dialect. */

export function languageOf(filename = '', target = 'c64') {
  const name = String(filename).split(/[\\/]/).pop().toLowerCase();
  if (name.endsWith('.magic')) return 'magic';
  if (name.endsWith('.bas') || name.endsWith('.basic')) {
    if (target === 'apple2') return 'basic-apple';
    if (target === 'ti99') return 'basic-ti';
    return 'basic-c64';
  }
  if (name.endsWith('.a99')) return 'asm9900';
  if (name.endsWith('.asm') || name.endsWith('.s') || name.endsWith('.a65')) return 'asm6502';
  return 'plaintext';
}

export const LANG_LABEL = {
  magic: 'MAGIC',
  'basic-c64': 'C64 BASIC',
  'basic-apple': 'Applesoft',
  'basic-ti': 'TI Extended BASIC',
  asm6502: '6502',
  asm9900: 'TMS9900',
  plaintext: 'Text',
};

/** Monarch only treats plain words as keywords. `PRINT#` and `HCOLOR=` stay text. */
export function keywordWords(list) {
  return (list || []).filter((word) => /^[A-Za-z][\w$]*$/.test(word));
}

export function basicTarget(language, target = 'c64') {
  if (language === 'basic-apple') return 'apple2';
  if (language === 'basic-ti') return 'ti99';
  if (language === 'basic-c64') return 'c64';
  return target === 'apple2' || target === 'ti99' ? target : 'c64';
}
