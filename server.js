import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
const { VAULT_URL, VAULT_KEY, SECRET = 'change-me', MIN_NATIVE = '1', APK_URL = '', PORT = 3000 } = process.env;
const app = express(), up = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100e6 } });
app.use(express.json());
process.on('unhandledRejection', e => console.error(e));
for (const m of ['get', 'post']) { const o = app[m].bind(app); app[m] = (p, ...h) => o(p, ...h.map(f => f.constructor.name === 'AsyncFunction' ? (q, r, n) => f(q, r, n).catch(e => { console.error(e); r.status(500).json({ error: String(e.message || e) }); }) : f)); }
const V = (p, o = {}) => fetch(VAULT_URL + p, { ...o, headers: { 'X-Api-Key': VAULT_KEY, ...o.headers } });
const sig = b => crypto.createHmac('sha256', SECRET).update(b).digest('base64url');
const mint = u => { const b = Buffer.from(u).toString('base64url'); return b + '.' + sig(b); };
const check = (t = '') => { const [b, s] = t.split('.'); return b && s === sig(b) ? Buffer.from(b, 'base64url').toString() : null; };
const auth = (q, r, n) => { const u = check((q.headers.authorization || '').slice(7) || q.query.t); u ? (q.u = u, n()) : r.sendStatus(401); };
const put = (name, buf) => { const f = new FormData(); f.append('file', new Blob([buf]), name); return V('/v1/upload', { method: 'POST', body: f }); };
const items = j => (Array.isArray(j) ? j : Object.values(j || {}).find(Array.isArray) || []).map(x => typeof x === 'string' ? x : x.name || x.server_filename || x.path || '').map(x => x.split('/').pop()).filter(Boolean);
const link = async (path, ttl = 600) => (await (await V('/v1/fs/sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, ttl }) })).json()).url;
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
    if (!w.ok) return r.status(502).json({ error: 'Vault rejected the save: ' + w.status + ' ' + (await w.text()).slice(0, 200) });
  } else if (!rec || hash(p, rec.s) !== rec.h) return r.status(401).json({ error: 'Wrong username or password.' });
  r.json({ t: mint(u), u });
});
app.get('/api/photos', auth, async (q, r) => {
  const j = await (await V('/v1/fs/list?dir=')).json().catch(() => []);
  const m = items(j).filter(n => n.startsWith(q.u + '__')).map(n => n.slice(q.u.length + 2));
  r.json({ items: m.filter(n => !/^(fav|app)__/.test(n)), apps: m.filter(n => n.startsWith('app__')), favs: m.filter(n => n.startsWith('fav__')).map(n => n.slice(5)) });
});
app.post('/api/upload', auth, up.single('file'), async (q, r) => {
  const taken = +q.body.taken > 0 ? +q.body.taken : Date.now(), name = `${taken}_${q.file.originalname.replace(/[^\w.\-]/g, '_')}`;
  const x = await put(`${q.u}__${q.body.kind === 'app' ? 'app__' : ''}${name}`, q.file.buffer);
  if (!x.ok) return r.status(502).json({ error: 'Vault said ' + x.status + ': ' + (await x.text()).slice(0, 150) });
  r.json({ name });
});
app.get('/api/file', auth, async (q, r) => {
  const n = String(q.query.name).replace(/[\/\\]/g, '');
  const url = await link(`${q.u}__${n}`);
  url ? r.redirect(url) : r.sendStatus(404);
});
const nm = n => String(n).replace(/[\/\\]/g, '');
const del = path => V('/v1/fs/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) });
app.post('/api/fav', auth, async (q, r) => {
  for (const n of (q.body.names || []).map(nm)) { const p = `${q.u}__fav__${n}`, x = q.body.on ? await put(p, Buffer.from('1')) : await del(p); if (!x.ok) return r.status(502).json({ error: 'Vault said ' + x.status }); }
  r.json({ ok: true });
});
app.post('/api/delete', auth, async (q, r) => {
  for (const n of (q.body.names || []).map(nm)) { const x = await del(`${q.u}__${n}`); if (!x.ok) return r.status(502).json({ error: 'Vault said ' + x.status + ': ' + (await x.text()).slice(0, 150) }); await del(`${q.u}__fav__${n}`); }
  r.json({ ok: true });
});
app.post('/api/share', auth, async (q, r) => { const url = await link(`${q.u}__${nm(q.body.name)}`, 86400); url ? r.json({ url }) : r.status(502).json({ error: 'Could not create link' }); });
app.get('/api/health', async (q, r) => { const o = { VAULT_URL: !!VAULT_URL, VAULT_KEY: !!VAULT_KEY, SECRET: SECRET !== 'change-me' }; try { const x = await V('/v1/fs/list?dir='); o.vault = x.status; const j = await x.json().catch(() => null); o.shape = Array.isArray(j) ? 'array:' + j.length : j && typeof j === 'object' ? Object.keys(j) : String(j); } catch (e) { o.vault = String(e.message); } r.json(o); });
app.get('/api/version', (q, r) => r.json({ minNative: +MIN_NATIVE, apk: APK_URL }));
app.use(express.static('public'));
app.listen(PORT);
