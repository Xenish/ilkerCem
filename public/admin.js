const loginView = document.querySelector('#login-view');
const dashboard = document.querySelector('#dashboard-view');
const logout = document.querySelector('#logout');
const loginMessage = document.querySelector('#login-message');
const uploadMessage = document.querySelector('#upload-message');
const adminList = document.querySelector('#admin-list');
const form = document.querySelector('#upload-form');
const statusSelect = document.querySelector('#status');
const demoUrlInput = document.querySelector('#demoUrl');
const imagesInput = document.querySelector('#images');
const imagesHelp = document.querySelector('#images-help');
const statusHelp = document.querySelector('#status-help');
const editIdInput = document.querySelector('#edit-id');
const submitButton = document.querySelector('#submit-app');
const cancelEdit = document.querySelector('#cancel-edit');
const formTitle = document.querySelector('#form-title');
const formModeNote = document.querySelector('#form-mode-note');
const platformKeys = ['windows', 'macos', 'android', 'ios'];

let appsCache = [];
let editingApp = null;
let maxUploadMb = 250;
let maxImageMb = 12;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const statusLabels = { development: 'Geliştirme aşamasında', demo: 'Demo mevcut', download: 'İndirilebilir' };
const platformLabels = { windows: 'Windows', macos: 'macOS', android: 'Android', ios: 'iPhone' };

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Bir sorun oluştu.');
  return data;
}

function parseJsonSafely(text) {
  try { return JSON.parse(text || '{}'); }
  catch { return {}; }
}

function multipartRequest(url, method, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.withCredentials = true;
    xhr.timeout = 0;
    xhr.upload.addEventListener('progress', event => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    });
    xhr.addEventListener('load', () => {
      const data = parseJsonSafely(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
      reject(new Error(data.error || `Sunucu yüklemeyi reddetti (HTTP ${xhr.status}).`));
    });
    xhr.addEventListener('error', () => reject(new Error('Sunucuyla bağlantı yükleme sırasında koptu. Terminalde Node sürecinin hâlâ açık olup olmadığını ve yazılan hata mesajını kontrol et.')));
    xhr.addEventListener('abort', () => reject(new Error('Yükleme iptal edildi.')));
    xhr.send(formData);
  });
}

function selectedUploadSize() {
  const files = [...form.querySelectorAll('input[type="file"]')].flatMap(input => [...input.files]);
  return files.reduce((total, file) => total + file.size, 0);
}

function validateSelectedFileSizes() {
  for (const image of [...imagesInput.files]) {
    if (image.size > maxImageMb * 1024 * 1024) return `${image.name} ${maxImageMb} MB görsel sınırını aşıyor.`;
  }
  for (const key of platformKeys) {
    for (const file of [...document.querySelector(`#${key}File`).files]) {
      if (file.size > maxUploadMb * 1024 * 1024) return `${file.name} ${maxUploadMb} MB dosya sınırını aşıyor.`;
    }
  }
  return '';
}

function showDashboard(yes) {
  loginView.classList.toggle('hidden', yes);
  dashboard.classList.toggle('hidden', !yes);
  logout.classList.toggle('hidden', !yes);
  if (yes) loadApps();
}

function platformOption(item, key) {
  return item?.downloads?.[key] || { available: false, kind: 'none', url: '', fileName: '' };
}

function updatePlatformUi(key) {
  const mode = document.querySelector(`[data-platform-mode="${key}"]`).value;
  const fileWrap = document.querySelector(`[data-platform-file="${key}"]`);
  const urlWrap = document.querySelector(`[data-platform-url="${key}"]`);
  const fileInput = document.querySelector(`#${key}File`);
  const urlInput = document.querySelector(`#${key}Url`);
  const existing = platformOption(editingApp, key);

  fileWrap.classList.toggle('hidden', mode !== 'file');
  urlWrap.classList.toggle('hidden', mode !== 'url');
  fileInput.required = mode === 'file' && !(existing.available && existing.kind === 'file');
  urlInput.required = mode === 'url';
}

function refreshPlatformCards() {
  platformKeys.forEach(key => {
    const existing = platformOption(editingApp, key);
    const current = document.querySelector(`[data-platform-current="${key}"]`);
    if (!existing.available) current.textContent = 'Henüz kaynak yok';
    else if (existing.kind === 'file') current.textContent = `Mevcut dosya: ${existing.fileName || 'yüklü dosya'}`;
    else current.textContent = 'Harici bağlantı kayıtlı';
    updatePlatformUi(key);
  });
}

function updateStatusUi() {
  const status = statusSelect.value;
  const isEditing = Boolean(editingApp);
  demoUrlInput.required = status === 'demo';
  imagesInput.required = !isEditing;

  if (status === 'development') {
    statusHelp.innerHTML = '<strong>Geliştirme aşamasında</strong><span>İndirme kaynağı zorunlu değil · en az 1 ekran görüntüsü · CTA: Yakında</span>';
  } else if (status === 'demo') {
    statusHelp.innerHTML = '<strong>Demo mevcut</strong><span>Demo URL gerekli · CTA: Demo İste</span>';
  } else {
    statusHelp.innerHTML = '<strong>İndirilebilir</strong><span>En az bir platformda dosya veya bağlantı gerekli · CTA: Uygulamayı İndir</span>';
  }

  imagesHelp.textContent = isEditing
    ? `Mevcut ${editingApp?.screenshots?.length || 0} görsel korunacak. Değiştirmek istersen 1–6 yeni görsel seç.`
    : 'Yeni uygulamada en az 1, en fazla 6 görsel gerekli.';
  document.querySelector('#platform-downloads')?.classList.toggle('download-required', status === 'download');
  refreshPlatformCards();
}

function resetPlatformInputs() {
  platformKeys.forEach(key => {
    document.querySelector(`[data-platform-mode="${key}"]`).value = 'none';
    document.querySelector(`#${key}Url`).value = '';
    document.querySelector(`#${key}File`).value = '';
  });
}

function resetEditor() {
  editingApp = null;
  editIdInput.value = '';
  form.reset();
  resetPlatformInputs();
  statusSelect.value = 'development';
  formTitle.textContent = 'Yeni uygulama yayınla';
  formModeNote.textContent = 'Uygulamanın mevcut durumuna göre yalnızca gerekli alanlar zorunlu olur.';
  submitButton.textContent = 'Uygulamayı yayınla ↗';
  cancelEdit.classList.add('hidden');
  uploadMessage.textContent = '';
  updateStatusUi();
}

function startEdit(item) {
  editingApp = item;
  editIdInput.value = item.id;
  document.querySelector('#name').value = item.name || '';
  document.querySelector('#description').value = item.description || '';
  statusSelect.value = item.status || (item.hasDownload ? 'download' : 'development');
  document.querySelector('#platform').value = item.platform || '';
  document.querySelector('#version').value = item.version || '';
  document.querySelector('#instagramUrl').value = item.instagramUrl || '';
  demoUrlInput.value = item.demoUrl || '';
  document.querySelector('#captions').value = (item.screenshots || []).map(screen => screen.caption || '').join('\n');
  imagesInput.value = '';

  platformKeys.forEach(key => {
    const option = platformOption(item, key);
    document.querySelector(`[data-platform-mode="${key}"]`).value = option.available ? option.kind : 'none';
    document.querySelector(`#${key}Url`).value = option.kind === 'url' ? option.url || '' : '';
    document.querySelector(`#${key}File`).value = '';
  });

  formTitle.textContent = `${item.name} düzenle`;
  formModeNote.textContent = 'Yeni görsel veya platform dosyası seçmezsen mevcut kaynaklar korunur.';
  submitButton.textContent = 'Değişiklikleri kaydet ↗';
  cancelEdit.classList.remove('hidden');
  uploadMessage.textContent = '';
  updateStatusUi();
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function downloadSummary(item) {
  const ready = platformKeys.filter(key => item.downloads?.[key]?.available).map(key => platformLabels[key]);
  return ready.length ? ready.join(', ') : 'indirme yok';
}

async function loadApps() {
  try {
    appsCache = await jsonRequest('/api/apps');
    adminList.innerHTML = appsCache.length ? appsCache.map(item => `
      <div class="admin-list-item">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <span>${escapeHtml(statusLabels[item.status] || item.status)} · ${escapeHtml(item.platform)} · ${item.screenshots?.length || 0} görsel${item.version ? ' · v' + escapeHtml(item.version) : ''}</span>
          <small>${escapeHtml(downloadSummary(item))}</small>
        </div>
        <div class="admin-list-actions">
          <button class="admin-edit-button" type="button" data-edit="${item.id}">Düzenle</button>
          <button type="button" data-delete="${item.id}" aria-label="${escapeHtml(item.name)} uygulamasını sil">Sil</button>
        </div>
      </div>`).join('') : '<p>Henüz uygulama eklenmedi.</p>';
  } catch {
    adminList.textContent = 'Liste yüklenemedi.';
  }
}

document.querySelector('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  loginMessage.textContent = 'Giriş yapılıyor…';
  try {
    await jsonRequest('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: document.querySelector('#password').value })
    });
    document.querySelector('#password').value = '';
    loginMessage.textContent = '';
    showDashboard(true);
  } catch (err) {
    loginMessage.textContent = err.message;
  }
});

function validatePlatformDownloads() {
  let readyCount = 0;
  for (const key of platformKeys) {
    const mode = document.querySelector(`[data-platform-mode="${key}"]`).value;
    const existing = platformOption(editingApp, key);
    if (mode === 'none') continue;
    readyCount += 1;
    if (mode === 'url' && !document.querySelector(`#${key}Url`).value.trim()) return `${platformLabels[key]} için bağlantı gerekli.`;
    if (mode === 'file' && !document.querySelector(`#${key}File`).files.length && !(existing.available && existing.kind === 'file')) return `${platformLabels[key]} için dosya seçmelisin.`;
  }
  if (statusSelect.value === 'download' && !readyCount) return 'İndirilebilir durumda en az bir platform için dosya veya bağlantı tanımlamalısın.';
  return '';
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const imageCount = imagesInput.files.length;
  const status = statusSelect.value;

  if (imageCount > 6) return void (uploadMessage.textContent = 'En fazla 6 ekran görüntüsü seçebilirsin.');
  if (!editingApp && imageCount < 1) return void (uploadMessage.textContent = 'En az 1 ekran görüntüsü seçmelisin.');
  if (status === 'demo' && !demoUrlInput.value.trim()) return void (uploadMessage.textContent = 'Demo durumunda Demo URL / iletişim bağlantısı gerekli.');
  const platformError = validatePlatformDownloads();
  if (platformError) return void (uploadMessage.textContent = platformError);
  const sizeError = validateSelectedFileSizes();
  if (sizeError) return void (uploadMessage.textContent = sizeError);

  const wasEditing = Boolean(editingApp);
  const totalMb = selectedUploadSize() / 1024 / 1024;
  submitButton.disabled = true;
  uploadMessage.textContent = totalMb > .1
    ? `Yükleme hazırlanıyor · ${totalMb.toFixed(1)} MB`
    : (wasEditing ? 'Değişiklikler kaydediliyor…' : 'Uygulama kaydediliyor…');
  try {
    const endpoint = editingApp ? `/api/apps/${encodeURIComponent(editingApp.id)}` : '/api/apps';
    const method = editingApp ? 'PATCH' : 'POST';
    await multipartRequest(endpoint, method, new FormData(form), percent => {
      uploadMessage.textContent = `Dosyalar yükleniyor · %${percent}`;
    });
    resetEditor();
    uploadMessage.textContent = wasEditing ? 'Değişiklikler kaydedildi.' : 'Uygulama kaydedildi.';
    await loadApps();
  } catch (err) {
    uploadMessage.textContent = err.message;
  } finally {
    submitButton.disabled = false;
  }
});

platformKeys.forEach(key => document.querySelector(`[data-platform-mode="${key}"]`).addEventListener('change', () => updatePlatformUi(key)));
statusSelect.addEventListener('change', updateStatusUi);
cancelEdit.addEventListener('click', resetEditor);

adminList.addEventListener('click', async event => {
  const editButton = event.target.closest('[data-edit]');
  if (editButton) {
    const item = appsCache.find(app => app.id === editButton.dataset.edit);
    if (item) startEdit(item);
    return;
  }
  const deleteButton = event.target.closest('[data-delete]');
  if (!deleteButton) return;
  const item = appsCache.find(app => app.id === deleteButton.dataset.delete);
  if (!confirm(`${item?.name || 'Bu uygulama'} ve yüklenen dosyaları kalıcı olarak silinsin mi?`)) return;
  deleteButton.disabled = true;
  try {
    await jsonRequest(`/api/apps/${deleteButton.dataset.delete}`, { method: 'DELETE' });
    if (editingApp?.id === deleteButton.dataset.delete) resetEditor();
    await loadApps();
  } catch (err) {
    alert(err.message);
    deleteButton.disabled = false;
  }
});

logout.addEventListener('click', async () => {
  try { await jsonRequest('/api/logout', { method: 'POST' }); }
  finally { resetEditor(); showDashboard(false); }
});

updateStatusUi();
jsonRequest('/api/session').then(data => showDashboard(data.authenticated)).catch(() => showDashboard(false));
fetch('/api/config').then(r => r.json()).then(({ title, maxUploadMb: uploadLimit, maxImageMb: imageLimit }) => {
  document.querySelectorAll('[data-site-title]').forEach(el => el.textContent = title);
  document.title = `Yönetim · ${title}`;
  if (Number.isFinite(Number(uploadLimit))) maxUploadMb = Number(uploadLimit);
  if (Number.isFinite(Number(imageLimit))) maxImageMb = Number(imageLimit);
}).catch(() => {});
