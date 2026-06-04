# İngilizce Konuşma Becerisi Değerlendirme Uygulaması

**Türkiye Yüzyılı Maarif Modeli (TYMM)** çerçevesine uygun, **9. sınıf**
öğrencilerine yönelik İngilizce konuşma becerisi değerlendirme aracı.
Öğretmenler tarafından sınıfta kullanılmak üzere tasarlanmıştır.

> Öğrenci konuşur → uygulama konuşmayı yazıya döker → **5 ölçüt** üzerinden
> otomatik puanlar → öğretmen düzenler ve raporu kaydeder.

## Özellikler

- 🎙️ **Otomatik konuşma tanıma** — Tarayıcının Web Speech API'si ile öğrencinin
  konuşması canlı olarak metne dökülür. Mikrofon/destek yoksa metin elle girilebilir.
- 📊 **5 ölçütlü değerlendirme** — Her ölçüt 0–100 ham puan ve 1–4 başarım düzeyi olarak gösterilir:
  1. **Akıcılık** (Fluency)
  2. **Telaffuz** (Pronunciation)
  3. **Söz Dağarcığı** (Vocabulary)
  4. **Dilbilgisi** (Grammar / Accuracy)
  5. **İçerik & Görev Başarımı** (Content & Task Achievement)
- ✍️ **Öğretmen denetimi** — Otomatik puanlar bir ön öneridir; öğretmen her ölçütü
  elle düzeltebilir, toplam ve düzey anında güncellenir.
- 📚 **Hazır konuşma görevleri** — TYMM 9. sınıf temalarıyla uyumlu, CEFR A2 düzeyinde
  konuşma promptları (Studying Abroad, My Friends, Human in Nature, Inspirational People vb.).
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

Puanlama, konuşma metni ve süre üzerinden sezgisel (heuristik) ölçümlerle yapılır:
konuşma hızı (sözcük/dk), tür-belirteç oranı (söz çeşitliliği), dolgu sözcükleri,
cümle yapısı işaretleri, görev anahtar sözcüklerinin kapsanması ve konuşma tanıma
güven skoru (telaffuz vekili). Ayrıntılı ölçüt tanımları için `rubric.js`.

> ⚠️ Bu araç öğretmenin gözlemini **destekleyen** bir ön değerlendirme sunar.
> Nihai not her zaman öğretmenin takdirindedir.

## Dosya Yapısı

| Dosya | İçerik |
|------|--------|
| `index.html` | Arayüz ve adımlar |
| `styles.css` | Görünüm |
| `rubric.js` | 5 ölçüt, başarım düzeyleri ve konuşma görevleri |
| `app.js` | Konuşma tanıma, puanlama motoru, raporlama |
