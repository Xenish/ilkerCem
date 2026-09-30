import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

// Load the project's .env file even when the server is started with
// `node server.js` or from a process manager that does not support --env-file.
// Existing environment variables always win so production/Docker secrets are
// never overwritten by the local file.
function loadLocalEnv() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return { found: false, loaded: 0 };

  let loaded = 0;
  const source = fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '');
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
    loaded++;
  }
  return { found: true, loaded };
}

const envState = loadLocalEnv();
const dataDir = path.join(root, 'data');
const fileDir = path.join(dataDir, 'files');
const dbPath = path.join(dataDir, 'apps.json');
fs.mkdirSync(fileDir, { recursive: true });
if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, '[]\n');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(root, 'public'), { index: false, extensions: ['html'] }));

const title = process.env.SITE_TITLE || 'İlker Cem Uluçay';
const password = process.env.ADMIN_PASSWORD || '';
const secret = process.env.SESSION_SECRET || '';
const secure = process.env.SECURE_COOKIE === 'true';
const maxMb = Number(process.env.MAX_UPLOAD_MB || 250);
const allowed = new Set(['.apk', '.aab', '.ipa', '.exe', '.msi', '.dmg', '.pkg', '.deb', '.rpm', '.appimage', '.zip', '.tar.gz', '.pdf']);
const downloadPlatforms = ['windows', 'macos', 'android', 'ios'];
const downloadPlatformLabels = { windows: 'Windows', macos: 'macOS', android: 'Android', ios: 'iPhone' };
const loginAttempts = new Map();

function readApps() {
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}
function writeApps(apps) {
  const payload = JSON.stringify(apps, null, 2) + '\n';
  const temporary = `${dbPath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, payload);
    fs.renameSync(temporary, dbPath);
  } catch (error) {
    // Windows/antivirus/OneDrive bazen atomik rename sırasında dosyayı kısa süreliğine
    // kilitleyebiliyor. Temp dosyayı temizleyip doğrudan yazmayı bir kez deniyoruz.
    try { fs.rmSync(temporary, { force: true }); } catch {}
    try {
      fs.writeFileSync(dbPath, payload);
    } catch (fallbackError) {
      fallbackError.cause = error;
      throw fallbackError;
    }
  }
}
function safeRemove(filePath) {
  try { fs.rmSync(filePath, { force: true }); }
  catch (error) { console.warn('Dosya temizlenemedi:', filePath, error.message); }
}
function cleanupUploadedFiles(req) {
  for (const file of Object.values(req.files || {}).flat()) safeRemove(file.path);
}
function uploadFailure(res, error, req = null) {
  console.error('Yükleme işlemi başarısız:', error);
  if (req) cleanupUploadedFiles(req);
  if (res.headersSent) return;
  res.status(500).json({
    error: 'Yükleme sırasında sunucuda bir dosya yazma hatası oluştu. Node süreci açık kaldı; ayrıntı terminale yazıldı.'
  });
}
function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function sign(value) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}
function sessionValid(req) {
  if (!secret) return false;
  const raw = req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith('session='))?.slice(8);
  if (!raw) return false;
  const [expires, signature] = raw.split('.');
  return Boolean(expires && signature && Number(expires) > Date.now() && safeEqual(signature, sign(expires)));
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
function adminOnly(req, res, next) {
  if (!sessionValid(req)) return res.status(401).json({ error: 'Oturum açmanız gerekiyor.' });
  if (!sameOrigin(req)) return res.status(403).json({ error: 'İstek kaynağı geçersiz.' });
  next();
}
const appStatuses = new Set(['development', 'demo', 'download']);
function appStatus(item) {
  if (appStatuses.has(item.status)) return item.status;
  return item.filePath ? 'download' : 'development';
}
function cleanUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString().slice(0, 500);
  } catch { return null; }
}
function legacyPlatformKey(platform = '') {
  const value = String(platform).toLocaleLowerCase('tr-TR');
  if (value.includes('windows')) return 'windows';
  if (value.includes('mac')) return 'macos';
  if (value.includes('ios') || value.includes('iphone')) return 'ios';
  if (value.includes('android')) return 'android';
  return 'android';
}
function internalDownloads(item) {
  const downloads = {};
  for (const key of downloadPlatforms) {
    const entry = item.downloads?.[key];
    if (!entry) continue;
    if (entry.kind === 'file' && entry.filePath) downloads[key] = { kind: 'file', filePath: entry.filePath, originalName: entry.originalName || '', size: entry.size || 0 };
    else if (entry.kind === 'url' && entry.url) downloads[key] = { kind: 'url', url: entry.url };
  }
  if (!Object.keys(downloads).length && item.filePath) {
    const key = legacyPlatformKey(item.platform);
    downloads[key] = { kind: 'file', filePath: item.filePath, originalName: item.originalName || '', size: item.size || 0 };
  }
  return downloads;
}
function publicDownloads(item) {
  const downloads = internalDownloads(item);
  return Object.fromEntries(downloadPlatforms.map(key => {
    const entry = downloads[key];
    if (!entry) return [key, { platform: key, label: downloadPlatformLabels[key], available: false, kind: 'none', url: '', fileName: '' }];
    if (entry.kind === 'url') return [key, { platform: key, label: downloadPlatformLabels[key], available: true, kind: 'url', url: entry.url, fileName: '' }];
    return [key, { platform: key, label: downloadPlatformLabels[key], available: true, kind: 'file', url: `/api/apps/${item.id}/download/${key}`, fileName: entry.originalName || '' }];
  }));
}
function publicApp(item) {
  const { filePath, originalName, imagePaths, imageTypes, captions, downloads: _downloads, ...visible } = item;
  const status = appStatus(item);
  const downloads = publicDownloads(item);
  const available = Object.values(downloads).filter(option => option.available);
  return {
    ...visible,
    status,
    fileName: originalName || '',
    hasDownload: available.length > 0,
    downloadUrl: status === 'download' && available.length ? available[0].url : '',
    downloads,
    screenshots: (imagePaths || []).map((_, index) => ({
      url: `/api/apps/${item.id}/images/${index}`,
      caption: item.captions?.[index] || `Ekran ${index + 1}`
    }))
  };
}

app.get('/', (_req, res) => res.sendFile(path.join(root, 'public/index.html')));
app.get('/admin', (_req, res) => res.sendFile(path.join(root, 'public/admin.html')));
app.get('/app/:id', (_req, res) => res.sendFile(path.join(root, 'public/detail.html')));
app.get('/api/config', (_req, res) => res.json({ title, maxUploadMb: maxMb, maxImageMb: 12 }));
app.get('/api/apps', (_req, res) => res.json(readApps().map(publicApp)));
app.get('/api/session', (req, res) => res.json({ authenticated: sessionValid(req) }));

app.post('/api/login', (req, res) => {
  if (!sameOrigin(req)) return res.status(403).json({ error: 'İstek kaynağı geçersiz.' });
  const ip = req.ip;
  const entry = loginAttempts.get(ip) || { count: 0, until: 0 };
  if (entry.until > Date.now()) return res.status(429).json({ error: 'Çok fazla deneme. Biraz sonra tekrar deneyin.' });
  if (!password || !secret) return res.status(503).json({ error: 'Yönetici girişi henüz yapılandırılmamış.' });
  if (!safeEqual(String(req.body?.password || ''), password)) {
    entry.count++;
    if (entry.count >= 5) { entry.until = Date.now() + 15 * 60_000; entry.count = 0; }
    loginAttempts.set(ip, entry);
    return res.status(401).json({ error: 'Şifre hatalı.' });
  }
  loginAttempts.delete(ip);
  const expires = String(Date.now() + 7 * 24 * 60 * 60_000);
  res.cookie('session', `${expires}.${sign(expires)}`, { httpOnly: true, sameSite: 'strict', secure, path: '/', maxAge: 7 * 24 * 60 * 60_000 });
  res.json({ ok: true });
});
app.post('/api/logout', adminOnly, (_req, res) => {
  res.clearCookie('session', { httpOnly: true, sameSite: 'strict', secure, path: '/' });
  res.json({ ok: true });
});

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, fileDir),
    filename: (_req, _file, cb) => cb(null, crypto.randomUUID())
  }),
  limits: { fileSize: Math.max(1, maxMb) * 1024 * 1024, files: 11 },
  fileFilter: (_req, file, cb) => {
    const name = path.basename(file.originalname).toLowerCase();
    if (file.fieldname === 'images') {
      if (!['.png', '.jpg', '.jpeg', '.webp', '.avif'].some(ext => name.endsWith(ext))) return cb(new Error('Görseller PNG, JPG, WebP veya AVIF olmalı.'));
    } else if (file.fieldname === 'file' || downloadPlatforms.some(key => file.fieldname === `${key}File`)) {
      if (![...allowed].some(ext => name.endsWith(ext))) return cb(new Error('Bu dosya türü desteklenmiyor.'));
    } else return cb(new Error('Beklenmeyen dosya alanı.'));
    cb(null, true);
  }
}).fields([
  { name: 'file', maxCount: 1 },
  { name: 'windowsFile', maxCount: 1 },
  { name: 'macosFile', maxCount: 1 },
  { name: 'androidFile', maxCount: 1 },
  { name: 'iosFile', maxCount: 1 },
  { name: 'images', maxCount: 6 }
]);

function parseAppFields(req, existing = null) {
  const status = appStatuses.has(String(req.body.status || '')) ? String(req.body.status) : 'development';
  const instagramUrl = cleanUrl(req.body.instagramUrl);
  const demoUrl = cleanUrl(req.body.demoUrl);
  const result = {
    name: String(req.body.name || '').trim().slice(0, 80),
    description: String(req.body.description || '').trim().slice(0, 500),
    platform: String(req.body.platform || '').trim().slice(0, 40),
    version: String(req.body.version || '').trim().slice(0, 30),
    status,
    instagramUrl,
    demoUrl
  };
  if (!result.name || !result.description || !result.platform) return { error: 'Ad, açıklama ve platform gerekli.' };
  if (instagramUrl === null) return { error: 'Instagram URL geçerli bir http/https adresi olmalı.' };
  if (demoUrl === null) return { error: 'Demo URL geçerli bir http/https adresi olmalı.' };
  if (status === 'demo' && !demoUrl) return { error: 'Demo durumunda Demo URL gerekli.' };
  return { value: result };
}

function captionsFor(raw, count, fallback = []) {
  const lines = String(raw || '').split('\n').map(x => x.trim().slice(0, 120));
  return Array.from({ length: count }, (_, index) => lines[index] || fallback[index] || `Ekran ${index + 1}`);
}

function parseDownloads(req, existing = null) {
  const current = existing ? internalDownloads(existing) : {};
  const next = {};
  for (const key of downloadPlatforms) {
    const currentEntry = current[key];
    const fallbackMode = currentEntry?.kind || 'none';
    const mode = String(req.body[`${key}Mode`] || fallbackMode);
    if (!['none', 'file', 'url'].includes(mode)) return { error: `${downloadPlatformLabels[key]} indirme türü geçersiz.` };
    if (mode === 'none') continue;
    if (mode === 'url') {
      const url = cleanUrl(req.body[`${key}Url`]);
      if (url === null || !url) return { error: `${downloadPlatformLabels[key]} için geçerli bir indirme/mağaza bağlantısı gerekli.` };
      next[key] = { kind: 'url', url };
      continue;
    }
    const uploaded = req.files?.[`${key}File`]?.[0];
    if (uploaded) {
      next[key] = { kind: 'file', filePath: uploaded.filename, originalName: path.basename(uploaded.originalname).slice(0, 180), size: uploaded.size };
    } else if (currentEntry?.kind === 'file' && currentEntry.filePath) {
      next[key] = currentEntry;
    } else {
      return { error: `${downloadPlatformLabels[key]} için bir dosya seçmelisin.` };
    }
  }

  // Eski tek-dosya istemcileri için geriye dönük uyumluluk.
  const legacy = req.files?.file?.[0];
  if (legacy && !Object.keys(next).length) {
    const key = legacyPlatformKey(req.body.platform);
    next[key] = { kind: 'file', filePath: legacy.filename, originalName: path.basename(legacy.originalname).slice(0, 180), size: legacy.size };
  }
  return { value: next };
}

function downloadFilePaths(downloads = {}) {
  return Object.values(downloads).filter(entry => entry?.kind === 'file' && entry.filePath).map(entry => entry.filePath);
}

app.post('/api/apps', adminOnly, (req, res) => upload(req, res, (err) => {
  if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `Dosya ${maxMb} MB sınırını aşıyor.` : err.message });
  try {
    const images = req.files?.images || [];
    const cleanup = () => cleanupUploadedFiles(req);
    const parsed = parseAppFields(req);
    if (parsed.error) { cleanup(); return res.status(400).json({ error: parsed.error }); }
    const downloadsParsed = parseDownloads(req);
    if (downloadsParsed.error) { cleanup(); return res.status(400).json({ error: downloadsParsed.error }); }
    const fields = parsed.value;
    const downloads = downloadsParsed.value;
    if (images.some(image => image.size > 12 * 1024 * 1024)) { cleanup(); return res.status(400).json({ error: 'Her görsel en fazla 12 MB olabilir.' }); }
    if (images.length < 1) { cleanup(); return res.status(400).json({ error: 'En az bir ekran görüntüsü gerekli.' }); }
    if (fields.status === 'download' && !Object.keys(downloads).length) { cleanup(); return res.status(400).json({ error: 'İndirilebilir durumda en az bir platform için dosya veya bağlantı gerekli.' }); }
  
    const item = {
      id: crypto.randomUUID(),
      ...fields,
      downloads,
      imagePaths: images.map(image => image.filename),
      imageTypes: images.map(image => image.mimetype),
      captions: captionsFor(req.body.captions, images.length),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const apps = readApps();
    apps.unshift(item);
    writeApps(apps);
    res.status(201).json(publicApp(item));
  } catch (error) {
    return uploadFailure(res, error, req);
  }
}));

app.patch('/api/apps/:id', adminOnly, (req, res) => upload(req, res, (err) => {
  if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `Dosya ${maxMb} MB sınırını aşıyor.` : err.message });
  try {
    const apps = readApps();
    const index = apps.findIndex(x => x.id === req.params.id);
    const existing = apps[index];
    const cleanupNew = () => cleanupUploadedFiles(req);
    if (!existing) { cleanupNew(); return res.status(404).json({ error: 'Uygulama bulunamadı.' }); }
  
    const parsed = parseAppFields(req, existing);
    if (parsed.error) { cleanupNew(); return res.status(400).json({ error: parsed.error }); }
    const downloadsParsed = parseDownloads(req, existing);
    if (downloadsParsed.error) { cleanupNew(); return res.status(400).json({ error: downloadsParsed.error }); }
    const fields = parsed.value;
    const downloads = downloadsParsed.value;
    const newImages = req.files?.images || [];
    if (newImages.some(image => image.size > 12 * 1024 * 1024)) { cleanupNew(); return res.status(400).json({ error: 'Her görsel en fazla 12 MB olabilir.' }); }
    if (fields.status === 'download' && !Object.keys(downloads).length) { cleanupNew(); return res.status(400).json({ error: 'İndirilebilir durumda en az bir platform için dosya veya bağlantı gerekli.' }); }
    if (!newImages.length && !(existing.imagePaths || []).length) { cleanupNew(); return res.status(400).json({ error: 'En az bir ekran görüntüsü gerekli.' }); }
  
    const oldImagePaths = [...(existing.imagePaths || [])];
    const oldDownloads = internalDownloads(existing);
    const imagePaths = newImages.length ? newImages.map(image => image.filename) : oldImagePaths;
    const imageTypes = newImages.length ? newImages.map(image => image.mimetype) : (existing.imageTypes || []);
    const previousCaptions = existing.captions || [];
    const updated = {
      ...existing,
      ...fields,
      downloads,
      filePath: '', originalName: '', size: 0,
      imagePaths,
      imageTypes,
      captions: captionsFor(req.body.captions, imagePaths.length, previousCaptions),
      updatedAt: new Date().toISOString()
    };
    apps[index] = updated;
    writeApps(apps);
  
    if (newImages.length) for (const imagePath of oldImagePaths) safeRemove(path.join(fileDir, imagePath));
    const kept = new Set(downloadFilePaths(downloads));
    for (const oldPath of downloadFilePaths(oldDownloads)) if (!kept.has(oldPath)) safeRemove(path.join(fileDir, oldPath));
    if (existing.filePath && !kept.has(existing.filePath)) safeRemove(path.join(fileDir, existing.filePath));
    res.json(publicApp(updated));
  } catch (error) {
    return uploadFailure(res, error, req);
  }
}));

app.delete('/api/apps/:id', adminOnly, (req, res) => {
  const apps = readApps();
  const item = apps.find(x => x.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Uygulama bulunamadı.' });
  writeApps(apps.filter(x => x.id !== item.id));
  if (item.filePath) safeRemove(path.join(fileDir, item.filePath));
  for (const filePath of downloadFilePaths(internalDownloads(item))) safeRemove(path.join(fileDir, filePath));
  for (const imagePath of item.imagePaths || []) safeRemove(path.join(fileDir, imagePath));
  res.json({ ok: true });
});

app.get('/api/apps/:id/download/:platform', (req, res) => {
  const item = readApps().find(x => x.id === req.params.id);
  const key = String(req.params.platform || '');
  if (!item || appStatus(item) !== 'download' || !downloadPlatforms.includes(key)) return res.sendStatus(404);
  const entry = internalDownloads(item)[key];
  if (!entry || entry.kind !== 'file' || !entry.filePath) return res.sendStatus(404);
  const file = path.join(fileDir, entry.filePath);
  if (!fs.existsSync(file)) return res.sendStatus(404);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.download(file, entry.originalName || `${item.name}-${key}`);
});

// Eski tek dosyalı bağlantıları kullanan kayıtlar için uyumluluk.
app.get('/api/apps/:id/download', (req, res) => {
  const item = readApps().find(x => x.id === req.params.id);
  if (!item || appStatus(item) !== 'download') return res.sendStatus(404);
  const first = Object.values(internalDownloads(item)).find(entry => entry.kind === 'file');
  if (!first?.filePath) return res.sendStatus(404);
  const file = path.join(fileDir, first.filePath);
  if (!fs.existsSync(file)) return res.sendStatus(404);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.download(file, first.originalName || 'download');
});

app.get('/api/apps/:id/images/:index', (req, res) => {
  const item = readApps().find(x => x.id === req.params.id);
  const index = Number(req.params.index);
  if (!item || !Number.isInteger(index) || index < 0 || index >= (item.imagePaths || []).length) return res.sendStatus(404);
  const file = path.join(fileDir, item.imagePaths[index]);
  if (!fs.existsSync(file)) return res.sendStatus(404);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.type(item.imageTypes?.[index] || 'application/octet-stream');
  res.sendFile(file);
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Bir sorun oluştu. Lütfen tekrar deneyin.' });
});

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Site hazır: http://localhost:${port}`);
  console.log(`.env: ${envState.found ? `bulundu (${envState.loaded} yerel değer yüklendi)` : 'bulunamadı'}`);
  console.log(`Admin yapılandırması: ${password && secret ? 'HAZIR' : 'EKSİK'}${password ? '' : ' [ADMIN_PASSWORD eksik]'}${secret ? '' : ' [SESSION_SECRET eksik]'}`);
});
server.on('error', error => {
  if (error?.code === 'EADDRINUSE') {
    console.error(`Port ${port} zaten kullanımda. Eski sunucu hâlâ çalışıyor olabilir. Önce onu kapatıp tekrar deneyin.`);
    process.exit(1);
  }
  throw error;
});
