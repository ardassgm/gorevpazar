GörevPazar güncellemesi: Ücretsiz görev + fotoğraf/video

Eklenenler:
1) Görev açma ekranına görev türü eklendi:
   - Ücretsiz Görev
   - Ücretli Görev

2) Ücretsiz görev kuralları:
   - Kullanıcı günde en fazla 1 ücretsiz görev açabilir.
   - Ücretsiz görev direkt yayınlanır, ödeme ekranına gitmez.
   - Ücretsiz görevlerde en fazla 5 başvuru alınır.
   - Ücretsiz görev tamamlanınca para aktarımı yapılmaz; görev tamamlandı olarak işaretlenir.

3) Ücretli görev davranışı:
   - En az 50 TL bütçe zorunlu.
   - Mevcut demo/PayTR ödeme adımına gider.
   - Ödeme sonrası görev open olur.

4) Görevlere medya eklendi:
   - Görev açarken isteğe bağlı fotoğraf veya video yüklenebilir.
   - Görev kartında ve görev detayında medya gösterilir.
   - İstemci tarafında 18 MB dosya sınırı vardır.
   - Sunucu JSON limiti 30 MB yapıldı.

Değişen dosyalar:
- server/index.js
- public/app.js
- public/style.css

Veritabanı:
Uygulama açıldığında tasks tablosuna otomatik şu alanlar eklenir:
- task_type
- media_name
- media_type
- media_data

Not:
node_modules klasörü ZIP'e dahil edilmedi. Render deploy sırasında npm install ile paketleri kuracaktır.
