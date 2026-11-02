import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
const { VAULT_URL, VAULT_KEY, SECRET = 'change-me', MIN_NATIVE = '1', APK_URL = '', PORT = 3000 } = process.env;
const app = express(), up = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60e6 } });
app.use(express.json());
process.on('unhandledRejection', e => console.error(e));
for (const m of ['get', 'post']) { const o = app[m].bind(app); app[m] = (p, ...h) => o(p, ...h.map(f => f.constructor.name === 'AsyncFunction' ? (q, r, n) => f(q, r, n).catch(e => { console.error(e); r.status(500).json({ error: String(e.message || e) }); }) : f)); }
const V = (p, o = {}) => fetch(VAULT_URL + p, { ...o, headers: { 'X-Api-Key': VAULT_KEY, ...o.headers } });
const sig = b => crypto.createHmac('sha256', SECRET).update(b).digest('base64url');
const mint = u => { const b = Buffer.from(u).toString('base64url'); return b + '.' + sig(b); };
const check = (t = '') => { const [b, s] = t.split('.'); return b && s === sig(b) ? Buffer.from(b, 'base64url').toString() : null; };
const auth = (q, r, n) => { const u = check((q.headers.authorization || '').slice(7) || q.query.t); u ? (q.u = u, n()) : r.sendStatus(401); };
const put = (path, buf) => { const f = new FormData(); f.append('file', new Blob([buf]), path.split('/').pop()); f.append('dir', path.split('/').slice(0, -1).join('/')); return V('/v1/upload', { method: 'POST', body: f }); };
const link = async path => (await (await V('/v1/fs/sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, ttl: 600 }) })).json()).url;
const hash = (p, s) => crypto.scryptSync(p, s, 32).toString('hex');

app.post('/api/auth/:mode', async (q, r) => {
  const u = String(q.body.u || '').toLowerCase().replace(/[^a-z0-9_]/g, ''), p = String(q.body.p || '');
  if (u.length < 3 || p.length < 6) return r.status(400).json({ error: 'Use a username of 3+ characters and a password of 6+.' });
  const path = `users/${u}.json`; let rec = null;
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
  const j = await (await V(`/v1/fs/list?dir=users/${q.u}/photos`)).json().catch(() => []);
  const a = Array.isArray(j) ? j : j.items || j.files || j.entries || [];
  r.json(a.map(x => (x.name || x.path || '').split('/').pop()).filter(Boolean));
});
app.post('/api/upload', auth, up.single('file'), async (q, r) => {
  const name = `${Date.now()}_${q.file.originalname.replace(/[^\w.\-]/g, '_')}`;
  const x = await put(`users/${q.u}/photos/${name}`, q.file.buffer);
  r.status(x.ok ? 200 : 502).json({ name });
});
app.get('/api/file', auth, async (q, r) => {
  const n = String(q.query.name).replace(/[\/\\]/g, '');
  r.redirect(await link(`users/${q.u}/photos/${n}`));
});
app.get('/api/health', async (q, r) => { const o = { VAULT_URL: !!VAULT_URL, VAULT_KEY: !!VAULT_KEY, SECRET: SECRET !== 'change-me' }; try { o.vault = (await V('/v1/fs/list?dir=')).status; } catch (e) { o.vault = String(e.message); } r.json(o); });
app.get('/api/version', (q, r) => r.json({ minNative: +MIN_NATIVE, apk: APK_URL }));
app.use(express.static('public'));
app.listen(PORT);
