const root = document.querySelector('#detail-root');
const id = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function ctaFor(item, demo) {
  if (demo) return '<a class="download-action" href="/#uygulamalar">Uygulamalara dön <span>↗</span></a>';
  const actions = [];
  if (item.instagramUrl) actions.push(`<a class="download-action" href="${item.instagramUrl}" target="_blank" rel="noreferrer">Instagram <span>↗</span></a>`);
  if (item.status === 'download') actions.push('<button class="download-action detail-download-picker" type="button">Uygulamayı indir <span>↗</span></button>');
  else if (item.status === 'demo' && item.demoUrl) actions.push(`<a class="download-action" href="${item.demoUrl}" target="_blank" rel="noreferrer">Demo iste <span>↗</span></a>`);
  else actions.push('<span class="download-action detail-soon">Yakında</span>');
  return `<div class="detail-cta-group">${actions.join('')}</div>`;
}

function statusText(item, demo) {
  if (demo) return 'ÖRNEK AKIŞ';
  if (item.status === 'download') return 'İNDİRİLEBİLİR';
  if (item.status === 'demo') return 'DEMO MEVCUT';
  return 'AKTİF GELİŞTİRME';
}

function closingCopy(item, demo) {
  if (demo) return { overline: 'VİTRİN ÖNİZLEMESİ', title: 'Sıradaki gerçek proje burada.', body: 'Bu örnek, uygulama yayınlandığında görsellerin nasıl akacağını gösterir.' };
  if (item.status === 'download') return { overline: 'HAZIR', title: 'Deneyim şimdi sende.', body: 'Uygulamayı cihazına indir ve kendin keşfet.' };
  if (item.status === 'demo') return { overline: 'DEMO', title: 'Ürünü daha yakından gör.', body: 'Demo veya iletişim bağlantısı üzerinden uygulama hakkında daha fazla bilgi al.' };
  return { overline: 'AKTİF GELİŞTİRME', title: 'Yeni sürüm hazırlanıyor.', body: 'Uygulama geliştirme aşamasında. Güncel durum ve paylaşımlar için bağlantıları takip edebilirsin.' };
}

function render(item, demo) {
  const screenshots = item.screenshots || [];
  const closing = closingCopy(item, demo);
  document.title = `${item.name} · İlker Cem Uluçay`;
  root.innerHTML = `
    <section class="detail-hero"><div class="detail-hero-preview"></div><div class="detail-hero-content"><a class="detail-back" href="/#uygulamalar">← TÜM UYGULAMALAR</a><h1>${escapeHtml(item.name)}<span>.</span></h1><div class="detail-hero-meta"><p>${escapeHtml(item.description)}</p><span class="detail-meta-pill">${statusText(item, demo)}${!demo && item.version ? ' / v' + escapeHtml(item.version) : ''}</span></div></div><div class="detail-scroll-cue">AŞAĞI KAYDIR ↓</div></section>
    <section class="story-intro"><div class="section-inner"><div><span class="overline">02 / DENEYİM AKIŞI</span><h2>Ekran ekran<br>keşfet<span class="orange">.</span></h2></div><p>Kaydırdıkça uygulamanın farklı yüzleri karşına çıkacak.</p></div></section>
    <section class="story-layout" aria-label="Uygulama görselleri ve akışı"><div class="story-stage"><div class="stage-backdrop"></div><div class="stage-frame">${screenshots.map((screen, index) => `<img src="${screen.url}" alt="${escapeHtml(item.name)} ekran ${index + 1}" class="${index === 0 ? 'active' : ''}" ${index > 0 ? 'loading="lazy"' : ''}>`).join('')}</div><div class="stage-counter"><span id="active-count">01</span> / ${String(screenshots.length).padStart(2, '0')}</div></div><div class="story-steps">${screenshots.map((screen, index) => `<article class="story-step ${index === 0 ? 'active' : ''}" data-step="${index}"><span class="step-number">${String(index + 1).padStart(2, '0')} / ${String(screenshots.length).padStart(2, '0')}</span><h3>${index === 0 ? 'İlk bakış' : index === screenshots.length - 1 ? 'Son dokunuş' : 'Akışın içinde'}</h3><p>${escapeHtml(screen.caption)}</p><div class="step-line"></div></article>`).join('')}</div></section>
    <section class="detail-download"><div class="section-inner"><div><span class="overline">${closing.overline}</span><h2>${closing.title}</h2></div><div><p>${closing.body}</p>${ctaFor(item, demo)}</div></div></section>`;

  root.querySelector('.detail-download-picker')?.addEventListener('click', () => {
    window.DownloadPicker?.open({ name: item.name, downloads: item.downloads });
  });

  const steps = [...document.querySelectorAll('.story-step')];
  const images = [...document.querySelectorAll('.stage-frame img')];
  let active = 0;
  function updateStory() {
    if (steps.length) {
      const target = innerHeight * (innerWidth <= 680 ? .68 : .5);
      let next = 0, distance = Infinity;
      steps.forEach((step, index) => {
        const rect = step.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const d = Math.abs(center - target);
        if (d < distance) { distance = d; next = index; }
      });
      if (next !== active) {
        active = next;
        steps.forEach((step, i) => step.classList.toggle('active', i === active));
        images.forEach((image, i) => image.classList.toggle('active', i === active));
        const counter = document.querySelector('#active-count');
        if (counter) counter.textContent = String(active + 1).padStart(2, '0');
      }
    }
    const total = document.documentElement.scrollHeight - innerHeight;
    document.querySelector('.page-progress').style.transform = `scaleX(${total > 0 ? scrollY / total : 0})`;
  }
  addEventListener('scroll', updateStory, { passive: true });
  addEventListener('resize', updateStory);
  updateStory();
}

async function load() {
  if (id === 'demo') { render(window.demoApp, true); return; }
  try {
    const response = await fetch('/api/apps');
    if (!response.ok) throw new Error();
    const item = (await response.json()).find(app => app.id === id);
    if (!item) throw new Error();
    render(item, false);
  } catch {
    root.innerHTML = '<div class="detail-loading"><h1 class="detail-error">Uygulama bulunamadı.</h1><a href="/#uygulamalar">← Uygulamalara dön</a></div>';
  }
}

fetch('/api/config').then(r => r.json()).then(({ title }) => document.querySelectorAll('[data-site-title]').forEach(el => el.textContent = title)).catch(() => {});
load();
