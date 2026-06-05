# İngilizce Konuşma Becerisi Değerlendirme Uygulaması

**Türkiye Yüzyılı Maarif Modeli (TYMM)** çerçevesine uygun, **9. sınıf**
öğrencilerine yönelik İngilizce konuşma becerisi değerlendirme aracı.
Öğretmenler tarafından sınıfta kullanılmak üzere tasarlanmıştır.

> Öğrenci konuşur → uygulama konuşmayı yazıya döker → **5 ölçüt** üzerinden
> otomatik puanlar → öğretmen düzenler ve raporu kaydeder.

## Özellikler

- 🎙️ **Gerçek ses analizi** — Web Audio API ile öğrencinin **sesi (dalga formu)**
  doğrudan incelenir: konuşma/sessizlik oranı, duraklama sayısı ve uzunluğu, konuşma
  hızı (hece/sn), tonlama (pitch) değişimi ve ses kararlılığı ölçülür. Bu ölçümler
  **metinden bağımsızdır**; öğrenci çok zayıf İngilizce konuşsa, hatta hiç tanınır
  kelime çıkmasa bile sesin akustik özellikleri değerlendirilir.
- 🔊 **Ses kaydı + dinleme** — Konuşma kaydedilir; öğretmen sonuç ekranında **dinleyip**
  puanları teyit/düzelt edebilir, kaydı indirebilir.
- 🗣️ **Konuşma tanıma (metin)** — Web Speech API ile konuşma ayrıca yazıya dökülür;
  uyum, organizasyon, dil ve yaratıcılık bu metinden ölçülür. Mikrofon yoksa metin elle girilebilir.
- 🎯 **İsteğe bağlı Whisper modu (ücretsiz)** — Ayar ekranındaki seçenek işaretlenirse konuşma,
  tarayıcıda çalışan açık kaynak **Whisper** (`transformers.js`, ONNX-WASM) ile **çok daha doğru**
  yazıya dökülür — aksanlı/zayıf İngilizcede bile. Hesap/ücret yok; ilk kullanımda model indirilir
  (internet gerekir), sonrası tarayıcıda çevrimdışı çalışır. Ağ/destek yoksa otomatik olarak Web
  Speech metnine düşer.
- 📊 **5 ölçütlü değerlendirme** — Her ölçüt %20 ağırlıklıdır (toplam 100); 0–100 ham
  puan ve 1–4 başarım düzeyi olarak gösterilir:
  1. **Uyum** (Relevance) — göreve/konuya uygunluk
  2. **Organizasyon** (Organization) — düzen, bağlaçlar, giriş-gelişme-sonuç
  3. **Sunum** (Delivery) — akıcılık, telaffuz, anlaşılırlık (gerçek ses analizinden)
  4. **Dil** (Language Use) — dilbilgisi + söz dağarcığı
  5. **Yaratıcılık** (Creativity) — özgünlük, ifade zenginliği
- 🏫 **Sınıf yönetimi** — Sınıf oluştur, öğrenci ekle/sil; **toplu öğrenci ekleme**
  (her satıra bir isim yapıştır). Veriler tarayıcıda saklanır.
- 📝 **Sınav modu** — Bir sınıf + konuşma görevi seç, tüm öğrencileri sırayla aynı görevle
  değerlendir. İlerleme takibi, sınıf **özet tablosu** (kriter kırılımı + sınıf ortalaması)
  ve **CSV / yazdırma** ile dışa aktarma.
- ✍️ **Öğretmen denetimi** — Otomatik puanlar bir ön öneridir; öğretmen her ölçütü
  elle düzeltebilir, toplam ve düzey anında güncellenir.
- 📚 **Hazır konuşma görevleri** — 9. sınıf "Waymark" ders kitabının 8 temasıyla
  birebir uyumlu, CEFR A2 düzeyinde konuşma promptları:
  1. School Life · 2. Classroom Life · 3. Physical Appearance & Personality ·
  4. Family Life · 5. Life in the House & Neighbourhood · 6. Life in the City & Country ·
  7. Life in the World & Nature · 8. Life in the Universe & Future.
- 🧾 **Raporlama** — Sonucu yazdırma/PDF, JSON olarak dışa aktarma ve oturum içi geçmiş.
- 🔒 **Gizlilik** — Tüm veriler yalnızca öğretmenin tarayıcısında (localStorage) tutulur;
  hiçbir veri sunucuya gönderilmez.

## Kullanım

Kurulum gerektirmez. `index.html` dosyasını bir tarayıcıda açmak yeterlidir.

> **Not:** Mikrofon erişimi ve konuşma tanıma için **Chrome** veya **Edge** önerilir
> ve sayfanın `https://` ya da `localhost` üzerinden açılması gerekir. Yerelde test için:

```bash
# Basit yerel sunucu (Python 3)
python3 -m http.server 8000
# Ardından tarayıcıda: http://localhost:8000
```

### Akış
1. **Hazırlık:** Öğrenci adı/sınıfını girin, bir konuşma görevi seçin.
2. **Kayıt:** "Kaydı Başlat" → öğrenci İngilizce konuşur → "Durdur".
3. **Sonuç:** 5 ölçüt puanlanır; gerekirse düzeltin, öğretmen notu ekleyin,
   yazdırın/dışa aktarın ve "Kaydet & Bitir".

## Değerlendirme Mantığı

5 kriter iki kaynağı birleştirir:

- **Sesten (akustik):**
  - **Sunum** → konuşma/sessizlik oranı, uzun duraklamalar, hece hızı, sesin
    *anlaşılırlığı* (çok konuşulup az tanınır kelime çıkması düşük puan verir), tonlama
    ve tanıma güven skoru. Büyük ölçüde ses dalgasından, metinden bağımsız.
- **Metinden:** **Uyum** (görev anahtar sözcüklerinin kapsanması + uzunluk),
  **Organizasyon** (cümle sayısı, bağlaç/sıra sözcükleri), **Dil** (dilbilgisi yapısı +
  söz dağarcığı çeşitliliği), **Yaratıcılık** (ifade zenginliği, daha az yaygın sözcükler).

> Gürültü/sessizlikte "gerçek konuşma var mı" kapısı devreye girer (sesli/F0'lı kare
> oranı + hece yapısı + tanınan kelime); konuşma yoksa puanlar sıfırlanır.

Sonuç ekranında ses kaydının yanında akustik ölçümler (konuşma süresi, doluluk oranı,
duraklama, hece/sn, tonlama, ses kararlılığı) ayrıca gösterilir. Ayrıntılı ölçüt
tanımları için `rubric.js`, akustik analiz için `audio.js`.

> **Not:** Bu araç telaffuzu *fonem düzeyinde* "doğru/yanlış" diye ölçen profesyonel bir
> servis değildir; söyleyişin genel kalitesini ve anlaşılırlığını ölçer. Bu yüzden
> öğretmenin kaydı dinleyip her puanı elle düzeltebilmesi tasarımın merkezindedir.

> ⚠️ Bu araç öğretmenin gözlemini **destekleyen** bir ön değerlendirme sunar.
> Nihai not her zaman öğretmenin takdirindedir.

## Dosya Yapısı

| Dosya | İçerik |
|------|--------|
| `index.html` | Arayüz ve adımlar |
| `styles.css` | Görünüm |
| `rubric.js` | 5 ölçüt, başarım düzeyleri ve konuşma görevleri |
| `audio.js` | Gerçek ses (akustik) analizi: duraklama, hız, tonlama, ses kaydı |
| `app.js` | Konuşma tanıma, puanlama motoru, raporlama |
