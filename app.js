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
    scores: null,        // hesaplanan { criterionId: {raw, band, ...} }
    history: loadHistory()
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

    // Web Speech API desteği kontrolü
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      const note = $("speechSupport");
      note.hidden = false;
      note.textContent =
        "Bu tarayıcı otomatik konuşma tanımayı desteklemiyor (Chrome/Edge önerilir). " +
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
    showStep("record");
    $("recordTaskTitle").textContent = state.task.title;
    $("recordTaskPrompt").textContent = state.task.prompt;
    resetRecording();
  }

  function resetRecording() {
    stopRecognition();
    state.recording = false;
    state.elapsedMs = 0;
    state.finalText = "";
    state.confidences = [];
    $("transcript").value = "";
    $("recTimer").textContent = "00:00";
    $("recStatusText").textContent = "Hazır";
    $("recDot").classList.remove("active");
    $("startBtn").disabled = false;
    $("stopBtn").disabled = true;
  }

  function startRecording() {
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

    startRecognition();
  }

  function stopRecording() {
    if (!state.recording) return;
    state.recording = false;
    state.elapsedMs = Date.now() - state.startTime;
    clearInterval(state.timerInt);
    stopRecognition();
    $("startBtn").disabled = false;
    $("stopBtn").disabled = true;
    $("recDot").classList.remove("active");
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
    const minutes = Math.max(state.elapsedMs / 60000, wordCount / 130); // süre yoksa metinden tahmin
    const wpm = wordCount > 0 ? wordCount / minutes : 0;

    // Cümle bölme (STT noktalama koymayabilir; yine de en iyi gayretle)
    const sentences = clean.split(/[.!?]+|\n/).map((s) => s.trim()).filter(Boolean);
    const sentenceCount = Math.max(sentences.length, wordCount > 0 ? 1 : 0);
    const avgSentLen = sentenceCount ? wordCount / sentenceCount : 0;

    const uniqueWords = new Set(words);
    const ttr = wordCount ? uniqueWords.size / wordCount : 0; // tür-belirteç oranı

    // ----- 1) AKICILIK -----
    // İdeal A2 hızı ~90–130 wpm. Çok yavaş veya aşırı hız ceza alır.
    let fluency = clamp(map(wpm, 40, 110, 35, 100), 0, 100);
    if (wpm > 150) fluency -= 10; // ezber/aceleci okuma izlenimi
    const fillerCount = countFillers(clean);
    fluency -= Math.min(fillerCount * 4, 25);
    const repeats = countImmediateRepeats(words);
    fluency -= Math.min(repeats * 5, 20);
    if (wordCount < 8) fluency = Math.min(fluency, 35); // çok kısa konuşma
    fluency = clamp(fluency, 0, 100);

    // ----- 2) TELAFFUZ -----
    // Web Speech güven skoru telaffuz netliğinin vekilidir.
    let pronunciation;
    if (state.confidences.length) {
      const avgConf = avg(state.confidences);
      pronunciation = clamp(map(avgConf, 0.55, 0.92, 45, 100), 0, 100);
    } else {
      // Güven verisi yoksa (elle giriş): nötr–olumlu varsayılan, öğretmen düzeltir.
      pronunciation = 70;
    }
    if (wordCount < 8) pronunciation = Math.min(pronunciation, 50);

    // ----- 3) SÖZ DAĞARCIĞI -----
    // Tür-belirteç oranı + içerik (stopword olmayan benzersiz) sözcük sayısı.
    const contentWords = [...uniqueWords].filter((w) => !STOPWORDS.has(w) && w.length > 2);
    let vocabulary = clamp(
      map(ttr, 0.35, 0.7, 40, 95) * 0.5 +
      map(contentWords.length, 4, 30, 40, 100) * 0.5,
      0, 100
    );
    if (wordCount < 8) vocabulary = Math.min(vocabulary, 40);
    vocabulary = clamp(vocabulary, 0, 100);

    // ----- 4) DİLBİLGİSİ -----
    // Sezgisel: cümle uzunluğu dengesi, yapı çeşitliliği (zaman/bağlaç işaretleri).
    let grammar = clamp(map(avgSentLen, 3, 9, 45, 90), 0, 100);
    const structureSignals = countStructureSignals(clean);
    grammar += Math.min(structureSignals * 3, 15);
    if (avgSentLen > 22) grammar -= 15; // bölünememiş, kontrolsüz uzun ileti
    if (wordCount < 8) grammar = Math.min(grammar, 45);
    grammar = clamp(grammar, 0, 100);

    // ----- 5) İÇERİK & GÖREV BAŞARIMI -----
    const kw = state.task.keywords || [];
    const hits = kw.filter((k) => uniqueWords.has(k.toLowerCase())).length;
    const coverage = kw.length ? hits / kw.length : 0;
    const lengthScore = map(wordCount, 10, 70, 40, 100);
    let content = clamp(coverage * 100 * 0.5 + lengthScore * 0.5, 0, 100);
    if (wordCount < 8) content = Math.min(content, 30);
    content = clamp(content, 0, 100);

    const raw = {
      fluency: Math.round(fluency),
      pronunciation: Math.round(pronunciation),
      vocabulary: Math.round(vocabulary),
      grammar: Math.round(grammar),
      content: Math.round(content)
    };

    return {
      raw,
      metrics: { wordCount, wpm: Math.round(wpm), sentenceCount, ttr: round2(ttr), fillerCount, keywordHits: hits, keywordTotal: kw.length }
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
    if (text.length < 2) {
      $("transcript").focus();
      $("transcript").classList.add("invalid");
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
    showStep("result");
  }

  function renderResult() {
    $("resStudent").textContent = $("studentName").value.trim() || "—";
    $("resClass").textContent = $("studentClass").value.trim() || "—";
    $("resTask").textContent = `${state.task.title} · ${state.task.theme}`;

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
    parts.push(`Genel düzey: ${band.label}. ${band.hint}`);
    if (strongest.raw >= 60) parts.push(`Güçlü yön: ${strongest.c.name.toLowerCase()}.`);
    if (weakest.raw < 70) {
      parts.push(`Geliştirilmesi gereken alan: ${weakest.c.name.toLowerCase()}. ${weakest.c.bands[Math.min(weakest.band + 1, 4)]}`);
    }
    if (m.wordCount !== undefined) {
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
    $("historySection").hidden = false;
    $("newAssessmentBtn").hidden = false;
    toast("Değerlendirme bu oturuma kaydedildi.");
    resetForNew();
    showStep("setup");
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
  /* ARAYÜZ YARDIMCILARI                                          */
  /* ============================================================ */
  function showStep(name) {
    Object.entries(steps).forEach(([k, el]) => (el.hidden = k !== name));
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
    $("backToSetupBtn").addEventListener("click", () => { stopRecording(); showStep("setup"); });
    $("evaluateBtn").addEventListener("click", () => { stopRecording(); runEvaluation(); });
    $("backToRecordBtn").addEventListener("click", () => showStep("record"));
    $("printBtn").addEventListener("click", () => window.print());
    $("exportBtn").addEventListener("click", exportJson);
    $("finishBtn").addEventListener("click", finishAssessment);
    $("newAssessmentBtn").addEventListener("click", () => { resetForNew(); showStep("setup"); });
    $("transcript").addEventListener("input", (e) => e.target.classList.remove("invalid"));
  }

  /* ----------------------------- başlat ----------------------------- */
  initSetup();
  bindEvents();
  renderHistory();
})();
