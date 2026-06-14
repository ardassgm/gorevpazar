# GörevPazar Full

## Çalıştırma
1. ZIP'i çıkar.
2. Klasörde terminal aç.
3. `npm install`
4. `.env.example` dosyasını kopyalayıp `.env` yap.
5. `npm start`
6. Tarayıcı: `http://localhost:3000`

## Demo admin
- E-posta: admin@gorevpazar.com
- Şifre: admin123

## Özellikler
- Gerçek kayıt/giriş sistemi, kayıtlı olmayan e-posta ile girişte uyarı
- JWT oturum sistemi
- SQLite veritabanı
- Görev açma, listeleme, arama, kategori/şehir filtreleme
- Başvuru, başvuru kabul, teslim, onay, ödeme serbest bırakma akışı
- Kullanıcı paneli ve admin paneli
- Yasaklı görev kelime filtresi
- PayTR entegrasyon ekranı ve backend hazırlığı

## PayTR
Canlı ödeme için önce siteyi yayınla, sonra PayTR mağaza bilgilerinden Merchant ID, Key, Salt değerlerini `.env` içine yaz. PayTR hesabı onaylanmadan canlı ödeme çalışmaz. Şimdilik demo ödeme modu görev akışını test ettirir.
