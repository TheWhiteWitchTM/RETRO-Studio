/** Pull `file:line:column message` diagnostics out of a compiler log. */
export function parseProblems(text, fallbackFile = '') {
  const problems = [];
  const seen = new Set();
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(/^(.*?):(\d+):(\d+)\s+([\s\S]+)$/);
    if (!match) continue;
    let file = match[1].trim();
    if (!file || file.includes('://')) continue;
    if (file.startsWith('at ')) continue;
    const problem = {
      file: file || fallbackFile,
      line: Number(match[2]),
      column: Number(match[3]),
      message: match[4].trim(),
    };
    if (!problem.message || !Number.isFinite(problem.line)) continue;
    const key = `${problem.file}:${problem.line}:${problem.column}:${problem.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    problems.push(problem);
  }
  return problems;
}

/**
 * Subsequence score for quick open.
 * `0` means the query does not fit. Higher is a closer match.
 */
export function fuzzyScore(query, text) {
  const q = String(query || '').toLowerCase();
  const value = String(text || '');
  const t = value.toLowerCase();
  if (!q) return 1;
  let qi = 0;
  let score = 0;
  let last = -2;
  for (let i = 0; i < t.length && qi < q.length; i += 1) {
    if (t[i] !== q[qi]) continue;
    score += 2;
    if (i === last + 1) score += 5;
    const prev = i === 0 ? '/' : t[i - 1];
    if (prev === '/' || prev === '-' || prev === '_' || prev === '.' || prev === ' ') score += 4;
    last = i;
    qi += 1;
  }
  if (qi < q.length) return 0;
  const base = t.slice(t.lastIndexOf('/') + 1);
  if (base.startsWith(q)) score += 24;
  else if (base.includes(q)) score += 12;
  score -= Math.min(value.length, 80) * 0.01;
  return score;
}

export function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function stripAnsi(text) {
  return String(text).replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}
