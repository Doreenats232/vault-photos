import express from 'express';
import multer from 'multer';
const sharp = await import('sharp').then(m => m.default).catch(() => null);
const { VAULT_URL, VAULT_KEY, ACCESS_KEY = '', MIN_NATIVE = '1', APK_URL = '', PORT = 3000 } = process.env;
const app = express(), up = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100e6 } });
app.use(express.json());
process.on('unhandledRejection', e => console.error(e));
for (const m of ['get', 'post', 'put']) { const o = app[m].bind(app); app[m] = (p, ...h) => o(p, ...h.map(f => f.constructor.name === 'AsyncFunction' ? (q, r, n) => f(q, r, n).catch(e => { console.error(e); r.status(500).json({ error: String(e.message || e) }); }) : f)); }
const V = (p, o = {}) => fetch(VAULT_URL + p, { ...o, headers: { 'X-Api-Key': VAULT_KEY, ...o.headers } });
const JH = { 'Content-Type': 'application/json' };
const auth = (q, r, n) => (!ACCESS_KEY || (q.headers.authorization || '').slice(7) === ACCESS_KEY || q.query.t === ACCESS_KEY) ? n() : r.sendStatus(401);

let cool = 0, lcache = null, goodVar = null, real = new Map();
const MARK = /^(fav|th|tr|al|lk|app)__/, IMG = /\.(jpe?g|png|webp|gif|bmp|avif|tiff?)$/i, MEDIA = /\.(jpe?g|png|webp|gif|bmp|avif|tiff?|heic|heif|mp4|mov|webm|mkv|avi|3gp|m4v|mpe?g)$/i;
const strip = n => n.replace(/^[a-z0-9]+__(?=(\d{12,13}_|(fav|th|tr|al|lk|app)__))/i, '');
const R = id => real.get(id) || id, E = n => n.replace(/\//g, '~'), D = n => n.replace(/~/g, '/');
const safe = s => String(s).replace(/[^\w.\-]/g, '_'), nm = n => String(n).replace(/\.\.+/g, '').replace(/^\/+/, '');

const put = async (name, buf, tries = 3) => { lcache = null; for (let i = 0; ; i++) { const f = new FormData(); f.append('file', new Blob([buf]), name); const x = await V('/v1/upload', { method: 'POST', body: f }); if (x.status === 429) cool = Date.now() + 300000; if ((x.status !== 429 && x.status < 500) || i >= tries - 1) return x; await new Promise(z => setTimeout(z, +(process.env.RETRY_MS || 2000) * (i + 1))); } };
const del = path => { lcache = null; return V('/v1/fs/delete', { method: 'POST', headers: JH, body: JSON.stringify({ path }) }); };
const linkRaw = async (path, ttl = 600) => (await (await V('/v1/fs/sign', { method: 'POST', headers: JH, body: JSON.stringify({ path, ttl }) })).json()).url;
const lc = new Map();
const link = async (path, ttl = 600) => { const k = path + '|' + ttl, h = lc.get(k); if (h && h.exp > Date.now()) return h.url; const url = await linkRaw(path, ttl); if (url) { if (lc.size > 2000) lc.clear(); lc.set(k, { url, exp: Date.now() + Math.max(30, ttl - 120) * 1000 }); } return url; };
const thumb = async b => { if (!sharp) throw new Error('sharp unavailable'); return sharp(b).rotate().resize(480, 480, { fit: 'inside' }).jpeg({ quality: 72 }).toBuffer(); };

const arrOf = (j, ks) => { for (const k of ks) if (j && Array.isArray(j[k])) return j[k]; return null; };
const ent = (j, d) => { let fl = Array.isArray(j) ? j : arrOf(j, ['files', 'items', 'entries', 'list', 'data']), fo = []; if (!fl) fl = Object.values(j || {}).find(Array.isArray) || []; else if (!Array.isArray(j)) fo = (arrOf(j, ['folders', 'folder', 'dirs', 'directories', 'subfolders']) || []).map(x => typeof x === 'string' ? { name: x.split('/').pop(), isdir: 1 } : { ...x, isdir: 1 }); return [...fl, ...fo].map(x => {
  if (typeof x === 'string') x = { name: x };
  const name = x.name || x.server_filename || String(x.path || '').split('/').pop(); if (!name || name === '.' || name === '..') return null;
  const t = +(x.mtime || x.server_mtime || x.modified || x.updatedAt || x.updated || x.time || 0);
  return { path: (d ? d + '/' : '') + name, isDir: !!(x.isdir || x.is_dir || x.isDir || x.type === 'dir' || x.type === 'folder' || x.type === 'directory' || x.is_folder), t: t && t < 1e12 ? t * 1000 : t };
}).filter(Boolean); };
const VARS = [p => `page=${p}`, p => `offset=${(p - 1) * 100}`, p => `start=${(p - 1) * 100}`, p => `skip=${(p - 1) * 100}`];
async function listDir(d, depth = 0) {
  const base = '/v1/fs/list?dir=' + encodeURIComponent(d);
  const get = async q => { const x = await V(base + q); const j = x.ok ? await x.json().catch(() => null) : null; return j === null ? null : ent(j, d); };
  const a = await get(''); if (a === null) return null;
  const seen = new Set(a.map(e => e.path)), out = [...a];
  if (a.length >= 100) {
    paging: for (const v of goodVar === null ? VARS.map((_, i) => i) : [goodVar]) {
      for (let p = 2; p <= 60; p++) {
        const b = await get('&' + VARS[v](p)); if (!b) break;
        const fresh = b.filter(e => !seen.has(e.path)); if (!fresh.length) break;
        goodVar = v; fresh.forEach(e => seen.add(e.path)); out.push(...fresh);
        if (b.length < 100) break paging;
      }
      if (goodVar !== null) break;
    }
  }
  if (depth < 3) for (const e of out.filter(e => e.isDir && !e.path.split('/').pop().startsWith('.')).slice(0, 40)) { const sub = await listDir(e.path, depth + 1); if (sub) out.push(...sub); }
  return out;
}
async function listAll() { const out = await listDir(''); if (out) real = new Map(out.filter(e => !e.isDir).map(e => [strip(e.path), e.path])); return out; }
const listCached = async () => { if (lcache && Date.now() - lcache.at < 15000) return lcache.data; const d = await listAll(); if (d) lcache = { at: Date.now(), data: d }; return d; };
const ids = async () => ((await listCached()) || []).filter(e => !e.isDir).map(e => strip(e.path)).filter(n => !n.startsWith('__'));
const purgeAll = async (n, m) => { for (const p of ['th__' + E(n), 'fav__' + E(n), ...m.filter(x => /^(tr|al)__/.test(x) && x.endsWith('__' + E(n)))]) await del(R(p)); };

app.get('/api/photos', auth, async (q, r) => {
  const all = await listCached();
  if (all === null) return r.status(503).json({ error: 'The vault is not answering right now (it may be blocking requests). Your photos are safe. Try again in a few minutes.' });
  const f = all.filter(e => !e.isDir).map(e => ({ id: strip(e.path), t: e.t })).filter(x => !x.id.startsWith('__')), m = f.map(x => x.id);
  const trash = m.map(n => /^tr__(\d+)__(.+)$/.exec(n)).filter(Boolean).map(x => ({ n: D(x[2]), at: +x[1] })), albums = {}, times = {};
  m.forEach(n => { const x = /^al__(.+?)__(.+)$/.exec(n); if (x) (albums[x[1]] = albums[x[1]] || []).push(D(x[2])); });
  f.forEach(x => { if (x.t && !MARK.test(x.id) && !/^\d{12,13}_/.test(x.id)) times[x.id] = x.t; });
  r.json({ dbg: { files: f.length, dirs: all.filter(e => e.isDir).length, ignored: f.filter(x => !x.id.startsWith('__') && !MARK.test(x.id) && !MEDIA.test(x.id)).slice(0, 8).map(x => x.id) }, items: m.filter(n => !MARK.test(n) && MEDIA.test(n)), apps: m.filter(n => n.startsWith('app__')), favs: m.filter(n => n.startsWith('fav__')).map(n => D(n.slice(5))), th: m.filter(n => n.startsWith('th__')).map(n => D(n.slice(4))), locked: m.filter(n => /^lk__(?!th__)/.test(n)).map(n => n.slice(4)), lth: m.filter(n => n.startsWith('lk__th__')).map(n => n.slice(8)), trash, albums, times });
  trash.filter(t => t.at < Date.now() - 30 * 864e5).forEach(t => del(R(t.n)).then(() => purgeAll(t.n, m)).catch(() => {}));
});
app.post('/api/upload', auth, up.single('file'), async (q, r) => {
  const s = safe(q.file.originalname), taken = +q.body.taken > 0 ? +q.body.taken : Date.now(), kind = q.body.kind, name = kind === 'lock' ? s : `${taken}_${s}`;
  const x = await put(`${({ app: 'app__', lock: 'lk__' })[kind] || ''}${name}`, q.file.buffer);
  if (!x.ok) return r.status(502).json({ error: 'Vault said ' + x.status + ': ' + (await x.text()).slice(0, 150) });
  if (!kind && IMG.test(name) && Date.now() > cool) try { await put('th__' + name, await thumb(q.file.buffer)); } catch (e) { console.error('thumb', e.message); }
  r.json({ name });
});
app.get('/api/file', auth, async (q, r) => { const url = await link(R(nm(q.query.name))); url ? r.redirect(url) : r.sendStatus(404); });
app.get('/api/blob', auth, async (q, r) => { const url = await link(R(nm(q.query.name))); if (!url) return r.sendStatus(404); const x = await fetch(url); if (!x.ok) return r.sendStatus(502); r.type('application/octet-stream').send(Buffer.from(await x.arrayBuffer())); });
app.post('/api/fav', auth, async (q, r) => {
  for (const n of (q.body.names || []).map(nm)) { const p = `fav__${E(n)}`, x = q.body.on ? await put(p, Buffer.from('1')) : await del(R(p)); if (!x.ok) return r.status(502).json({ error: 'Vault said ' + x.status }); }
  r.json({ ok: true });
});
app.post('/api/trash', auth, async (q, r) => {
  const m = await ids();
  for (const n of (q.body.names || []).map(nm)) {
    if (q.body.on) { const x = await put(`tr__${Date.now()}__${E(n)}`, Buffer.from('1')); if (!x.ok) return r.status(502).json({ error: 'Vault said ' + x.status }); }
    else for (const k of m.filter(k => /^tr__\d+__/.test(k) && k.endsWith('__' + E(n)))) await del(R(k));
  }
  r.json({ ok: true });
});
const albName = s => String(s).replace(/[^\w\- ]+/g, '').replace(/_+/g, '_').replace(/ +/g, '-').slice(0, 40);
app.post('/api/album', auth, async (q, r) => {
  const a = albName(q.body.album); if (!a) return r.status(400).json({ error: 'Name the album' });
  for (const n of (q.body.names || []).map(nm)) { const p = `al__${a}__${E(n)}`, x = q.body.on ? await put(p, Buffer.from('1')) : await del(R(p)); if (!x.ok) return r.status(502).json({ error: 'Vault said ' + x.status }); }
  r.json({ ok: true });
});
app.post('/api/delete', auth, async (q, r) => {
  const m = await ids();
  for (const n of (q.body.names || []).map(nm)) { const x = await del(R(n)); if (!x.ok) return r.status(502).json({ error: 'Vault said ' + x.status + ': ' + (await x.text()).slice(0, 150) }); await purgeAll(n, m); }
  r.json({ ok: true });
});
app.post('/api/share', auth, async (q, r) => { const url = await link(R(nm(q.body.name)), 86400); url ? r.json({ url }) : r.status(502).json({ error: 'Could not create link' }); });
app.get('/api/pin', auth, async (q, r) => { try { const e = ((await listCached()) || []).find(e => /^__pin__.*\.json$/.test(e.path)); if (!e) return r.json({}); const x = await fetch(await link(e.path)); r.json(x.ok ? await x.json() : {}); } catch { r.json({}); } });
app.post('/api/pin', auth, async (q, r) => {
  if (((await listCached()) || []).some(e => /^__pin__.*\.json$/.test(e.path))) return r.status(409).json({ error: 'PIN already set' });
  const w = await put('__pin__app.json', Buffer.from(JSON.stringify({ salt: String(q.body.salt), check: String(q.body.check) }))); r.status(w.ok ? 200 : 502).json({ ok: w.ok });
});
app.get('/api/usage', auth, async (q, r) => r.json(await (await V('/v1/fs/usage')).json().catch(() => ({}))));
app.get('/api/backfill', auth, async (q, r) => {
  if (Date.now() < cool) return r.json({ done: [], left: 0 });
  const m = await ids(), have = new Set(m.filter(n => n.startsWith('th__')).map(n => D(n.slice(4))));
  const miss = m.filter(n => IMG.test(n) && !MARK.test(n) && !have.has(n) && !bad.has(n)), done = [];
  for (const n of miss.slice(0, 2)) { try { const b = Buffer.from(await (await fetch(await link(R(n)))).arrayBuffer()); await put(`th__${E(n)}`, await thumb(b)); done.push(n); } catch (e) { bad.add(n); } }
  r.json({ done, left: miss.length - done.length });
});
const bad = new Set();
app.post('/api/big/init', auth, async (q, r) => {
  const taken = +q.body.taken > 0 ? +q.body.taken : Date.now();
  const x = await V('/v1/fs/uploads', { method: 'POST', headers: JH, body: JSON.stringify({ filename: `${taken}_${safe(q.body.name || 'video')}`, size: +q.body.size }) });
  const j = await x.json().catch(() => ({})); r.status(x.ok ? 200 : 502).json(x.ok ? j : { error: 'Vault said ' + x.status });
});
app.put('/api/big/:id/:i', auth, express.raw({ type: '*/*', limit: '64mb' }), async (q, r) => { const x = await V(`/v1/fs/uploads/${encodeURIComponent(q.params.id)}/${+q.params.i}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: q.body }); r.sendStatus(x.ok ? 200 : 502); });
app.post('/api/big/:id/complete', auth, async (q, r) => { const x = await V(`/v1/fs/uploads/${encodeURIComponent(q.params.id)}/complete`, { method: 'POST' }); lcache = null; r.sendStatus(x.ok ? 200 : 502); });
app.get('/api/big/:id', auth, async (q, r) => r.json(await (await V(`/v1/fs/uploads/${encodeURIComponent(q.params.id)}`)).json().catch(() => ({}))));
app.get('/api/health', async (q, r) => {
  const o = { VAULT_URL: !!VAULT_URL, VAULT_KEY: !!VAULT_KEY, ACCESS_KEY: !!ACCESS_KEY };
  try {
    const x = await V('/v1/fs/list?dir='); o.vault = x.status; const j = await x.json().catch(() => null);
    o.shape = Array.isArray(j) ? 'array:' + j.length : j && typeof j === 'object' ? Object.keys(j) : String(j);
    const a = Array.isArray(j) ? j : Object.values(j || {}).find(Array.isArray) || []; o.dir = j && j.dir; o.folder = j && (typeof j.folder === 'string' ? j.folder : typeof j.folder); o.first = a[0] && typeof a[0] === 'object' ? Object.keys(a[0]) : typeof a[0];
    const al = await listAll(); o.total = al ? al.length : null; o.dirs = al ? al.filter(e => e.isDir).length : null; o.pager = goodVar === null ? 'none' : ['page', 'offset', 'start', 'skip'][goodVar];
  } catch (e) { o.vault = String(e.message); }
  r.json(o);
});
app.get('/api/version', (q, r) => r.json({ minNative: +MIN_NATIVE, apk: APK_URL }));
app.use(express.static('public'));
app.listen(PORT);
