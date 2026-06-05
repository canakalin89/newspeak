/*
 * rubric.js
 * Türkiye Yüzyılı Maarif Modeli (TYMM) 9. sınıf İngilizce dersi konuşma becerisi
 * değerlendirme ölçütleri ve görev (tema) havuzu.
 *
 * 9. sınıf hedef düzeyi CEFR A2 olarak alınmıştır. Beş kriter, dört başarım
 * düzeyi (1–4) üzerinden tanımlanmış; her kriter ham puanı 0–100 ölçeğinden
 * düzey bandına ve ağırlıklı toplam puana dönüştürülür.
 *
 * Konuşma görevleri 9. sınıf "Waymark" ders kitabının 8 temasıyla (THEME 1–8)
 * birebir uyumludur; her temada 3–5 konuşma konusu yer alır.
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
    },
    advice: {
      1: "Kısa kalıplarla başla: \"I like… because…\", \"I think…\". Cevabını söylemeden önce içinden kur, sonra duraklamadan söyle.",
      2: "Konuşmadan önce 3–4 cümle planla. Düşünürken susmak yerine \"well…\", \"let me see…\" gibi köprü ifadeler kullan.",
      3: "Cümleleri and / but / because / so ile birbirine bağla. Cevabını evde sesli kaydedip dinle.",
      4: "Akıcılığın iyi. Doğal vurgu ve duraklamalarla bu seviyeyi koru; daha uzun konuşmalar dene."
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
    },
    advice: {
      1: "Kelimeleri sözlükten dinle (audio) ve yüksek sesle tekrar et. Önce tek tek, net söylemeye çalış.",
      2: "Zorlandığın sesleri ayrı çalış (th, w, v, r). Kısa metinleri sesli oku ve kendini kaydedip dinle.",
      3: "Cümle vurgusuna ve tonlamaya odaklan. Film/şarkı eşliğinde \"shadowing\" (arkasından tekrar) yap.",
      4: "Telaffuzun net. Bağlı konuşmada (linking) ritmi geliştirerek daha doğal bir tını yakalayabilirsin."
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
    },
    advice: {
      1: "Konuyla ilgili 10 temel kelimeyi listele ve her birini bir cümlede kullan.",
      2: "Aynı kelimeyi tekrar etmek yerine eş anlamlılarını öğren (good → nice, great, wonderful).",
      3: "Konuya özel kalıplar ve birkaç deyim ekle. Öğrendiğin yeni kelimeyi kendi cümlende kullan.",
      4: "Söz dağarcığın zengin. Daha az yaygın, konuya özgü kelimelerle ifadeni çeşitlendirebilirsin."
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
    },
    advice: {
      1: "Basit cümle düzenine odaklan: Özne + fiil + nesne. \"I am / He is\" kullanımını pekiştir.",
      2: "Geniş zaman (Simple Present) ile şimdiki zamanı (Present Continuous) ayırt et. Cümlelerini kısa ve doğru tut.",
      3: "Geçmiş zaman ve \"will\" gibi farklı zamanları, and/but/because bağlaçlarını doğru kullan.",
      4: "Dilbilgin sağlam. \"if…\", \"because of…\" gibi daha karmaşık yapılarla zenginleştirebilirsin."
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
    },
    advice: {
      1: "Önce soruyu yanıtladığından emin ol. Konuyla ilgili en az 3 fikir söyle.",
      2: "Her fikrini bir nedenle destekle (\"because…\") ve bir örnek ekle.",
      3: "Cevabını giriş–gelişme–sonuç şeklinde düzenle ve biraz daha ayrıntı ver.",
      4: "İçeriğin güçlü. Kişisel görüş ve örneklerle konuyu daha da derinleştirebilirsin."
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
/* KONUŞMA GÖREVLERİ — Waymark 9. sınıf Theme 1–8 (her temada 3–5 konu)*/
/* ------------------------------------------------------------------ */
const TASKS = [

  /* ===== THEME 1 — SCHOOL LIFE ===== */
  {
    id: "theme1-introduce",
    title: "Introduce Yourself & a Country to Visit",
    theme: "Theme 1: School Life",
    prompt: "Introduce yourself: say where you are from, your nationality and the languages you can speak. Then imagine you are a travel vlogger — which country would you like to visit? Talk about its capital and tourist attractions.",
    level: "CEFR A2", seconds: 90,
    keywords: ["from", "nationality", "language", "speak", "country", "capital", "visit", "tourist", "attraction", "travel", "can", "because"],
    hints: [
      "Hello! Let me introduce myself. I am ... from ...",
      "My nationality is ... and I can speak ...",
      "I would like to visit ... Its capital is ...",
      "There are famous ... because ..."
    ]
  },
  {
    id: "theme1-tourist",
    title: "A Tourist Attraction",
    theme: "Theme 1: School Life",
    prompt: "Talk about a famous tourist attraction or city you would like to visit. Where is it? What can people see and do there?",
    level: "CEFR A2", seconds: 80,
    keywords: ["tourist", "attraction", "city", "visit", "see", "do", "famous", "place", "can", "beautiful", "history", "there"],
    hints: [
      "I would like to visit ... It is in ...",
      "It is famous for its ...",
      "There, people can see / do ...",
      "I want to go there because ..."
    ]
  },
  {
    id: "theme1-languages",
    title: "Languages I Speak & Want to Learn",
    theme: "Theme 1: School Life",
    prompt: "Which languages can you speak? Which language would you like to learn and why? How can speaking a language help you?",
    level: "CEFR A2", seconds: 80,
    keywords: ["language", "speak", "learn", "english", "can", "because", "help", "communicate", "foreign", "useful", "would", "country"],
    hints: [
      "I can speak ... and a little ...",
      "I would like to learn ... because ...",
      "Speaking a language helps me to ...",
      "It is useful when ..."
    ]
  },
  {
    id: "theme1-national-day",
    title: "A National Day or Celebration",
    theme: "Theme 1: School Life",
    prompt: "Describe a national day or a celebration in your country. When is it? How do people celebrate it and why is it important?",
    level: "CEFR A2", seconds: 85,
    keywords: ["national", "day", "celebrate", "celebration", "country", "people", "special", "important", "flag", "holiday", "because", "every"],
    hints: [
      "One important national day is ... It is on ...",
      "On this day, people ...",
      "We celebrate it by ...",
      "It is important because ..."
    ]
  },

  /* ===== THEME 2 — CLASSROOM LIFE ===== */
  {
    id: "theme2-routine",
    title: "My Daily & Study Routines",
    theme: "Theme 2: Classroom Life",
    prompt: "Tell us about your daily and study routines on a school day. What do you usually do in the morning, at school and in the evening?",
    level: "CEFR A2", seconds: 90,
    keywords: ["usually", "morning", "school", "evening", "routine", "study", "homework", "every", "after", "before", "get", "then"],
    hints: [
      "On a school day, I usually get up at ...",
      "In the morning / at school / in the evening I ...",
      "I always / usually / sometimes ...",
      "Before I sleep, I ..."
    ]
  },
  {
    id: "theme2-friend",
    title: "My Classmate / Friend",
    theme: "Theme 2: Classroom Life",
    prompt: "Describe a classmate or a friend at school. What is he or she like? What do you usually do together at school and why do you get along well?",
    level: "CEFR A2", seconds: 80,
    keywords: ["friend", "classmate", "school", "together", "usually", "study", "help", "kind", "funny", "talk", "break", "because"],
    hints: [
      "My friend's name is ... He/She is ...",
      "We usually ... together at school.",
      "We help each other by ...",
      "I like him/her because ..."
    ]
  },
  {
    id: "theme2-study-habits",
    title: "My Study Habits",
    theme: "Theme 2: Classroom Life",
    prompt: "How, when and where do you study? Describe your study habits and give one tip that helps you learn better.",
    level: "CEFR A2", seconds: 80,
    keywords: ["study", "homework", "usually", "evening", "room", "every", "learn", "revise", "focus", "tip", "before", "after"],
    hints: [
      "I usually study in the ... at ...",
      "First I ..., then I ...",
      "To learn better, I ...",
      "My tip is to ..."
    ]
  },
  {
    id: "theme2-school-day",
    title: "A Typical School Day",
    theme: "Theme 2: Classroom Life",
    prompt: "Describe a typical school day from morning to evening. What do you do, and what is your favourite part of the day?",
    level: "CEFR A2", seconds: 85,
    keywords: ["school", "morning", "evening", "lesson", "usually", "break", "lunch", "favourite", "after", "day", "class", "then"],
    hints: [
      "My school day starts at ...",
      "We have lessons like ...",
      "At break / lunch time, I ...",
      "My favourite part is ... because ..."
    ]
  },

  /* ===== THEME 3 — PHYSICAL APPEARANCE & PERSONALITY ===== */
  {
    id: "theme3-describe-person",
    title: "Describe a Family Member or Friend",
    theme: "Theme 3: Physical Appearance & Personality",
    prompt: "Describe a person in your family or a close friend. What do they look like (physical appearance)? What is their personality like? Use words like very, quite, too.",
    level: "CEFR A2", seconds: 85,
    keywords: ["look", "tall", "short", "hair", "eyes", "young", "kind", "friendly", "funny", "cheerful", "personality", "very", "quite"],
    hints: [
      "I want to describe my ... He/She is ...",
      "He/She is tall/short with ... hair and ... eyes.",
      "His/Her personality is ... He/She is very/quite ...",
      "What a kind / cheerful person!"
    ]
  },
  {
    id: "theme3-myself",
    title: "Describing Myself",
    theme: "Theme 3: Physical Appearance & Personality",
    prompt: "Describe yourself. What do you look like, and what is your personality like? What are you good at?",
    level: "CEFR A2", seconds: 80,
    keywords: ["look", "tall", "short", "hair", "eyes", "kind", "friendly", "personality", "very", "good", "quite", "am"],
    hints: [
      "I am ... years old. I am tall/short with ... hair.",
      "My personality is ... I am quite/very ...",
      "I am good at ...",
      "People say I am ..."
    ]
  },
  {
    id: "theme3-famous",
    title: "A Famous Person",
    theme: "Theme 3: Physical Appearance & Personality",
    prompt: "Describe a famous person you like. What does he or she look like, and what kind of person is he or she?",
    level: "CEFR A2", seconds: 80,
    keywords: ["famous", "person", "look", "tall", "hair", "eyes", "kind", "personality", "talented", "very", "because", "character"],
    hints: [
      "The famous person I like is ...",
      "He/She is ... with ... hair.",
      "He/She is very ... and ...",
      "I like him/her because ..."
    ]
  },
  {
    id: "theme3-compare",
    title: "Comparing Two People",
    theme: "Theme 3: Physical Appearance & Personality",
    prompt: "Compare two people you know. How are their appearance and personality similar or different? Use words like taller, more, very, quite.",
    level: "CEFR A2", seconds: 85,
    keywords: ["both", "but", "taller", "than", "more", "while", "appearance", "personality", "very", "quite", "different", "similar"],
    hints: [
      "... and ... are both ...",
      "... is taller than ..., but ...",
      "... is more ... than ...",
      "While ... is ..., ... is ..."
    ]
  },

  /* ===== THEME 4 — FAMILY LIFE ===== */
  {
    id: "theme4-family-jobs",
    title: "My Family's Jobs & Workplaces",
    theme: "Theme 4: Family Life",
    prompt: "Talk about the jobs of two members of your family. What do they do, and where do they work? Describe their work routines and activities.",
    level: "CEFR A2", seconds: 90,
    keywords: ["job", "work", "works", "office", "responsible", "charge", "routine", "activity", "family", "mother", "father", "every"],
    hints: [
      "My mother/father is a ... She/He works in a/an ...",
      "She/He is responsible for ... / in charge of ...",
      "At work, she/he usually ...",
      "My ... also works as a ..."
    ]
  },
  {
    id: "theme4-one-job",
    title: "One Job in Detail",
    theme: "Theme 4: Family Life",
    prompt: "Choose one job and describe it. What does the person do at work? Where do they work, and what are they responsible for?",
    level: "CEFR A2", seconds: 80,
    keywords: ["job", "work", "works", "office", "responsible", "charge", "activity", "where", "people", "every", "duty", "because"],
    hints: [
      "I want to talk about the job of a ...",
      "A ... works in a/an ...",
      "He/She is responsible for ...",
      "Every day, he/she ..."
    ]
  },
  {
    id: "theme4-dream-job",
    title: "My Dream Job",
    theme: "Theme 4: Family Life",
    prompt: "What is your dream job? Describe the work routine and activities you would have, and explain why you would like it.",
    level: "CEFR A2", seconds: 80,
    keywords: ["dream", "job", "work", "would", "because", "every", "help", "office", "routine", "activity", "want", "good"],
    hints: [
      "My dream job is to be a ...",
      "I would work in a/an ...",
      "Every day, I would ...",
      "I would like it because ..."
    ]
  },
  {
    id: "theme4-compare-jobs",
    title: "Comparing Two Jobs",
    theme: "Theme 4: Family Life",
    prompt: "Compare two different jobs. What does each person do and where? Which job would you prefer and why?",
    level: "CEFR A2", seconds: 85,
    keywords: ["job", "work", "both", "but", "prefer", "because", "office", "outside", "people", "while", "different", "than"],
    hints: [
      "A ... and a ... are both ...",
      "A ... works ..., but a ... works ...",
      "I would prefer to be a ...",
      "... because ..."
    ]
  },

  /* ===== THEME 5 — LIFE IN THE HOUSE & NEIGHBOURHOOD ===== */
  {
    id: "theme5-home",
    title: "My Home & Furniture",
    theme: "Theme 5: Life in the House & Neighbourhood",
    prompt: "Give a short talk about your home. What type of house do you live in? Describe the rooms and the furniture in them.",
    level: "CEFR A2", seconds: 85,
    keywords: ["house", "flat", "live", "room", "kitchen", "living", "bedroom", "furniture", "sofa", "table", "there", "is"],
    hints: [
      "I live in a ... (flat / detached house). Home sweet home!",
      "There is / There are ... in the living room.",
      "In the kitchen, there is ...",
      "My house has ... rooms."
    ]
  },
  {
    id: "theme5-favourite-room",
    title: "My Favourite Room",
    theme: "Theme 5: Life in the House & Neighbourhood",
    prompt: "Describe your favourite room at home. What furniture is in it, and what do you usually do there?",
    level: "CEFR A2", seconds: 80,
    keywords: ["room", "favourite", "furniture", "bed", "desk", "sofa", "there", "usually", "because", "relax", "comfortable", "my"],
    hints: [
      "My favourite room is my ...",
      "In my room, there is a ... and a ...",
      "I usually ... there.",
      "I like it because ..."
    ]
  },
  {
    id: "theme5-dream-house",
    title: "My Dream House",
    theme: "Theme 5: Life in the House & Neighbourhood",
    prompt: "Describe your dream house. What type of house is it? How many rooms does it have, and what is special about it?",
    level: "CEFR A2", seconds: 80,
    keywords: ["dream", "house", "type", "rooms", "big", "garden", "would", "there", "special", "modern", "because", "have"],
    hints: [
      "My dream house is a big / modern ...",
      "It would have ... rooms and a ...",
      "There would be ...",
      "It is special because ..."
    ]
  },
  {
    id: "theme5-right-now",
    title: "What Is Happening at Home Now",
    theme: "Theme 5: Life in the House & Neighbourhood",
    prompt: "Describe what the people in your house are doing right now. Use the present continuous tense (is/are + -ing).",
    level: "CEFR A2", seconds: 75,
    keywords: ["now", "doing", "watching", "cooking", "sleeping", "playing", "mother", "father", "is", "are", "while", "reading"],
    hints: [
      "Right now, my mother is ...-ing.",
      "My father is ...-ing in the ...",
      "My brother/sister is ...-ing.",
      "While ... is ...-ing, I am ...-ing."
    ]
  },
  {
    id: "theme5-neighbourhood",
    title: "My Neighbourhood",
    theme: "Theme 5: Life in the House & Neighbourhood",
    prompt: "Describe your neighbourhood. What places are near your home, and what do people usually do there?",
    level: "CEFR A2", seconds: 80,
    keywords: ["neighbourhood", "near", "there", "park", "shop", "street", "people", "live", "place", "quiet", "busy", "usually"],
    hints: [
      "I live in a quiet / busy neighbourhood.",
      "Near my home, there is a ...",
      "People usually ... there.",
      "I like my neighbourhood because ..."
    ]
  },

  /* ===== THEME 6 — LIFE IN THE CITY & COUNTRY ===== */
  {
    id: "theme6-food-festival",
    title: "Food Culture & a Festival",
    theme: "Theme 6: Life in the City & Country",
    prompt: "Talk about food culture in your city or country. Describe a food festival: what happens there and what makes the food special?",
    level: "CEFR A2", seconds: 90,
    keywords: ["food", "eat", "dish", "festival", "city", "country", "delicious", "cook", "traditional", "taste", "special", "people"],
    hints: [
      "In my city/country, people usually eat ...",
      "There is a food festival called ...",
      "At the festival, people ...",
      "The food is special because ..."
    ]
  },
  {
    id: "theme6-favourite-dish",
    title: "My Favourite Dish",
    theme: "Theme 6: Life in the City & Country",
    prompt: "Describe your favourite dish. What is in it, how is it cooked, and why do you like it?",
    level: "CEFR A2", seconds: 80,
    keywords: ["dish", "food", "favourite", "cook", "delicious", "eat", "taste", "because", "made", "ingredients", "traditional", "with"],
    hints: [
      "My favourite dish is ...",
      "It is made with ...",
      "First you ..., then you cook it ...",
      "I like it because it tastes ..."
    ]
  },
  {
    id: "theme6-local-international",
    title: "Local vs International Food",
    theme: "Theme 6: Life in the City & Country",
    prompt: "Talk about a local food in your country and an international food you like. How are they different?",
    level: "CEFR A2", seconds: 85,
    keywords: ["food", "local", "traditional", "international", "country", "eat", "different", "like", "taste", "both", "while", "than"],
    hints: [
      "A traditional food in my country is ...",
      "An international food I like is ...",
      "They are different because ...",
      "I prefer ... because ..."
    ]
  },
  {
    id: "theme6-eating-now",
    title: "Food These Days",
    theme: "Theme 6: Life in the City & Country",
    prompt: "What food do people usually eat in your area, and what are you eating these days? Compare habits using present simple and present continuous.",
    level: "CEFR A2", seconds: 80,
    keywords: ["usually", "eat", "these", "days", "trying", "food", "often", "now", "while", "dish", "generally", "am"],
    hints: [
      "People here usually eat ...",
      "These days, I am eating / trying ...",
      "I generally have ... for breakfast.",
      "While I usually ..., this week I am ..."
    ]
  },

  /* ===== THEME 7 — LIFE IN THE WORLD & NATURE ===== */
  {
    id: "theme7-endangered",
    title: "An Endangered Animal",
    theme: "Theme 7: Life in the World & Nature",
    prompt: "Talk about an endangered animal. What was its habitat like in the past and what is it like now? Why is it in danger? Give advice using should or must.",
    level: "CEFR A2", seconds: 100,
    keywords: ["endangered", "animal", "nature", "habitat", "protect", "danger", "extinct", "should", "must", "help", "past", "hunting"],
    hints: [
      "One endangered animal is the ...",
      "In the past there were ... but now ...",
      "It is in danger because ...",
      "People should / must ... to protect it."
    ]
  },
  {
    id: "theme7-problem",
    title: "An Environmental Problem",
    theme: "Theme 7: Life in the World & Nature",
    prompt: "Describe an environmental problem you know. Why is it serious, and what should people do to solve it?",
    level: "CEFR A2", seconds: 90,
    keywords: ["problem", "environment", "pollution", "serious", "should", "must", "solve", "help", "nature", "because", "protect", "waste"],
    hints: [
      "A big environmental problem is ...",
      "It is serious because ...",
      "To solve it, people should ...",
      "We must ... Every little bit helps!"
    ]
  },
  {
    id: "theme7-campaign",
    title: "A Campaign to Save an Animal",
    theme: "Theme 7: Life in the World & Nature",
    prompt: "Imagine a campaign to save an endangered animal. What is the animal, why does it need help, and what must people do?",
    level: "CEFR A2", seconds: 90,
    keywords: ["campaign", "save", "animal", "endangered", "help", "must", "should", "protect", "danger", "support", "because", "spread"],
    hints: [
      "Our campaign is to save the ...",
      "This animal needs help because ...",
      "People must / should ...",
      "Please support us and spread the word!"
    ]
  },
  {
    id: "theme7-habitat",
    title: "An Animal and Its Habitat",
    theme: "Theme 7: Life in the World & Nature",
    prompt: "Describe an animal and its natural habitat. What did its habitat use to be like, and what threats does it face now?",
    level: "CEFR A2", seconds: 90,
    keywords: ["animal", "habitat", "nature", "live", "used", "past", "threat", "danger", "now", "hunting", "forest", "because"],
    hints: [
      "The ... lives in ...",
      "Its habitat used to be ...",
      "Now it faces threats like ...",
      "This happens because ..."
    ]
  },

  /* ===== THEME 8 — LIFE IN THE UNIVERSE & FUTURE ===== */
  {
    id: "theme8-genre-future",
    title: "Film Genres & the Future",
    theme: "Theme 8: Life in the Universe & Future",
    prompt: "Talk about your favourite type of film (genre). What usually happens in this kind of film? Then make predictions: how will technology and life change in the future?",
    level: "CEFR A2", seconds: 100,
    keywords: ["film", "genre", "comedy", "action", "science", "future", "will", "technology", "robot", "think", "believe", "predict"],
    hints: [
      "My favourite film genre is ...",
      "In these films, there is usually ...",
      "I think / believe that in the future, technology will ...",
      "In the future, people will ..."
    ]
  },
  {
    id: "theme8-a-film",
    title: "A Film I Watched",
    theme: "Theme 8: Life in the Universe & Future",
    prompt: "Describe a film you have watched. What genre is it, what happens in it, and did you like it?",
    level: "CEFR A2", seconds: 85,
    keywords: ["film", "watched", "genre", "story", "happens", "character", "action", "end", "like", "because", "scene", "about"],
    hints: [
      "I watched a ... film called ...",
      "It is about ...",
      "In the film, the characters ...",
      "I liked / didn't like it because ..."
    ]
  },
  {
    id: "theme8-future-tech",
    title: "Future Technology",
    theme: "Theme 8: Life in the Universe & Future",
    prompt: "Make predictions about technology in the future. How will robots, phones or transport change our lives?",
    level: "CEFR A2", seconds: 85,
    keywords: ["future", "technology", "will", "robot", "phone", "transport", "change", "think", "believe", "life", "maybe", "because"],
    hints: [
      "In the future, technology will ...",
      "I think robots will ...",
      "Maybe transport / phones will ...",
      "This will change our lives because ..."
    ]
  },
  {
    id: "theme8-futuristic-film",
    title: "A Futuristic Film Idea",
    theme: "Theme 8: Life in the Universe & Future",
    prompt: "Imagine you create a futuristic film. What happens in it, where does it take place, and what futuristic ideas does it include?",
    level: "CEFR A2", seconds: 90,
    keywords: ["futuristic", "film", "future", "will", "space", "robot", "idea", "story", "world", "technology", "imagine", "because"],
    hints: [
      "My futuristic film takes place in ...",
      "In the story, ...",
      "It includes futuristic ideas like ...",
      "I think people will like it because ..."
    ]
  }
];

/* Tarayıcı global kapsamına aç (modülsüz kullanım) */
window.RUBRIC = { CRITERIA, BANDS, TASKS };
