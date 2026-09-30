# İlker Cem Uluçay — kişisel site ve uygulama vitrini

Kişisel landing page, Hakkımda alanı ve uygulama vitrini. BDU ana sayfada gerçek dashboard görüntüsünü kullanan scroll tabanlı ürün turuyla gösterilir. Yeni uygulamalar `/admin` üzerinden eklenir ve uygulama seçim alanına otomatik gelir. `/app/demo` rotası korunur ancak ana akıştan bağlantısı kaldırılmıştır.

## Yerelde çalıştırma

Node.js 20 veya üzeri gerekir.

```sh
cp .env.example .env
# .env içinde ADMIN_PASSWORD ve SESSION_SECRET değerlerini değiştirin
npm ci
npm run dev
```

`npm run dev` ve `npm start`, `.env` dosyasını otomatik yükler. Port `.env` içindeki `PORT` değerinden okunur. Örneğin `PORT=3100` ise:

- Site: `http://localhost:3100`
- Yönetim: `http://localhost:3100/admin`
- Demo rota: `http://localhost:3100/app/demo`

Dosyalar ve uygulama kayıtları `data/` klasöründe saklanır. Bu klasörü yedekleyin.

## Yönetici paneli ve yayın durumları

Admin formunda uygulama adı, açıklama, durum, platform, sürüm, Instagram URL, Demo URL, ekran görüntüleri, görsel açıklamaları ve indirme dosyası yönetilebilir. Mevcut uygulamalar **Düzenle** butonuyla sonradan güncellenebilir; durum değiştirmek için uygulamayı silip yeniden yüklemek gerekmez.

### Geliştirme aşamasında

- İndirme dosyası zorunlu değildir.
- En az 1, en fazla 6 ekran görüntüsü gerekir.
- CTA: **Yakında**.

### Demo mevcut

- İndirme dosyası zorunlu değildir.
- En az 1, en fazla 6 ekran görüntüsü gerekir.
- Demo URL / iletişim bağlantısı zorunludur.
- CTA: **Demo İste**.

### İndirilebilir

- İndirme dosyası zorunludur.
- En az 1, en fazla 6 ekran görüntüsü gerekir.
- CTA: **Uygulamayı İndir**.

Instagram URL opsiyoneldir ve varsa CTA alanında ayrıca gösterilir. Düzenleme sırasında yeni ekran görüntüsü veya indirme dosyası seçilmezse mevcut dosyalar korunur. Yeni ekran görüntüleri seçilirse eski görsellerin tamamı yeni setle değiştirilir.

## BDU ve admin entegrasyonu

Admin panelinde adı **BDU** olan bir kayıt bulunduğunda ana sayfadaki özel BDU bölümünün CTA bilgileri bu kayıttan okunur. Böylece BDU'nun durumunu `Geliştirme → Demo → İndirilebilir` olarak değiştirirken frontend kodunu düzenlemek gerekmez.

BDU için varsayılan Instagram bağlantısı:

`https://www.instagram.com/i.cem.ulucay/`

## Desteklenen indirme dosyaları

APK, AAB, EXE, MSI, DMG, PKG, DEB, RPM, AppImage, ZIP, TAR.GZ ve PDF. Varsayılan üst sınır 250 MB'dır; `.env` içindeki `MAX_UPLOAD_MB` ile değiştirilebilir.

## Hetzner VPS üzerine kurulum

1. Sunucuda Docker Engine ve Docker Compose kurun. DNS A kaydını sunucu IP adresine yönlendirin. Güvenlik duvarında 80 ve 443 portlarını açın.
2. Projeyi sunucuya kopyalayın ve `.env` dosyasını hazırlayın.
3. `.env` içinde `ADMIN_PASSWORD`, `SESSION_SECRET` ve `DOMAIN=alanadiniz.com` değerlerini girin. `SESSION_SECRET` için `openssl rand -hex 32` kullanılabilir.
4. Production'da `SECURE_COOKIE=true` kullanın.
5. `docker compose up -d --build` komutunu çalıştırın. Caddy, alan adı doğru yönlendirildiyse HTTPS sertifikasını otomatik alır.
6. `https://alanadiniz.com/admin` üzerinden giriş yapın.

`ADMIN_PASSWORD`, `SESSION_SECRET` ve `.env` dosyasını Git'e eklemeyin.

## Platform bazlı indirme

`/admin` panelinde bir uygulama **İndirilebilir** durumuna alındığında Windows, macOS, Android ve iPhone için kaynaklar ayrı ayrı yönetilir.

Her platform için üç seçenek vardır:
- **Henüz hazır değil**: indirme seçicisinde platform görünür ancak `Yakında` olarak pasiftir.
- **Dosya yükle**: dosya sunucuya yüklenir ve platform kartından doğrudan indirilir.
- **Harici bağlantı**: Microsoft Store, App Store, TestFlight, Google Play veya başka bir HTTPS adresine yönlendirilir.

İndirilebilir durumda en az bir platformun dosya veya bağlantı olarak hazır olması gerekir. Mevcut bir uygulamayı `Düzenle` ile açıp platform kaynaklarını sonradan değiştirebilirsin. Ana site ve uygulama detay sayfalarındaki **Uygulamayı indir** butonu animasyonlu platform seçiciyi açar.
