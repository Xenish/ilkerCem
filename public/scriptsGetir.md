# Getir Stok Dışa Aktarma Scripti

> Yalnızca erişim yetkiniz bulunan hesap ve verilerde kullanın.

```javascript
(() => {
  const LIMIT = 100;
  const TOTAL_PAGES = 86;
  const COOLDOWN_MS = 1200;
  const isStockRequest = (url) =>
    String(url).includes("franchise-api-gateway.getirapi.com/stocks");

  let captured = null;
  const originalFetch = window.fetch;
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  const originalSend = XMLHttpRequest.prototype.send;

  function restore() {
    window.fetch = originalFetch;
    XMLHttpRequest.prototype.open = originalOpen;
    XMLHttpRequest.prototype.setRequestHeader = originalSetRequestHeader;
    XMLHttpRequest.prototype.send = originalSend;
  }

  function getItems(payload) {
    return [
      payload,
      payload?.data,
      payload?.items,
      payload?.stocks,
      payload?.results,
      payload?.data?.items,
      payload?.data?.stocks,
      payload?.result?.items,
    ].find(Array.isArray);
  }

  async function downloadAllStocks() {
    const allItems = [];

    for (let page = 0; page < TOTAL_PAGES; page++) {
      const url = new URL(captured.url, window.location.origin);
      url.searchParams.set("limit", String(LIMIT));
      url.searchParams.set("offset", String(page * LIMIT));

      const headers = { ...captured.headers };
      delete headers.host;
      delete headers["content-length"];

      console.info(`[${page + 1}/${TOTAL_PAGES}] İstek atılıyor`);
      const response = await originalFetch(url.toString(), {
        method: captured.method,
        headers,
        body: captured.body,
      });

      if (!response.ok) {
        throw new Error(`Sayfa ${page + 1}: HTTP ${response.status}`);
      }

      const payload = await response.json();
      const items = getItems(payload);

      if (!items) {
        console.error("Beklenmeyen yanıt:", payload);
        throw new Error(`Sayfa ${page + 1}: ürün listesi bulunamadı`);
      }

      allItems.push(...items);
      console.info(
        `[${page + 1}/${TOTAL_PAGES}] ${items.length} ürün; toplam ${allItems.length}`,
      );

      if (items.length < LIMIT) break;

      if (page < TOTAL_PAGES - 1) {
        await new Promise((resolve) => setTimeout(resolve, COOLDOWN_MS));
      }
    }

    const blob = new Blob(
      [JSON.stringify(allItems, null, 2)],
      { type: "application/json" },
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download =
      `getir_stok_${new Date().toISOString().replaceAll(":", "-")}.json`;
    link.click();

    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    console.info(`Bitti: ${allItems.length} ürün indirildi.`);
  }

  function capture(request) {
    if (captured) return;
    captured = request;
    restore();
    console.info("Stok isteği yakalandı. Çekim başlıyor...");
    downloadAllStocks().catch((error) =>
      console.error("Stok çekimi durdu:", error),
    );
  }

  window.fetch = function (input, init) {
    const url = input instanceof Request ? input.url : String(input);

    if (isStockRequest(url)) {
      const request = new Request(input, init);
      request.clone().text().then((body) => {
        capture({
          url,
          method: request.method,
          headers: Object.fromEntries(request.headers.entries()),
          body: body || undefined,
        });
      }).catch((error) => console.error("İstek okunamadı:", error));
    }

    return originalFetch.apply(this, arguments);
  };

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__getirStockRequest = {
      method,
      url: String(url),
      headers: {},
    };
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (this.__getirStockRequest) {
      this.__getirStockRequest.headers[name] = value;
    }
    return originalSetRequestHeader.call(this, name, value);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const request = this.__getirStockRequest;

    if (request && isStockRequest(request.url)) {
      capture({ ...request, body: body || undefined });
    }

    return originalSend.call(this, body);
  };

  console.info("Hazır. Sayfadaki Getir düğmesine bir kez basın.");
})();
```
