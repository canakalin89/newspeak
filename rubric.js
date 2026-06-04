/*
 * rubric.js
 * Türkiye Yüzyılı Maarif Modeli (TYMM) 9. sınıf İngilizce dersi konuşma becerisi
 * değerlendirme ölçütleri ve görev (tema) havuzu.
 *
 * 9. sınıf hedef düzeyi CEFR A2 olarak alınmıştır. Beş kriter, dört başarım
 * düzeyi (1–4) üzerinden tanımlanmış; her kriter ham puanı 0–100 ölçeğinden
 * düzey bandına ve ağırlıklı toplam puana dönüştürülür.
 */

/* ------------------------------------------------------------------ */
/* 5 DEĞERLENDİRME KRİTERİ                                             */
/* ------------------------------------------------------------------ */
const CRITERIA = [
  {
    id: "fluency",
    name: "Akıcılık",
    en: "Fluency",
    weight: 0.20,
    desc: "Konuşmanın hızı, sürekliliği; gereksiz duraklama ve tekrar olmadan ileti kurabilme.",
    bands: {
      4: "Doğal bir hızda, kesintisiz ve rahat konuşur; duraksamalar iletiyi bozmaz.",
      3: "Genel olarak akıcıdır; ara sıra duraklasa da konuşmayı sürdürür.",
      2: "Sık duraklar ve kendini tekrar eder; konuşma parça parçadır.",
      1: "Çok yavaş ve kopuk; sözcük sözcük ilerler, ileti tamamlanamaz."
    }
  },
  {
    id: "pronunciation",
    name: "Telaffuz",
    en: "Pronunciation",
    weight: 0.20,
    desc: "Sözcüklerin anlaşılır biçimde seslendirilmesi; vurgu ve tonlamanın iletiyi desteklemesi.",
    bands: {
      4: "Telaffuz çok anlaşılır; sözcükler net seslendirilir.",
      3: "Genellikle anlaşılır; küçük telaffuz hataları iletiyi engellemez.",
      2: "Telaffuz hataları zaman zaman anlaşılmayı güçleştirir.",
      1: "Telaffuz büyük ölçüde anlaşılmaz; dinleyici çoğu sözcüğü çözemez."
    }
  },
  {
    id: "vocabulary",
    name: "Söz Dağarcığı",
    en: "Vocabulary",
    weight: 0.20,
    desc: "Konuya uygun, çeşitli ve doğru sözcük kullanımı; tekrara düşmeden ifade zenginliği.",
    bands: {
      4: "Konuya uygun, çeşitli ve yerinde sözcükler kullanır; ifade zengindir.",
      3: "Yeterli sözcük dağarcığıyla iletiyi kurar; ara sıra tekrar eder.",
      2: "Sınırlı ve tekrarlı sözcükler kullanır; ifadeler kısıtlıdır.",
      1: "Çok az sözcükle, dağınık ve konu dışı ifadeler kurar."
    }
  },
  {
    id: "grammar",
    name: "Dilbilgisi",
    en: "Grammar / Accuracy",
    weight: 0.20,
    desc: "Cümle yapısının doğruluğu; uygun zaman ve yapıların hatasız kullanımı.",
    bands: {
      4: "Çeşitli yapıları büyük ölçüde doğru kullanır; hatalar nadirdir.",
      3: "Temel yapıları doğru kurar; bazı hatalar olsa da ileti anlaşılır.",
      2: "Sık dilbilgisi hataları yapar; cümle yapısı zayıftır.",
      1: "Cümle kuramaz; yapı hataları iletiyi anlaşılmaz kılar."
    }
  },
  {
    id: "content",
    name: "İçerik & Görev Başarımı",
    en: "Content & Task Achievement",
    weight: 0.20,
    desc: "Verilen görevin/konunun kapsanması; fikirlerin ilgili, yeterli ve düzenli sunulması.",
    bands: {
      4: "Görevi tam karşılar; konuyu ilgili ve yeterli ayrıntıyla geliştirir.",
      3: "Görevi büyük ölçüde karşılar; konuya uygun birkaç fikir sunar.",
      2: "Görevi kısmen karşılar; fikirler sınırlı veya yüzeyseldir.",
      1: "Görevi karşılamaz; konuyla ilgisiz veya çok yetersizdir."
    }
  }
];

/* ------------------------------------------------------------------ */
/* GENEL BAŞARIM DÜZEYLERİ (toplam puana göre)                        */
/* ------------------------------------------------------------------ */
const BANDS = [
  { min: 85, label: "Çok İyi",     hint: "A2+ düzeyi hedeflerini aşmış." },
  { min: 70, label: "İyi",          hint: "A2 düzeyi hedeflerini büyük ölçüde karşılıyor." },
  { min: 50, label: "Geliştirilebilir", hint: "A2'ye yaklaşıyor; belirli alanlarda desteğe ihtiyaç var." },
  { min: 0,  label: "Destek Gerekli",   hint: "Temel konuşma becerilerinde yoğun desteğe ihtiyaç var." }
];

/* ------------------------------------------------------------------ */
/* KONUŞMA GÖREVLERİ                                                   */
/* 9. sınıf "Waymark" ders kitabı temalarına (THEME 1–8) göre.        */
/* Not: Şu an Theme 1–3 tanımlı; kalan üniteler (4–8) eklenecek.      */
/* ------------------------------------------------------------------ */
const TASKS = [
  {
    id: "theme1-school-life",
    title: "School Life — Countries & Languages",
    theme: "Theme 1: School Life",
    prompt: "Introduce yourself: say where you are from, your nationality and the languages you can speak. Then imagine you are a travel vlogger — which country would you like to visit? Talk about its capital, tourist attractions and what you would do there.",
    level: "CEFR A2",
    seconds: 90,
    keywords: ["from", "nationality", "language", "speak", "country", "capital", "visit", "tourist", "attraction", "travel", "can", "because"],
    hints: [
      "Hello! Let me introduce myself. I am ... from ...",
      "My nationality is ... and I can speak ...",
      "I would like to visit ... Its capital is ...",
      "There I would visit ... / There are famous ... because ..."
    ]
  },
  {
    id: "theme2-classroom-life",
    title: "Classroom Life — Daily & Study Routines",
    theme: "Theme 2: Classroom Life",
    prompt: "Tell us about your daily and study routines on a school day. What do you usually do in the morning, at school and in the evening? Also talk about a classmate or friend you study with and how you help each other.",
    level: "CEFR A2",
    seconds: 90,
    keywords: ["usually", "morning", "school", "evening", "routine", "study", "homework", "friend", "classmate", "every", "after", "before"],
    hints: [
      "On a school day, I usually get up at ...",
      "In the morning / at school / in the evening I ...",
      "I always / usually / sometimes ... before I ...",
      "My classmate ... and I study together. We help each other by ..."
    ]
  },
  {
    id: "theme3-appearance-personality",
    title: "Personal Life — Appearance & Personality",
    theme: "Theme 3: Physical Appearance & Personality",
    prompt: "Describe a person in your family or a close friend. What do they look like (physical appearance and features)? What is their personality like? Use words that show 'how much' (e.g. very, quite, too).",
    level: "CEFR A2",
    seconds: 90,
    keywords: ["look", "tall", "short", "hair", "eyes", "young", "kind", "friendly", "funny", "cheerful", "personality", "very", "quite"],
    hints: [
      "I want to describe my ... He/She is ...",
      "He/She is tall/short with ... hair and ... eyes.",
      "His/Her personality is ... He/She is very/quite ...",
      "What a kind / cheerful person! He/She is too ... to ..."
    ]
  },
  {
    id: "theme4-family-life",
    title: "Family Life — Jobs & Workplaces",
    theme: "Theme 4: Family Life",
    prompt: "Talk about the jobs of two members of your family. What do they do, and where do they work? Describe their work routines and activities. Then imagine your own dream job: what would your work routines and activities be?",
    level: "CEFR A2",
    seconds: 90,
    keywords: ["job", "work", "works", "office", "responsible", "charge", "routine", "activity", "family", "mother", "father", "dream"],
    hints: [
      "My mother/father is a ... She/He works in a/an ...",
      "She/He is responsible for ... / in charge of ...",
      "At work, she/he usually ...",
      "My dream job is ... I would ... every day."
    ]
  },
  {
    id: "theme5-house-neighbourhood",
    title: "Life in the House & Neighbourhood",
    theme: "Theme 5: Life in the House & Neighbourhood",
    prompt: "Give a short talk about your home. What type of house do you live in? Describe the rooms and the furniture in them. What are people usually doing in the house right now?",
    level: "CEFR A2",
    seconds: 90,
    keywords: ["house", "flat", "live", "room", "kitchen", "living", "bedroom", "furniture", "sofa", "table", "there", "doing"],
    hints: [
      "I live in a ... (flat / detached house). Home sweet home!",
      "There is / There are ... in the living room / kitchen.",
      "My favourite room is ... because ...",
      "Right now, my ... is ...-ing in the ..."
    ]
  }
];

/* Tarayıcı global kapsamına aç (modülsüz kullanım) */
window.RUBRIC = { CRITERIA, BANDS, TASKS };
