import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const file = resolve(process.env.DATA_FILE || './data/runtime.json');
const empty = () => ({ version: 1, users: [], sessions: [], clients: [], pending: [], codes: [], tokens: [], choices: [] });
let state;
let loading;
let queue = Promise.resolve();

async function load() {
  if (state) return state;
  loading ??= (async () => {
    await mkdir(dirname(file), { recursive: true });
    try {
      const loaded = JSON.parse(await readFile(file, 'utf8'));
      if (loaded.version !== 1 || !Array.isArray(loaded.users)) throw Error('Formato de dados inesperado');
      state = loaded;
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      state = empty();
    }
    return state;
  })();
  return loading;
}
export async function read(fn) { return fn(await load()); }
export async function update(fn) {
  const task = queue.then(async () => {
    const old = await load();
    const draft = structuredClone(old);
    const now = Date.now();
    for (const key of ['sessions', 'pending', 'codes', 'tokens']) {
      draft[key] = draft[key].filter(item => item.expires > now);
    }
    const result = await fn(draft);
    const tmp = file + '.' + randomBytes(6).toString('hex') + '.tmp';
    await writeFile(tmp, JSON.stringify(draft, null, 2), { mode: 0o600 });
    await rename(tmp, file);
    state = draft;
    return result;
  });
  queue = task.then(() => {}, () => {});
  return task;
}
export const newToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
