Görev teslim / kanıt / uyuşmazlık sistemi eklendi.

Eklenenler:
- Görev yapan kişi teslim sırasında teslim notu yazabilir.
- Kanıt linki/açıklaması ekleyebilir.
- Ekran görüntüsü, PDF, ZIP veya TXT dosyası yükleyebilir.
- Görev sahibi teslim kanıtını görebilir.
- Görev sahibi teslimi onaylayabilir.
- Görev sahibi revizyon isteyebilir.
- Görev sahibi uyuşmazlık açabilir.
- Admin panelinde Uyuşmazlık Merkezi eklendi.
- Admin, görev yapan haklı diyerek ödemeyi serbest bırakabilir.
- Admin, revizyona gönder kararı verebilir.

Not:
- Bu sürüm dosyaları SQLite veritabanında base64 olarak saklar. MVP için uygundur.
- Gerçek büyümede dosya depolama için S3/Cloudinary gibi kalıcı dosya servisi kullanılmalıdır.
- Mevcut veritabanı otomatik kolon güncellemesi yapar; eski veriler silinmez.

Yayına alma:
1) ZIP'i çıkar.
2) Mevcut proje klasörünün dosyalarını bu sürümle değiştir.
3) CMD:
   npm install
   npm start
4) Local test:
   http://localhost:3000
5) GitHub'a gönder:
   git add .
   git commit -m "teslim kanit ve uyusmazlik sistemi eklendi"
   git push
6) Render otomatik günceller.
