(() => {
  const platforms = [
    { key: 'windows', label: 'Windows', note: 'Windows için masaüstü sürümü', glyph: '⊞' },
    { key: 'macos', label: 'macOS', note: 'Mac için masaüstü sürümü', glyph: '⌘' },
    { key: 'android', label: 'Android', note: 'Telefon ve desteklenen el terminalleri', glyph: 'A' },
    { key: 'ios', label: 'iPhone', note: 'iOS / iPhone sürümü', glyph: '◉' }
  ];

  let overlay = null;
  let lastFocus = null;
  let currentApp = null;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'download-picker';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <div class="download-picker-backdrop" data-download-close></div>
      <section class="download-picker-panel" role="dialog" aria-modal="true" aria-labelledby="download-picker-title">
        <div class="download-picker-orbit" aria-hidden="true"><i></i><i></i><i></i></div>
        <header class="download-picker-head">
          <div><span class="download-picker-kicker">PLATFORM SEÇ</span><h2 id="download-picker-title">Nerede kullanacaksın?</h2><p id="download-picker-copy">Uygun sürümü seç; hazır olmayan platformları da burada görebilirsin.</p></div>
          <button class="download-picker-close" type="button" data-download-close aria-label="İndirme penceresini kapat"><span></span><span></span></button>
        </header>
        <div class="download-picker-grid" id="download-picker-grid"></div>
        <footer class="download-picker-foot"><span id="download-picker-app">UYGULAMA</span><span>ESC ile kapat</span></footer>
      </section>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onKeyDown);
    return overlay;
  }

  function detectedPlatform() {
    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) return 'android';
    if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
    if (/Windows/i.test(ua)) return 'windows';
    if (/Macintosh|Mac OS X/i.test(ua)) return 'macos';
    return '';
  }

  function renderCards(app) {
    const grid = overlay.querySelector('#download-picker-grid');
    const detected = detectedPlatform();
    grid.innerHTML = platforms.map((platform, index) => {
      const option = app.downloads?.[platform.key] || { available: false, kind: 'none', url: '', fileName: '' };
      const ready = Boolean(option.available && option.url);
      const source = ready ? (option.kind === 'url' ? 'Mağaza / bağlantı' : option.fileName || 'Dosya hazır') : 'Yakında';
      return `<button class="download-platform-card ${ready ? 'is-ready' : 'is-soon'} ${detected === platform.key ? 'is-detected' : ''}" type="button" data-download-platform="${platform.key}" ${ready ? '' : 'disabled'} style="--card-index:${index}">
        <span class="download-platform-index">0${index + 1}</span>
        <span class="download-platform-glyph" aria-hidden="true">${platform.glyph}</span>
        <span class="download-platform-copy"><strong>${platform.label}</strong><small>${esc(platform.note)}</small></span>
        <span class="download-platform-state"><i></i>${esc(source)}</span>${detected === platform.key ? '<span class="download-platform-device">BU CİHAZ</span>' : ''}
        <span class="download-platform-arrow${ready ? ' ui-icon ui-icon-arrow-se' : ''}" aria-hidden="true">${ready ? '' : '—'}</span>
      </button>`;
    }).join('');
  }

  function open(app) {
    if (!app) return;
    ensureOverlay();
    currentApp = app;
    lastFocus = document.activeElement;
    renderCards(app);
    overlay.querySelector('#download-picker-app').textContent = `${app.name || 'Uygulama'} / İNDİRME`;
    overlay.querySelector('#download-picker-title').textContent = `${app.name || 'Uygulama'} nerede çalışsın?`;
    overlay.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('download-picker-open');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      overlay.classList.add('is-open');
      overlay.querySelector('.download-picker-close')?.focus({ preventScroll: true });
    }));
  }

  function close() {
    if (!overlay || !overlay.classList.contains('is-open')) return;
    overlay.classList.remove('is-open');
    overlay.classList.remove('is-leaving');
    document.documentElement.classList.remove('download-picker-open');
    setTimeout(() => {
      overlay?.setAttribute('aria-hidden', 'true');
      lastFocus?.focus?.({ preventScroll: true });
      currentApp = null;
    }, 380);
  }

  function launch(key, card) {
    const option = currentApp?.downloads?.[key];
    if (!option?.available || !option.url) return;
    overlay.classList.add('is-leaving');
    card.classList.add('is-launching');
    card.querySelector('.download-platform-state').innerHTML = '<i></i>Hazırlanıyor…';
    setTimeout(() => {
      window.location.href = option.url;
    }, 520);
  }

  function onOverlayClick(event) {
    const closeTarget = event.target.closest('[data-download-close]');
    if (closeTarget) return close();
    const card = event.target.closest('[data-download-platform]');
    if (card && !card.disabled) launch(card.dataset.downloadPlatform, card);
  }

  function onKeyDown(event) {
    if (!overlay?.classList.contains('is-open')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusables = [...overlay.querySelectorAll('button:not([disabled]),a[href]')];
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  window.DownloadPicker = { open, close };
})();
