import express from 'express';
import multer from 'multer';
const sharp = await import('sharp').then(m => m.default).catch(() => null);
import crypto from 'crypto';
const { VAULT_URL, VAULT_KEY, SECRET = 'change-me', MIN_NATIVE = '1', APK_URL = '', PORT = 3000 } = process.env;
const app = express(), up = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100e6 } });
app.use(express.json());
process.on('unhandledRejection', e => console.error(e));
for (const m of ['get', 'post', 'put']) { const o = app[m].bind(app); app[m] = (p, ...h) => o(p, ...h.map(f => f.constructor.name === 'AsyncFunction' ? (q, r, n) => f(q, r, n).catch(e => { console.error(e); r.status(500).json({ error: String(e.message || e) }); }) : f)); }
const V = (p, o = {}) => fetch(VAULT_URL + p, { ...o, headers: { 'X-Api-Key': VAULT_KEY, ...o.headers } });
const sig = b => crypto.createHmac('sha256', SECRET).update(b).digest('base64url');
const mint = u => { const b = Buffer.from(u).toString('base64url'); return b + '.' + sig(b); };
const check = (t = '') => { const [b, s] = t.split('.'); return b && s === sig(b) ? Buffer.from(b, 'base64url').toString() : null; };
const auth = (q, r, n) => { const u = check((q.headers.authorization || '').slice(7) || q.query.t); u ? (q.u = u, n()) : r.sendStatus(401); };
let cool = 0, lcache = null, goodVar = null;
const put = async (name, buf, tries = 3) => { lcache = null; for (let i = 0; ; i++) { const f = new FormData(); f.append('file', new Blob([buf]), name); const x = await V('/v1/upload', { method: 'POST', body: f }); if (x.status === 429) cool = Date.now() + 300000; if ((x.status !== 429 && x.status < 500) || i >= tries - 1) return x; await new Promise(z => setTimeout(z, +(process.env.RETRY_MS || 2000) * (i + 1))); } };
const items = j => (Array.isArray(j) ? j : Object.values(j || {}).find(Array.isArray) || []).map(x => typeof x === 'string' ? x : x.name || x.server_filename || x.path || '').map(x => x.split('/').pop()).filter(Boolean);
const linkRaw = async (path, ttl = 600) => (await (await V('/v1/fs/sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, ttl }) })).json()).url;
const lc = new Map();
const link = async (path, ttl = 600) => { const k = path + '|' + ttl, h = lc.get(k); if (h && h.exp > Date.now()) return h.url; const url = await linkRaw(path, ttl); if (url) { if (lc.size > 2000) lc.clear(); lc.set(k, { url, exp: Date.now() + Math.max(30, ttl - 120) * 1000 }); } return url; };
const hash = (p, s) => crypto.scryptSync(p, s, 32).toString('hex');

app.post('/api/auth/:mode', async (q, r) => {
  const u = String(q.body.u || '').toLowerCase().replace(/[^a-z0-9]/g, ''), p = String(q.body.p || '');
  if (u.length < 3 || p.length < 6) return r.status(400).json({ error: 'Use a username of 3+ characters and a password of 6+.' });
  const path = `__user__${u}.json`; let rec = null;
  try { const url = await link(path); if (url) { const x = await fetch(url); if (x.ok) rec = await x.json(); } } catch {}
  if (q.params.mode === 'signup') {
    if (rec) return r.status(409).json({ error: 'That username is taken.' });
    const s = crypto.randomBytes(16).toString('hex');
    const w = await put(path, Buffer.from(JSON.stringify({ s, h: hash(p, s) })));
    if (!w.ok) return r.status(502).json({ error: w.status === 429 ? 'The storage service is rate-limiting right now. Wait a few minutes and try again.' : 'Vault rejected the save: ' + w.status + ' ' + (await w.text()).slice(0, 120) });
  } else if (!rec || hash(p, rec.s) !== rec.h) return r.status(401).json({ error: 'Wrong username or password.' });
  r.json({ t: mint(u), u });
});
app.get('/api/photos', auth, async (q, r) => {
  const all = await listCached();
  if (all === null) return r.status(503).json({ error: 'The vault is not answering right now (it may be blocking requests). Your photos are safe. Try again in a few minutes.' });
  const m = all.filter(n => n.startsWith(q.u + '__')).map(n => n.slice(q.u.length + 2));
  const trash = m.map(n => /^tr__(\d+)__(.+)$/.exec(n)).filter(Boolean).map(x => ({ n: x[2], at: +x[1] })), albums = {};
  m.forEach(n => { const x = /^al__(.+?)__(.+)$/.exec(n); if (x) (albums[x[1]] = albums[x[1]] || []).push(x[2]); });
  r.json({ locked: m.filter(n => /^lk__(?!th__)/.test(n)).map(n => n.slice(4)), lth: m.filter(n => n.startsWith('lk__th__')).map(n => n.slice(8)), items: m.filter(n => !/^(fav|app|th|tr|al|lk)__/.test(n)), apps: m.filter(n => n.startsWith('app__')), favs: m.filter(n => n.startsWith('fav__')).map(n => n.slice(5)), th: m.filter(n => n.startsWith('th__')).map(n => n.slice(4)), trash, albums });
  trash.filter(t => t.at < Date.now() - 30 * 864e5).forEach(t => del(`${q.u}__${t.n}`).then(() => purgeAll(q.u, t.n, m)).catch(() => {}));
});
app.post('/api/upload', auth, up.single('file'), async (q, r) => {
  const taken = +q.body.taken > 0 ? +q.body.taken : Date.now(), name = q.body.kind === 'lock' ? q.file.originalname.replace(/[^\w.\-]/g, '_') : `${taken}_${q.file.originalname.replace(/[^\w.\-]/g, '_')}`;
  const x = await put(`${q.u}__${({ app: 'app__', lock: 'lk__' })[q.body.kind] || ''}${name}`, q.file.buffer);
  if (!x.ok) return r.status(502).json({ error: 'Vault said ' + x.status + ': ' + (await x.text()).slice(0, 150) });
  if (!q.body.kind && IMG.test(name) && Date.now() > cool) try { await put(`${q.u}__th__${name}`, await thumb(q.file.buffer)); } catch (e) { console.error('thumb', e.message); }
  r.json({ name });
});
app.get('/api/file', auth, async (q, r) => {
  const n = String(q.query.name).replace(/[\/\\]/g, '');
  const url = await link(`${q.u}__${n}`);
  url ? r.redirect(url) : r.sendStatus(404);
});
const nm = n => String(n).replace(/[\/\\]/g, '');
const del = path => { lcache = null; return V('/v1/fs/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) }); };
app.post('/api/fav', auth, async (q, r) => {
  for (const n of (q.body.names || []).map(nm)) { const p = `${q.u}__fav__${n}`, x = q.body.on ? await put(p, Buffer.from('1')) : await del(p); if (!x.ok) return r.status(502).json({ error: 'Vault said ' + x.status }); }
  r.json({ ok: true });
});
app.post('/api/delete', auth, async (q, r) => {
  const m = (await ls()).filter(n => n.startsWith(q.u + '__')).map(n => n.slice(q.u.length + 2));
  for (const n of (q.body.names || []).map(nm)) { const x = await del(`${q.u}__${n}`); if (!x.ok) return r.status(502).json({ error: 'Vault said ' + x.status + ': ' + (await x.text()).slice(0, 150) }); await purgeAll(q.u, n, m); }
  r.json({ ok: true });
});
app.post('/api/share', auth, async (q, r) => { const url = await link(`${q.u}__${nm(q.body.name)}`, 86400); url ? r.json({ url }) : r.status(502).json({ error: 'Could not create link' }); });
const IMG = /\.(jpe?g|png|webp|gif|bmp|avif|tiff?)$/i, bad = new Set();
const thumb = async b => { if (!sharp) throw new Error('sharp unavailable'); return sharp(b).rotate().resize(480, 480, { fit: 'inside' }).jpeg({ quality: 72 }).toBuffer(); };
const VARS = [p => `page=${p}`, p => `offset=${(p - 1) * 100}`, p => `start=${(p - 1) * 100}`, p => `skip=${(p - 1) * 100}`];
async function listAll() {
  const get = async q => { const x = await V('/v1/fs/list?dir=' + q); const j = x.ok ? await x.json().catch(() => null) : null; return j === null ? null : items(j); };
  const a = await get(''); if (a === null) return null;
  const seen = new Set(a), out = [...a]; if (a.length < 100) return out;
  for (const v of goodVar === null ? VARS.map((_, i) => i) : [goodVar]) {
    for (let p = 2; p <= 60; p++) {
      const b = await get('&' + VARS[v](p)); if (!b) break;
      const fresh = b.filter(n => !seen.has(n)); if (!fresh.length) break;
      goodVar = v; fresh.forEach(n => seen.add(n)); out.push(...fresh);
      if (b.length < 100) return out;
    }
    if (goodVar !== null) return out;
  }
  return out;
}
const listCached = async () => { if (lcache && Date.now() - lcache.at < 15000) return lcache.data; const d = await listAll(); if (d) lcache = { at: Date.now(), data: d }; return d; };
const ls = async () => (await listCached()) || [];
const purgeAll = async (u, n, m) => { for (const p of ['th__' + n, 'fav__' + n, ...m.filter(x => /^(tr|al)__/.test(x) && x.endsWith('__' + n))]) await del(`${u}__${p}`); };
const albName = s => String(s).replace(/[^\w\- ]+/g, '').replace(/_+/g, '_').replace(/ +/g, '-').slice(0, 40);
app.post('/api/trash', auth, async (q, r) => {
  const m = (await ls()).filter(n => n.startsWith(q.u + '__')).map(n => n.slice(q.u.length + 2));
  for (const n of (q.body.names || []).map(nm)) {
    if (q.body.on) { const x = await put(`${q.u}__tr__${Date.now()}__${n}`, Buffer.from('1')); if (!x.ok) return r.status(502).json({ error: 'Vault said ' + x.status }); }
    else for (const k of m.filter(k => /^tr__\d+__/.test(k) && k.endsWith('__' + n))) await del(`${q.u}__${k}`);
  }
  r.json({ ok: true });
});
app.post('/api/album', auth, async (q, r) => {
  const a = albName(q.body.album); if (!a) return r.status(400).json({ error: 'Name the album' });
  for (const n of (q.body.names || []).map(nm)) { const p = `${q.u}__al__${a}__${n}`, x = q.body.on ? await put(p, Buffer.from('1')) : await del(p); if (!x.ok) return r.status(502).json({ error: 'Vault said ' + x.status }); }
  r.json({ ok: true });
});
app.post('/api/big/init', auth, async (q, r) => {
  const safe = String(q.body.name || 'video').replace(/[^\w.\-]/g, '_'), taken = +q.body.taken > 0 ? +q.body.taken : Date.now();
  const x = await V('/v1/fs/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: `${q.u}__${taken}_${safe}`, size: +q.body.size }) });
  const j = await x.json().catch(() => ({})); r.status(x.ok ? 200 : 502).json(x.ok ? j : { error: 'Vault said ' + x.status });
});
app.put('/api/big/:id/:i', auth, express.raw({ type: '*/*', limit: '64mb' }), async (q, r) => { const x = await V(`/v1/fs/uploads/${encodeURIComponent(q.params.id)}/${+q.params.i}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: q.body }); r.sendStatus(x.ok ? 200 : 502); });
app.post('/api/big/:id/complete', auth, async (q, r) => { const x = await V(`/v1/fs/uploads/${encodeURIComponent(q.params.id)}/complete`, { method: 'POST' }); r.sendStatus(x.ok ? 200 : 502); });
app.get('/api/big/:id', auth, async (q, r) => r.json(await (await V(`/v1/fs/uploads/${encodeURIComponent(q.params.id)}`)).json().catch(() => ({}))));
app.get('/api/blob', auth, async (q, r) => { const url = await link(`${q.u}__${nm(q.query.name)}`); if (!url) return r.sendStatus(404); const x = await fetch(url); if (!x.ok) return r.sendStatus(502); r.type('application/octet-stream').send(Buffer.from(await x.arrayBuffer())); });
app.get('/api/pin', auth, async (q, r) => { try { const url = await link(`__pin__${q.u}.json`), x = url ? await fetch(url) : null; r.json(x && x.ok ? await x.json() : {}); } catch { r.json({}); } });
app.post('/api/pin', auth, async (q, r) => { const url = await link(`__pin__${q.u}.json`).catch(() => null); if (url && (await fetch(url).catch(() => ({ ok: false }))).ok) return r.status(409).json({ error: 'PIN already set' }); const w = await put(`__pin__${q.u}.json`, Buffer.from(JSON.stringify({ salt: String(q.body.salt), check: String(q.body.check) }))); r.status(w.ok ? 200 : 502).json({ ok: w.ok }); });
app.get('/api/usage', auth, async (q, r) => r.json(await (await V('/v1/fs/usage')).json().catch(() => ({}))));
app.get('/api/backfill', auth, async (q, r) => {
  if (Date.now() < cool) return r.json({ done: [], left: 0 });
  const m = (await ls()).filter(n => n.startsWith(q.u + '__')).map(n => n.slice(q.u.length + 2)), have = new Set(m.filter(n => n.startsWith('th__')).map(n => n.slice(4)));
  const miss = m.filter(n => IMG.test(n) && !/^(fav|app|th|tr|al|lk)__/.test(n) && !have.has(n) && !bad.has(q.u + n)), done = [];
  for (const n of miss.slice(0, 2)) { try { const b = Buffer.from(await (await fetch(await link(`${q.u}__${n}`))).arrayBuffer()); await put(`${q.u}__th__${n}`, await thumb(b)); done.push(n); } catch (e) { bad.add(q.u + n); } }
  r.json({ done, left: miss.length - done.length });
});
app.get('/api/health', async (q, r) => { const o = { VAULT_URL: !!VAULT_URL, VAULT_KEY: !!VAULT_KEY, SECRET: SECRET !== 'change-me' }; try { const x = await V('/v1/fs/list?dir='); o.vault = x.status; const j = await x.json().catch(() => null); o.shape = Array.isArray(j) ? 'array:' + j.length : j && typeof j === 'object' ? Object.keys(j) : String(j); o.count = items(j).length; const al = await listAll(); o.total = al ? al.length : null; o.pager = goodVar === null ? 'none' : ['page', 'offset', 'start', 'skip'][goodVar]; } catch (e) { o.vault = String(e.message); } r.json(o); });
app.get('/api/version', (q, r) => r.json({ minNative: +MIN_NATIVE, apk: APK_URL }));
app.use(express.static('public'));
app.listen(PORT);
