const selectorDynamic = document.querySelector('#app-selector-dynamic');
const story = document.querySelector('#bdu-story');
const storySticky = story?.querySelector('.bdu-tour-sticky');
const storyChapters = [...document.querySelectorAll('.bdu-tour-copy-block')];
const stageCount = document.querySelector('#bdu-stage-count');
const storyContinue = document.querySelector('.bdu-tour-continue');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

const FEATURED_BDU = {
  status: 'development', // development | demo | download
  instagramUrl: 'https://www.instagram.com/i.cem.ulucay/',
  demoUrl: '',
  downloadUrl: '',
  downloads: {
    windows: { available: false, kind: 'none', url: '', fileName: '' },
    macos: { available: false, kind: 'none', url: '', fileName: '' },
    android: { available: false, kind: 'none', url: '', fileName: '' },
    ios: { available: false, kind: 'none', url: '', fileName: '' }
  },
  title: 'BDU',
  shortStatus: 'Aktif geliştirme',
  archiveDescription: 'BDU, bayi sahiplerinin kurye ve depo operasyonlarını tek merkezden yönetebilmesi için geliştirilen Flutter ve Firebase tabanlı bir Android uygulamasıdır.'
};

function featuredBduActions() {
  const actions = [];
  if (FEATURED_BDU.instagramUrl) actions.push(`<a class="project-view" href="${FEATURED_BDU.instagramUrl}" target="_blank" rel="noreferrer">Instagram <span class="ui-icon ui-icon-arrow-ne" aria-hidden="true"></span></a>`);
  else actions.push('<span class="project-soon">Instagram bağlantısı eklenecek</span>');

  if (FEATURED_BDU.status === 'download') actions.push('<button class="project-download download-picker-trigger" type="button">Uygulamayı indir <span class="ui-icon ui-icon-arrow-down" aria-hidden="true"></span></button>');
  else if (FEATURED_BDU.status === 'demo' && FEATURED_BDU.demoUrl) actions.push(`<a class="project-download" href="${FEATURED_BDU.demoUrl}">Demo iste <span class="ui-icon ui-icon-arrow-ne" aria-hidden="true"></span></a>`);
  else if (FEATURED_BDU.status === 'demo') actions.push('<span class="project-soon">Demo iste</span>');
  else actions.push('<span class="project-soon">Yakında</span>');

  return actions.join('');
}

function mountFeaturedBduActions() {
  const container = document.querySelector('#featured-bdu-actions');
  if (container) container.innerHTML = featuredBduActions();
  const status = document.querySelector('#featured-bdu-status');
  if (status) status.textContent = FEATURED_BDU.shortStatus;
  container?.querySelector('.download-picker-trigger')?.addEventListener('click', () => {
    window.DownloadPicker?.open({ name: FEATURED_BDU.title, downloads: FEATURED_BDU.downloads });
  });
}

function applyBduAdminData(item) {
  if (!item) return;
  FEATURED_BDU.status = item.status || (item.hasDownload ? 'download' : 'development');
  FEATURED_BDU.instagramUrl = item.instagramUrl || FEATURED_BDU.instagramUrl;
  FEATURED_BDU.demoUrl = item.demoUrl || '';
  FEATURED_BDU.downloadUrl = item.downloadUrl || '';
  FEATURED_BDU.downloads = item.downloads || FEATURED_BDU.downloads;
  FEATURED_BDU.shortStatus = FEATURED_BDU.status === 'download' ? 'İndirilebilir' : FEATURED_BDU.status === 'demo' ? 'Demo mevcut' : 'Aktif geliştirme';
  mountFeaturedBduActions();
}

function deviceClass(platform = '') {
  return /android|ios|mobile|telefon|tablet/i.test(platform) ? '' : ' app-choice-device-laptop';
}

function renderSelectorApps(apps) {
  if (!selectorDynamic) return;
  const others = apps.filter(item => item.name.trim().toLocaleLowerCase('tr-TR') !== 'bdu');
  selectorDynamic.innerHTML = others.map((item, index) => `
    <a class="app-choice" href="/app/${encodeURIComponent(item.id)}">
      <span class="app-choice-index">${String(index + 2).padStart(2, '0')}</span>
      <span class="app-choice-device${deviceClass(item.platform)}" aria-hidden="true"><i></i></span>
      <span class="app-choice-copy"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.platform)}${item.version ? ' · v' + escapeHtml(item.version) : ''}</small></span>
      <span class="app-choice-arrow ui-icon ui-icon-arrow-ne" aria-hidden="true"></span>
    </a>`).join('');
}

function observeReveal() {
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  }), { threshold: .1 });
  document.querySelectorAll('.reveal:not(.visible)').forEach(element => observer.observe(element));
}

function bindStoryJumps() {
  document.querySelectorAll('[data-story-jump]').forEach(control => {
    if (control.dataset.storyBound) return;
    control.dataset.storyBound = 'true';
    control.addEventListener('click', event => {
      if (control.tagName === 'BUTTON') event.preventDefault();
      const target = document.getElementById(control.dataset.storyJump);
      target?.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    });
  });
}

async function loadProjects() {
  try {
    const response = await fetch('/api/apps');
    if (!response.ok) throw new Error();
    const apps = await response.json();
    const bdu = apps.find(item => item.name.trim().toLocaleLowerCase('tr-TR') === 'bdu');
    applyBduAdminData(bdu);
    renderSelectorApps(apps);
    bindStoryJumps();
  } catch {
    if (selectorDynamic) selectorDynamic.innerHTML = '';
  }
}

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const lerp = (a, b, t) => a + (b - a) * clamp(t);
let activeStoryStage = -1;

function updateBduStory() {
  if (!story || !storySticky) return;

  if (reduceMotion.matches) {
    storySticky.dataset.stage = '0';
    storyChapters.forEach((chapter, index) => chapter.classList.toggle('active', index === 0));
    return;
  }

  const rect = story.getBoundingClientRect();
  const travel = Math.max(1, rect.height - innerHeight);
  const progress = clamp(-rect.top / travel);
  const scaled = progress * 5;
  const from = Math.min(4, Math.floor(scaled));
  const to = Math.min(5, from + 1);
  const t = clamp(scaled - from);
  const stage = Math.min(5, Math.floor(progress * 6));

  const states = [
    { scale: .90, x: 0, y: 0, shell: 1 },
    { scale: 1.42, x: -6, y: 11, shell: 1.02 },
    { scale: 1.58, x: -7, y: -15, shell: 1.02 },
    { scale: 1.48, x: 18, y: -2, shell: 1.01 },
    { scale: .93, x: 0, y: 0, shell: .94 },
    { scale: .82, x: 0, y: 0, shell: .82 }
  ];

  const a = states[from];
  const b = states[to];
  storySticky.style.setProperty('--tour-progress', progress.toFixed(4));
  storySticky.style.setProperty('--dash-scale', lerp(a.scale, b.scale, t).toFixed(3));
  storySticky.style.setProperty('--dash-x', `${lerp(a.x, b.x, t).toFixed(2)}%`);
  storySticky.style.setProperty('--dash-y', `${lerp(a.y, b.y, t).toFixed(2)}%`);
  storySticky.style.setProperty('--shell-scale', lerp(a.shell, b.shell, t).toFixed(3));

  if (stage !== activeStoryStage) {
    activeStoryStage = stage;
    storySticky.dataset.stage = String(stage);
    storyChapters.forEach((chapter, index) => chapter.classList.toggle('active', index === stage));
    if (stageCount) stageCount.textContent = String(stage + 1).padStart(2, '0');
    if (storyContinue) {
      const isLastStage = stage === storyChapters.length - 1;
      storyContinue.querySelector('span').textContent = isLastStage ? 'Devamını keşfet' : 'Kaydırmaya devam et';
      storyContinue.setAttribute('aria-label', isLastStage ? 'Hikâyeden sonraki bölüme geç' : 'Bir sonraki hikâye sahnesine geç');
    }
  }
}

storyContinue?.addEventListener('click', () => {
  if (!story) return;
  const storyTop = scrollY + story.getBoundingClientRect().top;
  const travel = Math.max(0, story.offsetHeight - innerHeight);
  const isLastStage = activeStoryStage >= storyChapters.length - 1;
  const nextProgress = (Math.max(0, activeStoryStage) + 1.08) / storyChapters.length;
  const targetTop = isLastStage ? storyTop + story.offsetHeight : storyTop + travel * nextProgress;
  scrollTo({ top: targetTop, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
});

function updatePageProgress() {
  const distance = document.documentElement.scrollHeight - innerHeight;
  const progress = distance > 0 ? scrollY / distance : 0;
  document.querySelector('.page-progress')?.style.setProperty('transform', `scaleX(${progress})`);
  const art = document.querySelector('.personal-hero-art');
  if (art && scrollY < innerHeight && !reduceMotion.matches) art.style.translate = `0 ${scrollY * .12}px`;
}

let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    updatePageProgress();
    updateBduStory();
    ticking = false;
  });
}

addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', onScroll);
reduceMotion.addEventListener?.('change', onScroll);
observeReveal();
bindStoryJumps();
mountFeaturedBduActions();
loadProjects();
onScroll();
