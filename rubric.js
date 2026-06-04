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
/* KONUŞMA GÖREVLERİ (TYMM 9. sınıf temalarıyla uyumlu)               */
/* ------------------------------------------------------------------ */
const TASKS = [
  {
    id: "studying-abroad",
    title: "Studying Abroad",
    theme: "Theme: Studying Abroad",
    prompt: "Talk about a country where you would like to study. Why do you want to go there? What would you study and how would you feel about living away from home?",
    level: "CEFR A2",
    seconds: 90,
    keywords: ["country", "study", "abroad", "university", "language", "live", "experience", "culture", "because", "would", "future"],
    hints: [
      "I would like to study in ... because ...",
      "I am interested in ... / I would study ...",
      "Living abroad would be ... (exciting / difficult) because ...",
      "It would help me to improve my ..."
    ]
  },
  {
    id: "my-friends",
    title: "My Friends",
    theme: "Theme: My Friends",
    prompt: "Describe your best friend. What is he or she like? What do you usually do together and why do you get along well?",
    level: "CEFR A2",
    seconds: 75,
    keywords: ["friend", "kind", "funny", "helpful", "together", "play", "talk", "because", "share", "trust", "like"],
    hints: [
      "My best friend's name is ... and he/she is ...",
      "We usually ... together.",
      "I like him/her because ...",
      "He/She is good at ..."
    ]
  },
  {
    id: "human-in-nature",
    title: "Human in Nature",
    theme: "Theme: Human in Nature",
    prompt: "How can we protect the environment in daily life? Give examples of what you and your family can do at home and at school.",
    level: "CEFR A2",
    seconds: 90,
    keywords: ["environment", "nature", "protect", "recycle", "water", "energy", "plant", "trees", "waste", "pollution", "should", "save"],
    hints: [
      "We should ... to protect the environment.",
      "At home, my family ...",
      "At school, we can ...",
      "It is important because ..."
    ]
  },
  {
    id: "inspirational-people",
    title: "Inspirational People",
    theme: "Theme: Inspirational People",
    prompt: "Talk about a person who inspires you. Who is he or she? What did this person do, and why do you admire them?",
    level: "CEFR A2",
    seconds: 90,
    keywords: ["inspire", "admire", "person", "famous", "because", "achieved", "success", "hard", "work", "example", "respect"],
    hints: [
      "The person who inspires me is ...",
      "He/She is famous for ...",
      "I admire him/her because ...",
      "I want to be like him/her because ..."
    ]
  },
  {
    id: "hobbies-free-time",
    title: "Hobbies & Free Time",
    theme: "Theme: Hobbies",
    prompt: "What do you like doing in your free time? Describe your favourite hobby, how often you do it and why you enjoy it.",
    level: "CEFR A2",
    seconds: 75,
    keywords: ["free", "time", "hobby", "enjoy", "usually", "weekend", "play", "music", "sport", "read", "because", "fun"],
    hints: [
      "In my free time, I usually ...",
      "My favourite hobby is ... I do it ... (every day / at weekends).",
      "I enjoy it because ...",
      "I started this hobby when ..."
    ]
  },
  {
    id: "future-plans",
    title: "My Future Plans",
    theme: "Theme: Future Jobs",
    prompt: "What do you want to be in the future? Describe the job you dream about and explain why it is the right choice for you.",
    level: "CEFR A2",
    seconds: 90,
    keywords: ["future", "job", "want", "be", "because", "study", "dream", "work", "help", "people", "good", "will"],
    hints: [
      "In the future, I want to be a ...",
      "I would like this job because ...",
      "To do this job, I need to ...",
      "I think I am good at ..."
    ]
  }
];

/* Tarayıcı global kapsamına aç (modülsüz kullanım) */
window.RUBRIC = { CRITERIA, BANDS, TASKS };
