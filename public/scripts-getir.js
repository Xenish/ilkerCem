const codeElement = document.querySelector('#script-code');
const copyButton = document.querySelector('#copy-script');
const copyStatus = document.querySelector('#copy-status');
let scriptSource = '';

function extractJavascript(markdown) {
  const match = markdown.match(/```(?:javascript|js)\s*\n([\s\S]*?)\n```/i);
  if (!match) throw new Error('Markdown içinde JavaScript kod bloğu bulunamadı.');
  return match[1].trim();
}

async function loadScript() {
  try {
    const response = await fetch('/scriptsGetir.md', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    scriptSource = extractJavascript(await response.text());
    codeElement.textContent = scriptSource;
    copyButton.disabled = false;
  } catch (error) {
    codeElement.textContent = 'Script yüklenemedi. Lütfen sayfayı yenileyin.';
    copyStatus.textContent = `Hata: ${error.message}`;
  }
}

copyButton.addEventListener('click', async () => {
  if (!scriptSource) return;

  try {
    await navigator.clipboard.writeText(scriptSource);
    copyButton.classList.add('copied');
    copyButton.querySelector('span').textContent = 'Kopyalandı';
    copyStatus.textContent = 'Script panoya kopyalandı.';
    setTimeout(() => {
      copyButton.classList.remove('copied');
      copyButton.querySelector('span').textContent = 'Kodu kopyala';
    }, 2200);
  } catch {
    const selection = getSelection();
    const range = document.createRange();
    range.selectNodeContents(codeElement);
    selection.removeAllRanges();
    selection.addRange(range);
    copyStatus.textContent = 'Kod seçildi. Ctrl+C veya ⌘C ile kopyalayın.';
  }
});

loadScript();
