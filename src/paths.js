import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** RETRO-Studio project root. The protocol server only reads inside this folder. */
export const appRoot = path.resolve(here, '..');
