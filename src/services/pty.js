import { spawn } from 'node:child_process';

let backend = null;

export async function loadPty() {
  try {
    const mod = await import('node-pty');
    const pty = mod.default && typeof mod.default.spawn === 'function' ? mod.default : mod;
    if (typeof pty.spawn !== 'function') return false;
    backend = pty;
    return true;
  } catch {
    backend = null;
    return false;
  }
}

export function hasPty() {
  return Boolean(backend);
}

/**
 * A real PTY when node-pty built, otherwise a pipe.
 * Grok's full screen session needs the PTY. Pipes still run commands.
 */
export function startProcess(file, args, { cwd, cols = 80, rows = 24, env } = {}) {
  const merged = { ...process.env, ...env, TERM: 'xterm-256color' };
  if (backend) {
    const proc = backend.spawn(file, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: merged,
    });
    return {
      pty: true,
      pid: proc.pid,
      write: (data) => {
        try { proc.write(data); } catch { /* closed */ }
      },
      resize: (nextCols, nextRows) => {
        try { proc.resize(Math.max(2, nextCols | 0), Math.max(2, nextRows | 0)); } catch { /* closed */ }
      },
      kill: () => {
        try { proc.kill(); } catch { /* closed */ }
      },
      onData: (cb) => proc.onData(cb),
      onExit: (cb) => proc.onExit(({ exitCode, signal }) => cb(exitCode ?? (signal ? 1 : 0))),
    };
  }

  const child = spawn(file, args, { cwd, env: merged, stdio: 'pipe' });
  return {
    pty: false,
    pid: child.pid,
    write: (data) => {
      try { child.stdin.write(data); } catch { /* closed */ }
    },
    resize: () => {},
    kill: () => {
      try { child.kill('SIGTERM'); } catch { /* closed */ }
    },
    onData: (cb) => {
      child.stdout.on('data', (chunk) => cb(chunk.toString()));
      child.stderr.on('data', (chunk) => cb(chunk.toString()));
    },
    onExit: (cb) => child.on('exit', (code) => cb(code ?? 0)),
  };
}
