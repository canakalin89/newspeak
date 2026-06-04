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
  söz dağarcığı, dilbilgisi ve içerik bu metinden ölçülür. Mikrofon yoksa metin elle girilebilir.
- 📊 **5 ölçütlü değerlendirme** — Her ölçüt 0–100 ham puan ve 1–4 başarım düzeyi olarak gösterilir:
  1. **Akıcılık** (Fluency)
  2. **Telaffuz** (Pronunciation)
  3. **Söz Dağarcığı** (Vocabulary)
  4. **Dilbilgisi** (Grammar / Accuracy)
  5. **İçerik & Görev Başarımı** (Content & Task Achievement)
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
  - **Akıcılık** → konuşma/sessizlik oranı, uzun duraklamalar, hece hızı (sesin enerji
    zarfından). Tamamen ses dalgasından, metinden bağımsız.
  - **Telaffuz** → sesin *anlaşılırlığı*: çok konuşulup az tanınır kelime çıkması (kötü
    İngilizce) düşük puan verir; ayrıca tonlama (pitch değişimi) ve tanıma güven skoru katkı yapar.
- **Metinden:** **Söz Dağarcığı** (kelime çeşitliliği), **Dilbilgisi** (cümle yapısı),
  **İçerik** (görev anahtar sözcüklerinin kapsanması + uzunluk).

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
