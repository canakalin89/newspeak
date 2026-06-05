/*
 * app.js — Uygulama mantığı
 * - Web Speech API ile canlı konuşma → metin
 * - 5 kriter üzerinden otomatik puanlama (sezgisel/heuristik analiz)
 * - Öğretmenin puanları elle düzeltebilmesi
 * - Rapor: yazdırma, JSON dışa aktarma, oturum geçmişi (localStorage)
 */
(function () {
  "use strict";

  const { CRITERIA, BANDS, TASKS } = window.RUBRIC;

  /* ----------------------------- DOM kısayolları ----------------------------- */
  const $ = (id) => document.getElementById(id);
  const steps = {
    setup: $("setupStep"),
    record: $("recordStep"),
    result: $("resultStep")
  };

  /* ----------------------------- Durum (state) ------------------------------- */
  const state = {
    task: TASKS[0],
    recording: false,
    startTime: 0,
    elapsedMs: 0,        // konuşma süresi (analizde kullanılır)
    timerInt: null,
    recognizer: null,
    finalText: "",       // tanıma tarafından kesinleşmiş metin
    confidences: [],     // tanıma güven skorları (telaffuz vekili)
    audio: null,         // AudioAnalyzer örneği (akustik ses analizi)
    acoustic: null,      // ses dalgasından çıkarılan ölçümler
    audioBlob: null,     // ses kaydı (öğretmenin dinlemesi için)
    audioUrl: null,
    vizRAF: null,        // canlı ses görselleştirici animasyon kimliği
    scores: null,        // hesaplanan { criterionId: {raw, band, ...} }
    history: loadHistory(),
    mode: "single",      // "single" | "exam"
    view: "single",      // aktif sekme
    classes: loadClasses(),
    currentClassId: null,
    exam: null           // { classId, className, task, whisper, results: {studentId: rec} }
  };

  /* ============================================================ */
  /* HAZIRLIK ADIMI                                               */
  /* ============================================================ */
  function initSetup() {
    const sel = $("taskSelect");
    // Görevleri temalarına göre <optgroup> içinde grupla (her temada 3–5 konu)
    const order = [];
    const byTheme = new Map();
    TASKS.forEach((t) => {
      if (!byTheme.has(t.theme)) { byTheme.set(t.theme, []); order.push(t.theme); }
      byTheme.get(t.theme).push(t);
    });
    sel.innerHTML = order.map((th) =>
      `<optgroup label="${escapeHtml(th)}">` +
      byTheme.get(th).map((t) => `<option value="${t.id}">${escapeHtml(t.title)}</option>`).join("") +
      `</optgroup>`
    ).join("");
    sel.addEventListener("change", () => {
      state.task = TASKS.find((t) => t.id === sel.value) || TASKS[0];
      renderTaskCard();
    });
    renderTaskCard();

    // Tarayıcı uyarısı: Chromium dışı tarayıcıda güçlendir
    const isChromium = /Chrome|Chromium|Edg/.test(navigator.userAgent) && !!window.chrome;
    if (!isChromium) {
      const bn = $("browserNote");
      if (bn) {
        bn.classList.add("warn");
        bn.innerHTML = "<strong>Dikkat:</strong> Şu an Chrome/Edge dışı bir tarayıcı kullanıyor olabilirsiniz. " +
          "Otomatik konuşma tanıma, ses analizi ve Whisper düzgün çalışmayabilir. Lütfen " +
          "<strong>Google Chrome</strong> veya <strong>Microsoft Edge</strong> ile açın.";
      }
    }

    // Web Speech API desteği kontrolü
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      const note = $("speechSupport");
      note.hidden = false;
      note.textContent =
        "Bu tarayıcı otomatik konuşma tanımayı desteklemiyor (Chrome/Edge gerekir). " +
        "Kayıt sırasında öğrencinin söylediklerini metin alanına elle yazarak yine de değerlendirme yapabilirsiniz.";
    }

    // Ad-soyad ve sınıf isteğe bağlıdır; doğrudan kayıt adımına geçilir.
    $("goToRecordBtn").addEventListener("click", goToRecord);
  }

  function renderTaskCard() {
    const t = state.task;
    $("taskTitle").textContent = t.title;
    $("taskPrompt").textContent = t.prompt;
    $("taskLevel").textContent = t.level;
    $("taskDuration").textContent = `Önerilen süre: ~${Math.round(t.seconds / 60 * 10) / 10} dk`;
    $("taskHints").innerHTML = t.hints.map((h) => `<li>${escapeHtml(h)}</li>`).join("");
  }

  /* ============================================================ */
  /* KAYIT ADIMI                                                  */
  /* ============================================================ */
  function goToRecord() {
    // Tekli modda Whisper seçeneği setup'taki checkbox'tan; sınav modunda state'ten gelir
    if (state.mode !== "exam") {
      state.useWhisper = !!($("useWhisper") && $("useWhisper").checked);
    }
    const ws = $("whisperStatus");
    if (state.useWhisper) {
      preloadWhisper();              // modeli arka planda erkenden indirmeye başla
    } else if (ws) {
      ws.hidden = true;
    }
    showFlow("record");
    $("recordTaskTitle").textContent = state.task.title;
    $("recordTaskPrompt").textContent = state.task.prompt;
    resetRecording();
  }

  function resetRecording() {
    stopRecognition();
    stopVisualizer();
    state.recording = false;
    state.elapsedMs = 0;
    state.finalText = "";
    state.confidences = [];
    state.acoustic = null;
    if (state.audioUrl) { URL.revokeObjectURL(state.audioUrl); state.audioUrl = null; }
    state.audioBlob = null;
    $("transcript").value = "";
    $("recTimer").textContent = "00:00";
    $("recStatusText").textContent = "Hazır";
    $("recDot").classList.remove("active");
    $("startBtn").disabled = false;
    $("stopBtn").disabled = true;
  }

  async function startRecording() {
    // Akustik ses analizini başlat (mikrofon erişimi burada istenir)
    state.acoustic = null;
    state.audio = window.AudioAnalyzer ? window.AudioAnalyzer.create() : null;
    if (state.audio) {
      try {
        await state.audio.start();
      } catch (err) {
        state.audio = null;
        $("recStatusText").textContent = "Mikrofona erişilemedi — sesi elle değerlendirin.";
        return;
      }
    }

    state.recording = true;
    state.startTime = Date.now();
    $("startBtn").disabled = true;
    $("stopBtn").disabled = false;
    $("recDot").classList.add("active");
    $("recStatusText").textContent = "Kaydediliyor…";

    // Süre sayacı
    state.timerInt = setInterval(() => {
      const ms = Date.now() - state.startTime;
      $("recTimer").textContent = formatTime(ms);
    }, 250);

    startVisualizer();
    startRecognition();
  }

  async function stopRecording() {
    if (!state.recording) return;
    state.recording = false;
    state.elapsedMs = Date.now() - state.startTime;
    clearInterval(state.timerInt);
    stopVisualizer();          // analiz bağlamı kapanmadan önce çizimi durdur
    stopRecognition();
    $("startBtn").disabled = false;
    $("stopBtn").disabled = true;
    $("recDot").classList.remove("active");
    $("recStatusText").textContent = "Ses çözümleniyor…";

    // Akustik analizi sonlandır ve ölçümleri + ses kaydını al
    if (state.audio) {
      try {
        const result = await state.audio.stop();
        state.acoustic = result.metrics;
        if (result.audioBlob) {
          state.audioBlob = result.audioBlob;
          state.audioUrl = URL.createObjectURL(result.audioBlob);
        }
      } catch (_) { /* yoksay */ }
      state.audio = null;
    }
    $("recStatusText").textContent = `Tamamlandı · ${formatTime(state.elapsedMs)}`;
  }

  function startRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return; // desteklenmiyorsa elle giriş
    const rec = new SR();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    state.recognizer = rec;

    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          state.finalText += res[0].transcript + " ";
          if (typeof res[0].confidence === "number" && res[0].confidence > 0) {
            state.confidences.push(res[0].confidence);
          }
        } else {
          interim += res[0].transcript;
        }
      }
      $("transcript").value = (state.finalText + interim).replace(/\s+/g, " ").trimStart();
    };

    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        $("recStatusText").textContent = "Mikrofon izni verilmedi — metni elle girebilirsiniz.";
      }
    };

    // continuous mod bazı tarayıcılarda kendini durdurur; kayıt sürerken tekrar başlat
    rec.onend = () => {
      if (state.recording) {
        try { rec.start(); } catch (_) { /* zaten çalışıyor olabilir */ }
      }
    };

    try { rec.start(); } catch (_) { /* yoksay */ }
  }

  function stopRecognition() {
    if (state.recognizer) {
      try { state.recognizer.onend = null; state.recognizer.stop(); } catch (_) {}
      state.recognizer = null;
    }
  }

  /* ============================================================ */
  /* WHISPER — ücretsiz, tarayıcıda daha doğru yazıya dökme       */
  /* (OpenAI Whisper, transformers.js / ONNX-WASM ile)            */
  /* ============================================================ */
  const WHISPER_MODEL = "Xenova/whisper-base.en"; // İngilizce, dengeli boyut/doğruluk
  let _whisperPipe = null, _whisperLoading = null;
  const _wFiles = {}; // dosya bazında indirme ilerlemesi

  function setWhisperUI(pct, text, cls) {
    const box = $("whisperStatus");
    if (!box) return;
    box.hidden = false;
    box.classList.remove("ready", "error");
    if (cls) box.classList.add(cls);
    const bar = $("whisperBar");
    if (bar && pct != null) bar.style.width = clamp(pct, 0, 100) + "%";
    const t = $("whisperStatusText");
    if (t && text != null) t.textContent = text;
  }

  function preloadWhisper() {
    setWhisperUI(0, "hazırlanıyor…");
    getWhisper()
      .then(() => setWhisperUI(100, "hazır ✓", "ready"))
      .catch(() => setWhisperUI(100, "indirilemedi — tarayıcı tanıma kullanılacak", "error"));
  }

  // transformers.js'i birden çok CDN'den dene (biri engelliyse diğeri)
  async function importTransformers() {
    const cdns = [
      "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2",
      "https://esm.sh/@xenova/transformers@2.17.2",
      "https://unpkg.com/@xenova/transformers@2.17.2"
    ];
    let lastErr;
    for (const url of cdns) {
      try { return await import(/* @vite-ignore */ url); }
      catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("transformers.js yüklenemedi");
  }

  function getWhisper() {
    if (_whisperPipe) return Promise.resolve(_whisperPipe);
    if (!_whisperLoading) {
      _whisperLoading = (async () => {
        const mod = await importTransformers();
        mod.env.allowLocalModels = false;            // modeli Hugging Face CDN'inden al
        const pipe = await mod.pipeline("automatic-speech-recognition", WHISPER_MODEL, {
          quantized: true,
          progress_callback: (p) => {
            if (!p || !p.file) return;
            if (p.total) _wFiles[p.file] = { loaded: p.loaded || 0, total: p.total };
            let L = 0, T = 0;
            for (const k in _wFiles) { L += _wFiles[k].loaded; T += _wFiles[k].total; }
            const pct = T ? (L / T) * 100 : 0;
            if (pct < 100) setWhisperUI(pct, `indiriliyor… %${Math.round(pct)}`);
          }
        });
        _whisperPipe = pipe;
        setWhisperUI(100, "hazır ✓", "ready");
        return pipe;
      })();
    }
    return _whisperLoading;
  }

  async function transcribeWithWhisper(blob) {
    $("recStatusText").textContent = "Whisper modeli hazırlanıyor…";
    const pipe = await getWhisper();
    $("recStatusText").textContent = "Ses çözümleniyor (Whisper)…";
    const pcm = await blobToMono16k(blob);
    const out = await pipe(pcm, { chunk_length_s: 30, stride_length_s: 5 });
    return (out && out.text ? out.text : "").replace(/\s+/g, " ").trim();
  }

  // Ses kaydını (webm/opus) 16 kHz mono Float32'ye çöz — Whisper bunu bekler
  async function blobToMono16k(blob) {
    const buf = await blob.arrayBuffer();
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const decoded = await ctx.decodeAudioData(buf);
    try { ctx.close(); } catch (_) {}
    const ch = decoded.numberOfChannels, len = decoded.length;
    let data = decoded.getChannelData(0);
    if (ch > 1) {
      const mix = new Float32Array(len);
      for (let c = 0; c < ch; c++) {
        const d = decoded.getChannelData(c);
        for (let i = 0; i < len; i++) mix[i] += d[i] / ch;
      }
      data = mix;
    }
    if (decoded.sampleRate === 16000) return data;
    const ratio = 16000 / decoded.sampleRate;
    const outLen = Math.round(len * ratio);
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const t = i / ratio, i0 = Math.floor(t), i1 = Math.min(i0 + 1, len - 1);
      const f = t - i0;
      out[i] = data[i0] * (1 - f) + data[i1] * f;
    }
    return out;
  }

  /* ============================================================ */
  /* CANLI SES GÖRSELLEŞTİRİCİ (frekans çubukları)               */
  /* ============================================================ */
  function sizeCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 600, h = canvas.clientHeight || 60;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    return canvas.getContext("2d");
  }

  function startVisualizer() {
    const canvas = $("visualizer");
    if (!canvas || !state.audio || !state.audio.getAnalyser) return;
    const analyser = state.audio.getAnalyser();
    if (!analyser) return;
    const ctx = sizeCanvas(canvas);
    state._vizResize = () => sizeCanvas(canvas);
    window.addEventListener("resize", state._vizResize);

    const bins = new Uint8Array(analyser.frequencyBinCount);
    const BARS = 56;
    const accent = (getComputedStyle(document.documentElement).getPropertyValue("--accent") || "#1f5132").trim();
    const dpr = window.devicePixelRatio || 1;

    const draw = () => {
      state.vizRAF = requestAnimationFrame(draw);
      let data;
      try { analyser.getByteFrequencyData(bins); data = bins; } catch (_) { return; }
      const w = canvas.width, h = canvas.height, mid = h / 2;
      ctx.clearRect(0, 0, w, h);
      const used = Math.floor(data.length * 0.42); // konuşma/ses bandı
      const gap = 2 * dpr;
      const bw = (w - (BARS - 1) * gap) / BARS;
      for (let i = 0; i < BARS; i++) {
        // logaritmik dağılım: düşük frekanslara daha çok çözünürlük
        const s = Math.floor(Math.pow(i / BARS, 1.5) * used);
        const e = Math.max(s + 1, Math.floor(Math.pow((i + 1) / BARS, 1.5) * used));
        let sum = 0, n = 0;
        for (let j = s; j < e && j < data.length; j++) { sum += data[j]; n++; }
        const v = (n ? sum / n : 0) / 255;
        const bh = Math.max(v * (h * 0.9), 2 * dpr);
        const x = i * (bw + gap);
        roundBar(ctx, x, mid - bh / 2, bw, bh, Math.min(bw / 2, 3 * dpr));
        ctx.fillStyle = rgbaFromHex(accent, 0.32 + 0.68 * v);
        ctx.fill();
      }
    };
    draw();
  }

  function stopVisualizer() {
    if (state.vizRAF) { cancelAnimationFrame(state.vizRAF); state.vizRAF = null; }
    if (state._vizResize) { window.removeEventListener("resize", state._vizResize); state._vizResize = null; }
    const canvas = $("visualizer");
    if (canvas && canvas.getContext) drawIdleBaseline(canvas);
  }

  // Kayıt yokken sönük bir taban çizgisi göster
  function drawIdleBaseline(canvas) {
    const ctx = sizeCanvas(canvas);
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width, h = canvas.height, mid = h / 2;
    ctx.clearRect(0, 0, w, h);
    const BARS = 56, gap = 2 * dpr, bw = (w - (BARS - 1) * gap) / BARS;
    ctx.fillStyle = rgbaFromHex("#1f5132", 0.14);
    for (let i = 0; i < BARS; i++) {
      const x = i * (bw + gap), bh = 2 * dpr;
      roundBar(ctx, x, mid - bh / 2, bw, bh, 1 * dpr);
      ctx.fill();
    }
  }

  function roundBar(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function rgbaFromHex(hex, a) {
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    const r = parseInt(hex.substr(0, 2), 16) || 31;
    const g = parseInt(hex.substr(2, 2), 16) || 81;
    const b = parseInt(hex.substr(4, 2), 16) || 50;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  /* ============================================================ */
  /* PUANLAMA MOTORU                                              */
  /* ============================================================ */

  // Çok sık görülen "temel" sözcükler (söz dağarcığı çeşitliliği ölçümünde
  // ileri sözcükleri ayırmak için). Kısa ve genel bir liste yeterli.
  const STOPWORDS = new Set("a an the and or but so to of in on at it is am are was were be been being i you he she we they me him her us them my your his our their this that these those for with as do does did have has had will would can could should may might not no yes very really just like".split(" "));
  const FILLERS = ["uh", "um", "er", "erm", "hmm", "like", "you know", "i mean", "well"];

  function tokenize(text) {
    return (text.toLowerCase().match(/[a-z']+/g) || []);
  }

  function analyze(text) {
    const clean = text.trim().replace(/\s+/g, " ");
    const words = tokenize(clean);
    const wordCount = words.length;

    // Cümle bölme (STT noktalama koymayabilir; yine de en iyi gayretle)
    const sentences = clean.split(/[.!?]+|\n/).map((s) => s.trim()).filter(Boolean);
    const sentenceCount = Math.max(sentences.length, wordCount > 0 ? 1 : 0);
    const avgSentLen = sentenceCount ? wordCount / sentenceCount : 0;

    const uniqueWords = new Set(words);
    const ttr = wordCount ? uniqueWords.size / wordCount : 0;           // tür-belirteç oranı
    const contentWords = [...uniqueWords].filter((w) => !STOPWORDS.has(w) && w.length > 2);
    const advancedWords = contentWords.filter((w) => w.length >= 7).length;
    const structureSignals = countStructureSignals(clean);             // bağlaç/zaman çeşitliliği
    const fillerCount = countFillers(clean);

    const ac = state.acoustic;                                          // akustik ses ölçümleri (varsa)
    const speechSec = ac && ac.speechSec ? ac.speechSec : Math.max(state.elapsedMs / 1000, wordCount / 2.2);
    const wps = speechSec > 0 ? wordCount / speechSec : 0;              // tanınan kelime / konuşma sn
    const wpm = Math.round(wps * 60);

    const kw = state.task.keywords || [];
    const hits = kw.filter((k) => uniqueWords.has(k.toLowerCase())).length;
    const coverage = kw.length ? hits / kw.length : 0;

    // ---- konuşma varlığı kapısı (gürültü/sessizlik ayrımı) ----
    const intelligibleContent = clamp(wordCount / 8, 0, 1);            // metin ölçütleri için (0 kelime => 0)
    let presence = 1;                                                  // akustik ölçütler için
    if (ac) {
      const vr = clamp((ac.voicedRatio || 0) / 0.20, 0, 1);            // sesli (F0'lı) kare oranı
      const syl = clamp((ac.syllables || 0) / 10, 0, 1);              // hece yapısı
      presence = Math.max(Math.min(vr, syl), clamp(wordCount / 5, 0, 1));
    }

    // ===== 1) UYUM — göreve/konuya uygunluk =====
    const lengthPresence = map(wordCount, 8, 60, 35, 100);
    let uyum = clamp(coverage * 100 * 0.6 + lengthPresence * 0.4, 0, 100);
    uyum *= intelligibleContent;

    // ===== 2) ORGANİZASYON — düzen, bağlaçlar, giriş-gelişme-sonuç =====
    let organizasyon = clamp(
      map(sentenceCount, 1, 5, 40, 85) * 0.5 +
      map(structureSignals, 1, 7, 40, 95) * 0.5,
      0, 100
    );
    if (avgSentLen > 22) organizasyon -= 12;                           // bölünememiş, kontrolsüz akış
    organizasyon = clamp(organizasyon, 0, 100) * intelligibleContent;

    // ===== 3) SUNUM — akıcılık + telaffuz/anlaşılırlık (GERÇEK SES) =====
    let sunum;
    if (ac) {
      const intelligibility = clamp(map(wps, 0.3, 1.8, 20, 100), 0, 100);
      const confScore = state.confidences.length
        ? clamp(map(avg(state.confidences), 0.55, 0.92, 40, 100), 0, 100) : 60;
      sunum = ac.fluencyScore * 0.40 + intelligibility * 0.25 + confScore * 0.18
        + ac.intonationScore * 0.09 + ac.deliveryScore * 0.08;
      sunum -= Math.min(fillerCount * 3, 15);
      if (ac.speechSec >= 6 && wordCount < 5) sunum = Math.min(sunum, 30); // bol ses, anlaşılır kelime yok
    } else {
      // Ses analizi yoksa (elle giriş) metinden tahmin
      sunum = clamp(map(wpm, 40, 110, 35, 95), 0, 100) - Math.min(fillerCount * 4, 25);
    }
    sunum = clamp(sunum, 0, 100) * presence;

    // ===== 4) DİL — dilbilgisi + söz dağarcığı =====
    let grammarScore = clamp(map(avgSentLen, 3, 9, 45, 90) + Math.min(structureSignals * 3, 15), 0, 100);
    if (avgSentLen > 22) grammarScore -= 15;
    const vocabScore = clamp(
      map(ttr, 0.35, 0.7, 40, 95) * 0.5 + map(contentWords.length, 4, 30, 40, 100) * 0.5, 0, 100
    );
    let dil = clamp(grammarScore * 0.5 + vocabScore * 0.5, 0, 100);
    dil *= intelligibleContent;

    // ===== 5) YARATICILIK — özgünlük, ifade zenginliği (sezgisel) =====
    let yaraticilik = clamp(
      map(ttr, 0.4, 0.75, 35, 90) * 0.4 +
      map(advancedWords, 1, 8, 40, 95) * 0.3 +
      map(contentWords.length, 5, 25, 40, 95) * 0.3,
      0, 100
    );
    yaraticilik *= intelligibleContent;
    yaraticilik = Math.min(yaraticilik, 88);                           // öznel ölçüt: tavan törpülenir, öğretmen artırır

    // Gerçek konuşma yok (gürültü/sessizlik) => açıkça sıfır
    const noSpeech = (wordCount === 0) && (!ac || presence < 0.15);
    if (noSpeech) { uyum = organizasyon = sunum = dil = yaraticilik = 0; }

    const raw = {
      uyum: Math.round(clamp(uyum, 0, 100)),
      organizasyon: Math.round(clamp(organizasyon, 0, 100)),
      sunum: Math.round(clamp(sunum, 0, 100)),
      dil: Math.round(clamp(dil, 0, 100)),
      yaraticilik: Math.round(clamp(yaraticilik, 0, 100))
    };

    return {
      raw,
      metrics: {
        wordCount, wpm, sentenceCount, ttr: round2(ttr), fillerCount,
        keywordHits: hits, keywordTotal: kw.length,
        wordsPerSpeechSec: round2(wps),
        presence: round2(presence),
        noSpeech: noSpeech,
        acoustic: ac || null
      }
    };
  }

  /* puanlama yardımcıları */
  function countFillers(text) {
    const t = " " + text.toLowerCase() + " ";
    let n = 0;
    FILLERS.forEach((f) => {
      const re = new RegExp("\\b" + f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g");
      n += (t.match(re) || []).length;
    });
    return n;
  }
  function countImmediateRepeats(words) {
    let n = 0;
    for (let i = 1; i < words.length; i++) if (words[i] === words[i - 1]) n++;
    return n;
  }
  function countStructureSignals(text) {
    // farklı zaman/yapı işaretleri çeşitliliği
    const t = " " + text.toLowerCase() + " ";
    const patterns = [/\b\w+ed\b/, /\b\w+ing\b/, /\bwill\b/, /\bwould\b/, /\bbecause\b/, /\bif\b/, /\bwhen\b/, /\bbut\b/, /\band\b/, /\bto \w+/];
    return patterns.reduce((c, p) => c + (p.test(t) ? 1 : 0), 0);
  }

  /* ham puanı (0-100) → düzey bandı (1-4) */
  function toBand(raw) {
    if (raw >= 85) return 4;
    if (raw >= 65) return 3;
    if (raw >= 45) return 2;
    return 1;
  }

  function computeTotal(rawByCriterion) {
    let total = 0;
    CRITERIA.forEach((c) => { total += (rawByCriterion[c.id] || 0) * c.weight; });
    return Math.round(total);
  }

  function totalBand(score) {
    return BANDS.find((b) => score >= b.min) || BANDS[BANDS.length - 1];
  }

  /* ============================================================ */
  /* SONUÇ ADIMI                                                  */
  /* ============================================================ */
  function runEvaluation() {
    const text = $("transcript").value.trim();
    // Metin yoksa bile akustik ses verisi varsa değerlendirme yapılabilir
    // (öğrenci konuştu ama anlaşılır kelime çıkmadıysa: bu da bir sonuçtur).
    if (text.length < 2 && !state.acoustic) {
      $("transcript").focus();
      $("transcript").classList.add("invalid");
      toast("Değerlendirme için ses kaydı veya metin gerekli.");
      return;
    }
    const { raw, metrics } = analyze(text);
    state.scores = {};
    CRITERIA.forEach((c) => {
      state.scores[c.id] = { raw: raw[c.id], band: toBand(raw[c.id]) };
    });
    state.metrics = metrics;
    state.transcriptText = text;
    renderResult();
    showFlow("result");
  }

  function renderResult() {
    $("resStudent").textContent = $("studentName").value.trim() || "—";
    $("resClass").textContent = $("studentClass").value.trim() || "—";
    $("resTask").textContent = `${state.task.title} · ${state.task.theme}`;

    renderAudioPanel();

    const list = $("criteriaList");
    list.innerHTML = "";
    CRITERIA.forEach((c) => {
      const s = state.scores[c.id];
      const row = document.createElement("div");
      row.className = "criterion";
      row.innerHTML = `
        <div class="criterion-head">
          <div>
            <strong>${c.name}</strong> <span class="crit-en">${c.en}</span>
            <p class="crit-desc">${c.desc}</p>
          </div>
          <div class="crit-score">
            <span class="band-pill band-${s.band}">Düzey ${s.band}/4</span>
            <input type="number" min="0" max="100" value="${s.raw}" class="raw-input" data-crit="${c.id}" aria-label="${c.name} puanı" />
          </div>
        </div>
        <div class="meter"><div class="meter-fill band-${s.band}" style="width:${s.raw}%"></div></div>
        <p class="band-desc">${c.bands[s.band]}</p>
      `;
      list.appendChild(row);
    });

    // öğretmen elle puan düzeltebilir
    list.querySelectorAll(".raw-input").forEach((inp) => {
      inp.addEventListener("input", () => {
        let v = clamp(parseInt(inp.value, 10) || 0, 0, 100);
        const cid = inp.dataset.crit;
        state.scores[cid] = { raw: v, band: toBand(v) };
        refreshScoreVisualsFor(cid, inp);
        updateTotals();
      });
    });

    updateTotals();
  }

  // Ses oynatıcı + akustik ölçüm rozetleri
  function renderAudioPanel() {
    const panel = $("audioPanel");
    const ac = state.acoustic;
    const player = $("audioPlayer");
    if (state.audioUrl) {
      player.src = state.audioUrl;
      player.hidden = false;
      $("downloadAudioBtn").hidden = false;
    } else {
      player.hidden = true;
      $("downloadAudioBtn").hidden = true;
    }
    const chips = $("acousticChips");
    if (ac) {
      const items = [
        ["Konuşma süresi", `${ac.speechSec} sn / ${ac.totalSec} sn`],
        ["Konuşma oranı", `%${Math.round(ac.speechRatio * 100)}`],
        ["Duraklama", `${ac.pauseCount} (uzun: ${ac.longPauseCount})`],
        ["Konuşma hızı", `${ac.articulationRate} hece/sn`],
        ["Tonlama değişimi", `${ac.pitchVarSemitones} yarım ton`],
        ["Ses kararlılığı", `%${Math.round(ac.loudnessStability * 100)}`]
      ];
      chips.innerHTML = items.map(([k, v]) => `<span class="achip"><b>${v}</b>${k}</span>`).join("");
    } else {
      chips.innerHTML = `<span class="achip achip-warn">Akustik ölçüm yok — ses kaydı yapılmadı (metinden değerlendirildi).</span>`;
    }
    panel.hidden = !ac && !state.audioUrl;
  }

  // Tek sayfalık yazdırma/PDF raporunu oluştur (güncel puan ve notları yansıtır)
  function buildPrintReport() {
    const total = state.total != null ? state.total : 0;
    const band = totalBand(total);
    const name = $("studentName").value.trim() || "—";
    const cls = $("studentClass").value.trim() || "—";
    const note = $("teacherNote").value.trim();
    const date = new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });

    const rows = CRITERIA.map((c) => {
      const s = state.scores[c.id];
      return `
        <tr>
          <td class="prc-name">${c.name}<small>${c.en}</small></td>
          <td class="prc-score"><span class="prc-band b${s.band}">${s.raw}</span></td>
          <td class="prc-level">Düzey ${s.band}/4</td>
          <td class="prc-advice"><span class="prc-state">${escapeHtml(c.bands[s.band])}</span> ${escapeHtml(c.advice[s.band])}</td>
        </tr>`;
    }).join("");

    const ac = state.metrics && state.metrics.acoustic;
    const acLine = ac
      ? `Konuşma süresi ${ac.speechSec} sn · doluluk %${Math.round(ac.speechRatio * 100)} · ${ac.pauseCount} duraklama · ${ac.articulationRate} hece/sn · tonlama ${ac.pitchVarSemitones} yarım ton`
      : "";

    $("printReport").innerHTML = `
      <div class="pr-sheet">
        <div class="pr-head">
          <div class="pr-id">
            <h1>İngilizce Konuşma Becerisi Değerlendirme Raporu</h1>
            <p>9. Sınıf · CEFR A2 · İngilizce</p>
          </div>
          <div class="pr-total b${totalToBand(total)}">
            <span class="pr-total-num">${total}</span><span class="pr-total-den">/100</span>
            <em>${band.label}</em>
          </div>
        </div>

        <div class="pr-meta">
          <div><span>Öğrenci</span><strong>${escapeHtml(name)}</strong></div>
          <div><span>Sınıf</span><strong>${escapeHtml(cls)}</strong></div>
          <div><span>Tarih</span><strong>${date}</strong></div>
          <div class="pr-meta-task"><span>Konuşma Görevi</span><strong>${escapeHtml(state.task.title)} — ${escapeHtml(state.task.theme)}</strong></div>
        </div>

        <table class="pr-table">
          <thead><tr><th>Ölçüt</th><th>Puan</th><th>Düzey</th><th>Durum ve yapman gerekenler</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>

        <div class="pr-summary">
          <strong>Genel değerlendirme.</strong> ${escapeHtml($("overallFeedback").textContent || band.hint)}
          ${acLine ? `<div class="pr-acoustic">Ses ölçümleri: ${acLine}</div>` : ""}
        </div>

        ${note ? `<div class="pr-note"><strong>Öğretmen notu.</strong> ${escapeHtml(note)}</div>` : ""}

        <div class="pr-foot">
          <div class="pr-sign"><span></span>Öğretmen imzası</div>
          <p>Bu rapor, öğretmenin gözlemini destekleyen otomatik bir ön değerlendirmedir; nihai değerlendirme öğretmene aittir.</p>
        </div>
      </div>`;
  }

  function totalToBand(score) {
    if (score >= 85) return 4;
    if (score >= 70) return 3;
    if (score >= 50) return 2;
    return 1;
  }

  function downloadAudio() {
    if (!state.audioBlob) return;
    const ext = (state.audioBlob.type.indexOf("ogg") >= 0) ? "ogg" : (state.audioBlob.type.indexOf("mp4") >= 0 ? "mp4" : "webm");
    const safe = ($("studentName").value.trim() || "ogrenci").replace(/[^\wçğıöşü -]/gi, "").replace(/\s+/g, "_");
    const a = document.createElement("a");
    a.href = state.audioUrl;
    a.download = `kayit_${safe}_${state.task.id}.${ext}`;
    a.click();
  }

  function refreshScoreVisualsFor(cid, inp) {
    const s = state.scores[cid];
    const row = inp.closest(".criterion");
    const pill = row.querySelector(".band-pill");
    pill.className = `band-pill band-${s.band}`;
    pill.textContent = `Düzey ${s.band}/4`;
    const fill = row.querySelector(".meter-fill");
    fill.className = `meter-fill band-${s.band}`;
    fill.style.width = s.raw + "%";
    const cdef = CRITERIA.find((c) => c.id === cid);
    row.querySelector(".band-desc").textContent = cdef.bands[s.band];
  }

  function updateTotals() {
    const rawByCrit = {};
    CRITERIA.forEach((c) => (rawByCrit[c.id] = state.scores[c.id].raw));
    const total = computeTotal(rawByCrit);
    const band = totalBand(total);
    $("totalScore").textContent = total;
    $("totalBand").textContent = band.label;
    $("scoreRing").style.setProperty("--p", total);
    $("overallFeedback").textContent = buildFeedback(total, band);
    state.total = total;
    state.totalBandLabel = band.label;
  }

  function buildFeedback(total, band) {
    // En zayıf ve en güçlü kriteri belirleyip yapıcı geri bildirim üret.
    const entries = CRITERIA.map((c) => ({ c, raw: state.scores[c.id].raw }));
    entries.sort((a, b) => a.raw - b.raw);
    const weakest = entries[0];
    const strongest = entries[entries.length - 1];
    const m = state.metrics || {};
    const parts = [];

    // Hiç gerçek konuşma algılanmadıysa öncelikli olarak bunu bildir
    if (m.noSpeech || (m.presence !== undefined && m.presence < 0.2 && (m.wordCount || 0) === 0)) {
      return "Anlaşılır bir konuşma algılanmadı (yalnızca sessizlik veya arka plan gürültüsü). Lütfen öğrencinin mikrofona yeterince yüksek ve net konuştuğundan emin olup kaydı tekrarlayın.";
    }

    parts.push(`Genel düzey: ${band.label}. ${band.hint}`);
    if (strongest.raw >= 60) parts.push(`Güçlü yön: ${strongest.c.name.toLowerCase()}.`);
    if (weakest.raw < 70) {
      parts.push(`Geliştirilmesi gereken alan: ${weakest.c.name.toLowerCase()}. ${weakest.c.bands[Math.min(weakest.band + 1, 4)]}`);
    }
    // Çok ses var ama tanınan kelime yok => kötü İngilizce/anlaşılırlık uyarısı
    if (m.acoustic && m.acoustic.speechSec >= 5 && m.wordCount < 5) {
      parts.push("Öğrenci konuştu ancak çok az anlaşılır kelime tanındı; telaffuz/anlaşılırlık üzerinde çalışılmalı. Kaydı dinleyip puanı teyit edin.");
    }
    if (m.acoustic) {
      const a = m.acoustic;
      parts.push(`(Ses: ${a.speechSec}sn konuşma · %${Math.round(a.speechRatio * 100)} doluluk · ${a.pauseCount} duraklama · ${a.articulationRate} hece/sn · ${m.wordCount} kelime tanındı · konu kapsama ${m.keywordHits}/${m.keywordTotal})`);
    } else if (m.wordCount !== undefined) {
      parts.push(`(${m.wordCount} sözcük · ~${m.wpm} sözcük/dk · konu kapsama ${m.keywordHits}/${m.keywordTotal})`);
    }
    return parts.join(" ");
  }

  /* ============================================================ */
  /* RAPOR & KALICILIK                                            */
  /* ============================================================ */
  function buildRecord() {
    return {
      student: $("studentName").value.trim(),
      class: $("studentClass").value.trim(),
      task: { id: state.task.id, title: state.task.title, theme: state.task.theme },
      date: new Date().toISOString(),
      durationMs: state.elapsedMs,
      transcript: state.transcriptText,
      metrics: state.metrics,
      criteria: CRITERIA.map((c) => ({
        id: c.id, name: c.name, weight: c.weight,
        raw: state.scores[c.id].raw, band: state.scores[c.id].band
      })),
      total: state.total,
      level: state.totalBandLabel,
      teacherNote: $("teacherNote").value.trim()
    };
  }

  function finishAssessment() {
    const rec = buildRecord();
    state.history.unshift(rec);
    saveHistory(state.history);
    renderHistory();
    // Sınav modu: sonucu sınava işle ve listeye dön
    if (state.mode === "exam" && state.exam && state.examStudentId) {
      state.exam.results[state.examStudentId] = rec;
      toast("Öğrenci değerlendirmesi kaydedildi.");
      resetForNew();
      showView("exam");
      return;
    }
    $("historySection").hidden = false;
    $("newAssessmentBtn").hidden = false;
    toast("Değerlendirme bu oturuma kaydedildi.");
    resetForNew();
    showView("single");
  }

  function exportJson() {
    const rec = buildRecord();
    const blob = new Blob([JSON.stringify(rec, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safe = (rec.student || "ogrenci").replace(/[^\wçğıöşü -]/gi, "").replace(/\s+/g, "_");
    a.href = url;
    a.download = `degerlendirme_${safe}_${rec.task.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem("tymm_assessments") || "[]"); }
    catch (_) { return []; }
  }
  function saveHistory(h) {
    try { localStorage.setItem("tymm_assessments", JSON.stringify(h.slice(0, 200))); } catch (_) {}
  }
  function renderHistory() {
    const body = $("historyBody");
    if (!state.history.length) { $("historySection").hidden = true; return; }
    $("historySection").hidden = false;
    $("newAssessmentBtn").hidden = false;
    body.innerHTML = state.history.map((r) => `
      <tr>
        <td>${escapeHtml(r.student || "—")}</td>
        <td>${escapeHtml(r.class || "—")}</td>
        <td>${escapeHtml(r.task.title)}</td>
        <td><strong>${r.total}</strong></td>
        <td>${escapeHtml(r.level)}</td>
        <td>${new Date(r.date).toLocaleString("tr-TR")}</td>
      </tr>`).join("");
  }

  function resetForNew() {
    $("teacherNote").value = "";
    $("transcript").classList.remove("invalid");
    resetRecording();
  }

  /* ============================================================ */
  /* SINIF YÖNETİMİ (localStorage)                               */
  /* ============================================================ */
  function loadClasses() {
    try { return JSON.parse(localStorage.getItem("tymm_classes") || "[]"); }
    catch (_) { return []; }
  }
  function saveClasses() {
    try { localStorage.setItem("tymm_classes", JSON.stringify(state.classes)); } catch (_) {}
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function currentClass() { return state.classes.find((c) => c.id === state.currentClassId) || null; }

  function addClass() {
    const inp = $("newClassName");
    const name = inp.value.trim();
    if (!name) { inp.focus(); return; }
    const cls = { id: uid(), name: name, students: [] };
    state.classes.push(cls);
    saveClasses();
    inp.value = "";
    state.currentClassId = cls.id;
    renderClasses();
  }

  function deleteCurrentClass() {
    const cls = currentClass();
    if (!cls) return;
    if (!confirm(`"${cls.name}" sınıfı ve tüm öğrencileri silinsin mi?`)) return;
    state.classes = state.classes.filter((c) => c.id !== cls.id);
    state.currentClassId = null;
    saveClasses();
    renderClasses();
  }

  function addStudentSingle() {
    const cls = currentClass(); if (!cls) return;
    const inp = $("newStudentName");
    const name = inp.value.trim();
    if (!name) { inp.focus(); return; }
    cls.students.push({ id: uid(), name: name });
    saveClasses();
    inp.value = "";
    renderClassDetail();
  }

  function bulkAddStudents() {
    const cls = currentClass(); if (!cls) return;
    const lines = $("bulkStudents").value.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return;
    lines.forEach((name) => cls.students.push({ id: uid(), name: name }));
    saveClasses();
    $("bulkStudents").value = "";
    toast(`${lines.length} öğrenci eklendi.`);
    renderClassDetail();
  }

  function deleteStudent(studentId) {
    const cls = currentClass(); if (!cls) return;
    cls.students = cls.students.filter((s) => s.id !== studentId);
    saveClasses();
    renderClassDetail();
  }

  function renderClasses() {
    const list = $("classList");
    $("noClassesHint").hidden = state.classes.length > 0;
    list.innerHTML = state.classes.map((c) =>
      `<div class="class-row ${c.id === state.currentClassId ? "is-active" : ""}" data-id="${c.id}">
         <strong>${escapeHtml(c.name)}</strong>
         <span class="count">${c.students.length} öğrenci</span>
       </div>`).join("");
    list.querySelectorAll(".class-row").forEach((row) => {
      row.addEventListener("click", () => { state.currentClassId = row.dataset.id; renderClasses(); });
    });
    renderClassDetail();
  }

  function renderClassDetail() {
    const cls = currentClass();
    const box = $("classDetail");
    if (!cls) { box.hidden = true; return; }
    box.hidden = false;
    $("classDetailName").textContent = cls.name;
    $("classStudentCount").textContent = `${cls.students.length} öğrenci`;
    const body = $("studentList");
    body.innerHTML = cls.students.map((s, i) =>
      `<tr><td>${i + 1}</td><td>${escapeHtml(s.name)}</td>
         <td style="text-align:right"><button class="link-danger" data-id="${s.id}">Sil</button></td></tr>`).join("")
      || `<tr><td colspan="3" class="muted-note" style="padding:12px 0">Henüz öğrenci yok.</td></tr>`;
    body.querySelectorAll(".link-danger").forEach((b) => b.addEventListener("click", () => deleteStudent(b.dataset.id)));
  }

  /* ============================================================ */
  /* SINAV MODU                                                  */
  /* ============================================================ */
  function renderExamView() {
    if (state.exam) {
      $("examSetup").hidden = true;
      $("examSummary").hidden = true;
      $("examRoster").hidden = false;
      renderExamRoster();
    } else {
      $("examSetup").hidden = false;
      $("examRoster").hidden = true;
      $("examSummary").hidden = true;
      populateExamSetup();
    }
  }

  function populateExamSetup() {
    const hasStudents = state.classes.some((c) => c.students.length);
    $("examNoClass").hidden = hasStudents;
    $("startExamBtn").disabled = !hasStudents;
    $("examClass").innerHTML = state.classes.map((c) =>
      `<option value="${c.id}">${escapeHtml(c.name)} (${c.students.length})</option>`).join("");
    const order = []; const byTheme = new Map();
    TASKS.forEach((t) => { if (!byTheme.has(t.theme)) { byTheme.set(t.theme, []); order.push(t.theme); } byTheme.get(t.theme).push(t); });
    $("examTask").innerHTML = order.map((th) =>
      `<optgroup label="${escapeHtml(th)}">` +
      byTheme.get(th).map((t) => `<option value="${t.id}">${escapeHtml(t.title)}</option>`).join("") +
      `</optgroup>`).join("");
  }

  function startExam() {
    const cls = state.classes.find((c) => c.id === $("examClass").value);
    if (!cls || !cls.students.length) { toast("Seçili sınıfta öğrenci yok."); return; }
    const task = TASKS.find((t) => t.id === $("examTask").value) || TASKS[0];
    state.exam = { classId: cls.id, className: cls.name, task: task, whisper: $("examWhisper").checked, results: {} };
    renderExamView();
  }

  function renderExamRoster() {
    const cls = state.classes.find((c) => c.id === state.exam.classId);
    if (!cls) { state.exam = null; renderExamView(); return; }
    $("examRosterClass").textContent = cls.name;
    $("examRosterTask").textContent = `${state.exam.task.title} — ${state.exam.task.theme}`;
    const done = Object.keys(state.exam.results).length, total = cls.students.length;
    $("examProgressText").textContent = `${done}/${total} değerlendirildi`;
    $("examProgressBar").style.width = (total ? done / total * 100 : 0) + "%";
    $("examStudentList").innerHTML = cls.students.map((s, i) => {
      const rec = state.exam.results[s.id];
      const status = rec
        ? `<span class="status-chip status-done">Tamamlandı</span>`
        : `<span class="status-chip status-pending">Bekliyor</span>`;
      const btn = `<button class="btn btn-ghost btn-sm" data-id="${s.id}">${rec ? "Tekrar" : "Değerlendir"}</button>`;
      return `<tr><td>${i + 1}</td><td>${escapeHtml(s.name)}</td><td>${status}</td><td>${rec ? "<strong>" + rec.total + "</strong>" : "—"}</td><td style="text-align:right">${btn}</td></tr>`;
    }).join("");
    $("examStudentList").querySelectorAll("button[data-id]").forEach((b) =>
      b.addEventListener("click", () => evaluateExamStudent(b.dataset.id)));
  }

  function evaluateExamStudent(studentId) {
    const cls = state.classes.find((c) => c.id === state.exam.classId);
    const student = cls && cls.students.find((s) => s.id === studentId);
    if (!student) return;
    state.mode = "exam";
    state.examStudentId = studentId;
    state.task = state.exam.task;
    state.useWhisper = !!state.exam.whisper;
    $("studentName").value = student.name;
    $("studentClass").value = cls.name;
    goToRecord(); // mevcut kayıt/değerlendirme akışını yeniden kullan
  }

  function renderExamSummary() {
    const cls = state.classes.find((c) => c.id === state.exam.classId);
    $("examSummaryClass").textContent = cls.name;
    $("examSummaryTask").textContent = `${state.exam.task.title} — ${state.exam.task.theme}`;
    let sum = 0, n = 0;
    $("examSummaryBody").innerHTML = cls.students.map((s, i) => {
      const rec = state.exam.results[s.id];
      const cell = (id) => { const c = rec && rec.criteria.find((x) => x.id === id); return c ? c.raw : "—"; };
      if (rec) { sum += rec.total; n++; }
      return `<tr><td>${i + 1}</td><td>${escapeHtml(s.name)}</td>
        <td>${cell("uyum")}</td><td>${cell("organizasyon")}</td><td>${cell("sunum")}</td><td>${cell("dil")}</td><td>${cell("yaraticilik")}</td>
        <td><strong>${rec ? rec.total : "—"}</strong></td><td>${rec ? escapeHtml(rec.level) : "—"}</td></tr>`;
    }).join("");
    const avg = n ? Math.round(sum / n) : 0;
    $("examAvg").textContent = avg;
    $("examAvgRing").style.setProperty("--p", avg);
  }

  function exportExamCsv() {
    const cls = state.classes.find((c) => c.id === state.exam.classId);
    const csv = (s) => { s = String(s == null ? "" : s); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [["No", "Ogrenci", "Uyum", "Organizasyon", "Sunum", "Dil", "Yaraticilik", "Toplam", "Duzey"].join(";")];
    cls.students.forEach((s, i) => {
      const rec = state.exam.results[s.id];
      const cell = (id) => { const c = rec && rec.criteria.find((x) => x.id === id); return c ? c.raw : ""; };
      lines.push([i + 1, csv(s.name), cell("uyum"), cell("organizasyon"), cell("sunum"), cell("dil"), cell("yaraticilik"), rec ? rec.total : "", rec ? csv(rec.level) : ""].join(";"));
    });
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sinav_${csv(cls.name).replace(/\s+/g, "_")}_${state.exam.task.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ============================================================ */
  /* ARAYÜZ YARDIMCILARI                                          */
  /* ============================================================ */
  // Kayıt/sonuç akışı: sekmeleri ve tüm görünümleri gizle, yalnız akışı göster
  function showFlow(step) {
    $("tabs").hidden = true;
    ["setupStep", "historySection", "view-exam", "view-classes"].forEach((id) => {
      const e = $(id); if (e) e.hidden = true;
    });
    steps.record.hidden = step !== "record";
    steps.result.hidden = step !== "result";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Üst sekmeler: single / exam / classes
  function showView(view) {
    state.view = view;
    $("tabs").hidden = false;
    steps.record.hidden = true;
    steps.result.hidden = true;
    $("setupStep").hidden = view !== "single";
    $("view-exam").hidden = view !== "exam";
    $("view-classes").hidden = view !== "classes";
    $("historySection").hidden = !(view === "single" && state.history.length);
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.view === view));
    if (view === "exam") renderExamView();
    if (view === "classes") renderClasses();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toast(msg) {
    let el = document.querySelector(".toast");
    if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 2600);
  }

  /* matematiksel/biçim yardımcıları */
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function map(v, inLo, inHi, outLo, outHi) {
    if (inHi === inLo) return outLo;
    const t = (v - inLo) / (inHi - inLo);
    return outLo + clamp(t, 0, 1) * (outHi - outLo);
  }
  function avg(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
  function round2(n) { return Math.round(n * 100) / 100; }
  function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ============================================================ */
  /* OLAY BAĞLAMALARI                                             */
  /* ============================================================ */
  function bindEvents() {
    $("startBtn").addEventListener("click", startRecording);
    $("stopBtn").addEventListener("click", stopRecording);
    $("backToSetupBtn").addEventListener("click", async () => {
      await stopRecording();
      showView(state.mode === "exam" ? "exam" : "single");
    });
    $("evaluateBtn").addEventListener("click", async () => {
      const btn = $("evaluateBtn");
      btn.disabled = true;
      await stopRecording();           // ses analizinin bitmesini bekle
      // İsteğe bağlı: Whisper ile daha doğru yazıya dökme (ücretsiz, tarayıcıda)
      if (state.useWhisper && state.audioBlob) {
        try {
          const txt = await transcribeWithWhisper(state.audioBlob);
          if (txt) { $("transcript").value = txt; $("transcript").classList.remove("invalid"); }
        } catch (e) {
          toast("Whisper çözümlemesi yapılamadı; tarayıcı metni kullanılıyor.");
        }
        $("recStatusText").textContent = `Tamamlandı · ${formatTime(state.elapsedMs)}`;
      }
      runEvaluation();
      btn.disabled = false;
    });
    $("backToRecordBtn").addEventListener("click", () => showFlow("record"));
    $("printBtn").addEventListener("click", () => { buildPrintReport(); window.print(); });
    $("downloadAudioBtn").addEventListener("click", downloadAudio);
    $("exportBtn").addEventListener("click", exportJson);
    $("finishBtn").addEventListener("click", finishAssessment);
    $("newAssessmentBtn").addEventListener("click", () => { state.mode = "single"; resetForNew(); showView("single"); });
    $("transcript").addEventListener("input", (e) => e.target.classList.remove("invalid"));

    // Sekmeler
    document.querySelectorAll(".tab").forEach((t) => {
      t.addEventListener("click", () => { state.mode = t.dataset.view === "exam" ? state.mode : "single"; showView(t.dataset.view); });
    });

    // Sınıf yönetimi
    $("addClassBtn").addEventListener("click", addClass);
    $("newClassName").addEventListener("keydown", (e) => { if (e.key === "Enter") addClass(); });
    $("deleteClassBtn").addEventListener("click", deleteCurrentClass);
    $("addStudentBtn").addEventListener("click", addStudentSingle);
    $("newStudentName").addEventListener("keydown", (e) => { if (e.key === "Enter") addStudentSingle(); });
    $("bulkAddBtn").addEventListener("click", bulkAddStudents);

    // Sınav modu
    $("startExamBtn").addEventListener("click", startExam);
    $("examBackBtn").addEventListener("click", () => { state.exam = null; renderExamView(); });
    $("examSummaryBtn").addEventListener("click", () => { renderExamSummary(); $("examRoster").hidden = true; $("examSummary").hidden = false; });
    $("examSummaryBackBtn").addEventListener("click", () => { $("examSummary").hidden = true; $("examRoster").hidden = false; });
    $("examCsvBtn").addEventListener("click", exportExamCsv);
    $("examPrintBtn").addEventListener("click", () => window.print());
  }

  /* ----------------------------- başlat ----------------------------- */
  initSetup();
  bindEvents();
  renderHistory();
})();
