(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const slug = (s) =>
    String(s).toLocaleLowerCase("tr").replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
      .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "marka";

  const SWATCHES = ["#ff2d3d", "#ff7a1a", "#ffb800", "#d7ff3a", "#2dffc4", "#3aa8ff", "#b45cff", "#ff4fd8", "#f1efe9"];
  const FIELD_TYPES = { text: "Kısa metin", textarea: "Uzun metin", number: "Sayı", date: "Tarih", url: "Link", checkbox: "Evet / Hayır" };

  let data = null;
  let current = "settings"; // "settings" | "fields" | "backups" | brand key
  let dirty = false;

  /* ---------- Link parsers ---------- */
  const parseYouTube = (s) => {
    s = s.trim();
    if (/^[\w-]{11}$/.test(s)) return s;
    const m = s.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/);
    return m ? m[1] : null;
  };
  const parseReel = (s) => {
    s = s.trim();
    const m = s.match(/instagram\.com\/(?:[\w.]+\/)?(?:reel|reels|p|tv)\/([\w-]+)/);
    if (m) return m[1];
    return /^[\w-]{6,20}$/.test(s) ? s : null;
  };
  const splitInput = (s) => s.split(/[\s,]+/).filter(Boolean);

  /* ---------- State ---------- */
  const brand = () => data.brands.find((b) => b.key === current);
  const setDirty = (v = true) => {
    dirty = v;
    $("#saveBtn").disabled = !v;
    const st = $("#status");
    st.className = "status " + (v ? "dirty" : "");
    st.textContent = v ? "● Kaydedilmemiş değişiklikler" : st.textContent;
  };
  const toast = (msg, err) => {
    const t = $("#toast");
    t.textContent = msg;
    t.className = "toast show" + (err ? " err" : "");
    clearTimeout(t._t);
    t._t = setTimeout(() => (t.className = "toast"), 2600);
  };
  const confirmBox = (text, okLabel = "Sil") =>
    new Promise((res) => {
      const d = $("#dialog");
      $("#dialogText").textContent = text;
      $("#dialogOk").textContent = okLabel;
      d.returnValue = "";
      d.showModal();
      d.addEventListener("close", () => res(d.returnValue === "ok"), { once: true });
    });

  async function load() {
    const r = await fetch("../data.json", { cache: "no-store" });
    data = await r.json();
    data.customFields ||= [];
    data.showreel ||= { enabled: false, title: "SHOWREEL", clips: [] };
    data.showreel.clips ||= [];
    data.brands.forEach((b) => { b.fields ||= {}; b.youtube ||= []; b.reels ||= []; if (b.visible === undefined) b.visible = true; });
  }

  async function save() {
    if (!dirty) return;
    const btn = $("#saveBtn");
    btn.disabled = true;
    try {
      const r = await fetch("../api/data", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Kaydedilemedi");
      dirty = false;
      const st = $("#status");
      st.className = "status saved";
      st.textContent = "✓ Kaydedildi · " + new Date().toLocaleTimeString("tr", { hour: "2-digit", minute: "2-digit" });
      toast("Değişiklikler kaydedildi");
    } catch (e) {
      btn.disabled = false;
      toast(e.message === "Failed to fetch" ? "Sunucuya ulaşılamadı. 'python3 server.py' çalışıyor mu?" : e.message, true);
    }
  }

  /* ---------- Sidebar ---------- */
  function renderSide() {
    $$(".side__nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === current));
    $("#brandList").innerHTML = data.brands
      .map(
        (b, i) => `<li draggable="true" data-i="${i}" data-key="${esc(b.key)}" class="${b.key === current ? "active" : ""} ${b.visible ? "" : "hidden"}">
          <span class="sw" style="background:${esc(b.color)}"></span><span class="nm">${esc(b.title || "Adsız")}</span>
          <span class="ct">${b.reels.length + b.youtube.length}</span></li>`
      )
      .join("");
    $$("#brandList li").forEach((li) => li.addEventListener("click", () => go(li.dataset.key)));
    sortable($("#brandList"), "li", (from, to) => {
      move(data.brands, from, to);
      setDirty();
      renderSide();
    });
  }

  function go(view) {
    current = view;
    renderSide();
    render();
    window.scrollTo(0, 0);
  }

  /* ---------- Drag & drop reorder ---------- */
  function sortable(container, sel, onMove) {
    let from = null;
    $$(sel, container).forEach((el, i) => {
      el.addEventListener("dragstart", (e) => { from = i; el.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; });
      el.addEventListener("dragend", () => { el.classList.remove("dragging"); $$(".drag-over", container).forEach((x) => x.classList.remove("drag-over")); });
      el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("drag-over"); });
      el.addEventListener("dragleave", () => el.classList.remove("drag-over"));
      el.addEventListener("drop", (e) => { e.preventDefault(); if (from !== null && from !== i) onMove(from, i); from = null; });
    });
  }
  const move = (arr, from, to) => arr.splice(to, 0, arr.splice(from, 1)[0]);

  /* ---------- Generic binding: inputs with data-bind="path" ---------- */
  function bind(root, obj, after) {
    $$("[data-bind]", root).forEach((el) => {
      const k = el.dataset.bind;
      const isCheck = el.type === "checkbox";
      if (isCheck) el.checked = !!obj[k];
      else el.value = obj[k] ?? "";
      el.addEventListener("input", () => {
        obj[k] = isCheck ? el.checked : el.type === "number" && el.value !== "" ? Number(el.value) : el.value;
        setDirty();
        after?.(k, el);
      });
    });
  }

  /* ---------- Views ---------- */
  function render() {
    const v = $("#view");
    if (current === "settings") return renderSettings(v);
    if (current === "fields") return renderFields(v);
    if (current === "showreel") return renderShowreel(v);
    if (current === "backups") return renderBackups(v);
    const b = brand();
    if (!b) return go("settings");
    renderBrand(v, b);
  }

  function renderSettings(v) {
    $("#viewTitle").textContent = "Genel Ayarlar";
    v.innerHTML = `
      <div class="card"><div class="card__head"><h2>Kimlik</h2></div>
        <div class="grid">
          <label class="field"><span>İsim <em>(imza ve başlıkta görünür)</em></span><input type="text" data-bind="name"></label>
          <label class="field"><span>Ünvan</span><input type="text" data-bind="role"></label>
          <label class="field full"><span>Açılış üst yazısı</span><input type="text" data-bind="kicker"></label>
          <label class="field full"><span>Tanıtım paragrafı <em>(vurgulamak için *yıldız içine* alın)</em></span><textarea data-bind="about" rows="4"></textarea></label>
        </div></div>
      <div class="card"><div class="card__head"><h2>İletişim</h2></div>
        <p class="desc">Boş bırakılan kanallar sitede gösterilmez.</p>
        <div class="grid">
          <label class="field"><span>E-posta</span><input type="email" data-bind="email" placeholder="ornek@mail.com"></label>
          <label class="field"><span>Instagram linki</span><input type="url" data-bind="instagram" placeholder="https://instagram.com/..."></label>
          <label class="field"><span>LinkedIn linki</span><input type="url" data-bind="linkedin" placeholder="https://linkedin.com/in/..."></label>
          <label class="field"><span>Telefon / WhatsApp <em>(ülke koduyla)</em></span><input type="tel" data-bind="phone" placeholder="+90 555 111 22 33"></label>
        </div></div>
      <div class="card"><div class="card__head"><h2>İletişim bölümü yazıları</h2></div>
        <div class="grid">
          <label class="field full"><span>Üst yazı</span><input type="text" data-bind="contactKicker"></label>
          <label class="field"><span>Büyük başlık — 1. satır</span><input type="text" data-bind="contactLine1"></label>
          <label class="field"><span>Büyük başlık — 2. satır <em>(içi boş)</em></span><input type="text" data-bind="contactLine2"></label>
        </div></div>`;
    bind(v, data.settings);
  }

  function fieldInput(f, b) {
    const val = b.fields[f.key];
    const attr = `data-field="${esc(f.key)}"`;
    if (f.type === "checkbox") return `<label class="switch"><input type="checkbox" ${attr} ${val ? "checked" : ""}> ${esc(f.label)}</label>`;
    const inner =
      f.type === "textarea"
        ? `<textarea ${attr} rows="3">${esc(val)}</textarea>`
        : `<input type="${f.type === "url" ? "url" : f.type}" ${attr} value="${esc(val)}">`;
    return `<label class="field"><span>${esc(f.label)}${f.showOnSite ? "" : " <em>(sitede gizli)</em>"}</span>${inner}</label>`;
  }

  function renderBrand(v, b) {
    $("#viewTitle").textContent = b.title || "Adsız marka";
    v.innerHTML = `
      <div class="card">
        <div class="card__head"><h2>Marka bilgileri</h2>
          <label class="switch"><input type="checkbox" data-bind="visible"> Sitede göster</label></div>
        <div class="grid">
          <label class="field"><span>Marka adı</span><input type="text" data-bind="title"></label>
          <label class="field"><span>Bağlantı anahtarı <em>(site adresinde #anahtar)</em></span><input type="text" id="keyInput" value="${esc(b.key)}"></label>
          <label class="field"><span>Etiket <em>(örn. Çekim + Kurgu)</em></span><input type="text" data-bind="tag"></label>
          <label class="field"><span>Not</span><input type="text" data-bind="note" placeholder="örn. 2026 sezonu"></label>
          <div class="field full"><span>Vurgu rengi</span>
            <div class="color"><input type="color" data-bind="color">
              <div class="swatches">${SWATCHES.map((c) => `<button type="button" data-c="${c}" style="background:${c}"></button>`).join("")}</div></div></div>
        </div>
      </div>

      ${data.customFields.length ? `<div class="card"><div class="card__head"><h2>Özel alanlar</h2>
        <button class="btn btn--sm btn--ghost" data-go="fields">Alanları yönet</button></div>
        <div class="grid">${data.customFields.map((f) => fieldInput(f, b)).join("")}</div></div>` : ""}

      <div class="card">
        <div class="card__head"><h2>YouTube videoları <small>${b.youtube.length}</small></h2></div>
        <div class="adder"><textarea id="ytIn" placeholder="YouTube linklerini yapıştırın (birden fazla olabilir)"></textarea><button class="btn btn--primary" id="ytAdd">Ekle</button></div>
        ${b.youtube.length ? `<div class="media media--yt" id="ytList">${b.youtube.map((id, i) => `
          <div class="item" draggable="true">
            <span class="pos">${i + 1}</span><button class="x" data-del-yt="${i}" title="Kaldır">✕</button>
            <img src="https://i.ytimg.com/vi/${esc(id)}/mqdefault.jpg" alt="">
            <div class="bar"><span>${esc(id)}</span><a href="https://youtu.be/${esc(id)}" target="_blank" title="YouTube'da aç">↗</a></div>
          </div>`).join("")}</div>` : `<div class="empty">Henüz YouTube videosu yok.</div>`}
      </div>

      <div class="card">
        <div class="card__head"><h2>Instagram reel'leri <small>${b.reels.length}</small></h2></div>
        <div class="adder"><textarea id="reelIn" placeholder="Instagram reel linklerini yapıştırın (birden fazla olabilir)"></textarea><button class="btn btn--primary" id="reelAdd">Ekle</button></div>
        ${b.reels.length ? `<div class="media media--reel" id="reelList">${b.reels.map((id, i) => `
          <div class="item item--reel" draggable="true">
            <button class="x" data-del-reel="${i}" title="Kaldır">✕</button>
            <span class="no">${String(i + 1).padStart(2, "0")}</span>
            <div><div class="id">${esc(id)}</div><a class="ig" href="https://www.instagram.com/reel/${esc(id)}/" target="_blank">Instagram'da aç ↗</a></div>
          </div>`).join("")}</div>` : `<div class="empty">Henüz reel yok.</div>`}
      </div>

      <div class="card danger-zone"><div class="card__head"><div><h2>Markayı sil</h2>
        <p class="desc" style="margin:4px 0 0">Marka ve tüm videoları silinir. Kaydetmeden önce geri alınabilir; kayıttan sonra Yedekler'den döndürülebilir.</p></div>
        <div style="display:flex;gap:8px"><button class="btn btn--sm" id="dupBrand">Kopyala</button><button class="btn btn--sm btn--danger" id="delBrand">Sil</button></div></div></div>`;

    bind(v, b, (k) => {
      if (k === "title") $("#viewTitle").textContent = b.title || "Adsız marka";
      renderSide();
    });
    $$("[data-c]", v).forEach((s) => s.addEventListener("click", () => { b.color = s.dataset.c; $('[data-bind="color"]', v).value = s.dataset.c; setDirty(); renderSide(); }));
    $$("[data-go]", v).forEach((s) => s.addEventListener("click", () => go(s.dataset.go)));

    $("#keyInput").addEventListener("change", (e) => {
      const k = slug(e.target.value);
      if (k !== b.key && data.brands.some((x) => x.key === k)) { toast("Bu anahtar başka bir markada kullanılıyor", true); e.target.value = b.key; return; }
      b.key = current = k; e.target.value = k; setDirty(); renderSide();
    });

    $$("[data-field]", v).forEach((el) =>
      el.addEventListener("input", () => {
        b.fields[el.dataset.field] = el.type === "checkbox" ? el.checked : el.type === "number" && el.value !== "" ? Number(el.value) : el.value;
        setDirty();
      })
    );

    const addMany = (inputSel, list, parser, label) => {
      const raw = splitInput($(inputSel).value);
      if (!raw.length) return;
      let added = 0, bad = 0, dup = 0;
      raw.forEach((s) => {
        const id = parser(s);
        if (!id) return bad++;
        if (list.includes(id)) return dup++;
        list.push(id); added++;
      });
      if (added) setDirty();
      toast([added && `${added} ${label} eklendi`, dup && `${dup} zaten vardı`, bad && `${bad} link tanınmadı`].filter(Boolean).join(" · "), !added);
      renderSide(); render();
    };
    $("#ytAdd").onclick = () => addMany("#ytIn", b.youtube, parseYouTube, "video");
    $("#reelAdd").onclick = () => addMany("#reelIn", b.reels, parseReel, "reel");
    [["#ytIn", "#ytAdd"], ["#reelIn", "#reelAdd"]].forEach(([i, btn]) =>
      $(i).addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $(btn).click(); } })
    );

    $$("[data-del-yt]", v).forEach((x) => x.addEventListener("click", (e) => { e.stopPropagation(); b.youtube.splice(+x.dataset.delYt, 1); setDirty(); renderSide(); render(); }));
    $$("[data-del-reel]", v).forEach((x) => x.addEventListener("click", (e) => { e.stopPropagation(); b.reels.splice(+x.dataset.delReel, 1); setDirty(); renderSide(); render(); }));
    if ($("#ytList")) sortable($("#ytList"), ".item", (f, t) => { move(b.youtube, f, t); setDirty(); render(); });
    if ($("#reelList")) sortable($("#reelList"), ".item", (f, t) => { move(b.reels, f, t); setDirty(); render(); });

    $("#delBrand").onclick = async () => {
      if (!(await confirmBox(`"${b.title}" markası ve ${b.youtube.length + b.reels.length} videosu silinsin mi?`))) return;
      data.brands = data.brands.filter((x) => x !== b);
      setDirty(); toast("Marka silindi — kaydedince kalıcı olur");
      go(data.brands[0]?.key || "settings");
    };
    $("#dupBrand").onclick = () => {
      const copy = JSON.parse(JSON.stringify(b));
      copy.title += " (kopya)";
      copy.key = uniqueKey(slug(copy.title));
      data.brands.splice(data.brands.indexOf(b) + 1, 0, copy);
      setDirty(); go(copy.key);
    };
  }

  const uniqueKey = (base) => { let k = base, n = 2; while (data.brands.some((b) => b.key === k)) k = `${base}-${n++}`; return k; };

  function renderFields(v) {
    $("#viewTitle").textContent = "Özel Alanlar";
    const F = data.customFields;
    v.innerHTML = `
      <div class="card">
        <div class="card__head"><h2>Marka alanları <small>${F.length}</small></h2><button class="btn btn--primary btn--sm" id="addField">＋ Yeni alan</button></div>
        <p class="desc">Burada tanımladığınız alanlar her markanın düzenleme ekranında görünür (ör. Müşteri, Yıl, Rol, Proje linki). "Sitede göster" açıksa marka başlığının altında etiket olarak çıkar.</p>
        ${F.length ? `<div class="rows" id="fieldRows">${F.map((f, i) => `
          <div class="row" draggable="true" data-i="${i}">
            <span class="handle" title="Sürükle">⋮⋮</span>
            <label class="field"><span>Alan adı</span><input type="text" data-k="label" value="${esc(f.label)}"></label>
            <div class="field"><span>Anahtar</span><code>${esc(f.key)}</code></div>
            <label class="field"><span>Tür</span><select data-k="type">${Object.entries(FIELD_TYPES).map(([k, l]) => `<option value="${k}" ${f.type === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
            <label class="switch"><input type="checkbox" data-k="showOnSite" ${f.showOnSite ? "checked" : ""}> Sitede göster</label>
            <button class="btn btn--sm btn--danger" data-del="${i}">Sil</button>
          </div>`).join("")}</div>` : `<div class="empty">Henüz özel alan yok. "Yeni alan" ile ekleyin.</div>`}
      </div>`;

    $("#addField").onclick = () => {
      let base = "alan", k = base, n = 2;
      while (F.some((f) => f.key === k)) k = `${base}-${n++}`;
      F.push({ key: k, label: "Yeni alan", type: "text", showOnSite: true });
      setDirty(); render();
      const inputs = $$('#fieldRows [data-k="label"]');
      inputs.at(-1)?.select();
    };
    $$("#fieldRows .row").forEach((row) => {
      const f = F[+row.dataset.i];
      $$("[data-k]", row).forEach((el) =>
        el.addEventListener(el.tagName === "SELECT" || el.type === "checkbox" ? "change" : "input", () => {
          const k = el.dataset.k;
          f[k] = el.type === "checkbox" ? el.checked : el.value;
          if (k === "label") {
            const nk = slug(el.value);
            if (nk && !F.some((x) => x !== f && x.key === nk)) {
              data.brands.forEach((b) => { if (f.key in b.fields) { b.fields[nk] = b.fields[f.key]; delete b.fields[f.key]; } });
              f.key = nk; $("code", row).textContent = nk;
            }
          }
          setDirty();
        })
      );
    });
    $$("[data-del]", v).forEach((x) =>
      x.addEventListener("click", async () => {
        const f = F[+x.dataset.del];
        const used = data.brands.filter((b) => b.fields[f.key] !== undefined && b.fields[f.key] !== "").length;
        if (!(await confirmBox(`"${f.label}" alanı silinsin mi?${used ? ` ${used} markadaki değeri de silinecek.` : ""}`))) return;
        F.splice(+x.dataset.del, 1);
        data.brands.forEach((b) => delete b.fields[f.key]);
        setDirty(); render();
      })
    );
    if ($("#fieldRows")) sortable($("#fieldRows"), ".row", (a, b) => { move(F, a, b); setDirty(); render(); });
  }

  /* ---------- Showreel ---------- */
  const toSec = (s) => {
    s = String(s).trim();
    if (!s) return 0;
    if (s.includes(":")) return s.split(":").reduce((a, p) => a * 60 + (+p || 0), 0);
    return +s || 0;
  };
  const toClock = (n) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
  const parseStart = (url) => {
    const m = String(url).match(/[?&#](?:t|start)=(\d+h)?(\d+m)?(\d+)s?/);
    return m ? (parseInt(m[1]) || 0) * 3600 + (parseInt(m[2]) || 0) * 60 + (+m[3] || 0) : null;
  };

  function renderShowreel(v) {
    $("#viewTitle").textContent = "Showreel";
    const R = data.showreel;
    const total = R.clips.reduce((s, c) => s + (+c.dur || 0), 0);
    const brandOpts = (sel) => `<option value="">— Marka yok —</option>` + data.brands.map((b) => `<option value="${esc(b.key)}" ${b.key === sel ? "selected" : ""}>${esc(b.title)}</option>`).join("");
    v.innerHTML = `
      <div class="card">
        <div class="card__head"><h2>Ayarlar</h2><label class="switch"><input type="checkbox" data-bind="enabled"> Sitede göster</label></div>
        <div class="grid"><label class="field"><span>Başlık</span><input type="text" data-bind="title"></label>
          <div class="field"><span>Toplam süre</span><div style="padding:10px 0;font-weight:600">${R.clips.length} klip · ${toClock(total)}</div></div></div>
      </div>
      <div class="card">
        <div class="card__head"><h2>Klipler <small>${R.clips.length}</small></h2></div>
        <p class="desc">YouTube linki yapıştırın. Link "?t=" ile belirli bir saniyeyi gösteriyorsa (YouTube'da "Şu anda paylaş") başlangıç otomatik alınır. Ritim için 3–5 saniyelik anlar idealdir.</p>
        <div class="adder"><textarea id="srIn" placeholder="https://youtu.be/...?t=42"></textarea><button class="btn btn--primary" id="srAdd">Ekle</button></div>
        ${R.clips.length ? `<div class="rows" id="srRows">${R.clips.map((c, i) => `
          <div class="row row--clip" draggable="true" data-i="${i}">
            <span class="handle" title="Sürükle">⋮⋮</span>
            <img src="https://i.ytimg.com/vi/${esc(c.id)}/mqdefault.jpg" alt="" class="clip__thumb">
            <label class="field"><span>Marka</span><select data-k="brand">${brandOpts(c.brand)}</select></label>
            <label class="field"><span>Başlangıç (dk:sn)</span><input type="text" data-k="start" value="${toClock(+c.start || 0)}"></label>
            <label class="field"><span>Süre (sn)</span><input type="number" min="1" max="30" step="0.5" data-k="dur" value="${+c.dur || 4}"></label>
            <div style="display:flex;gap:6px">
              <a class="btn btn--sm" target="_blank" href="https://www.youtube.com/watch?v=${esc(c.id)}&t=${Math.floor(+c.start || 0)}s" title="Bu andan YouTube'da aç">▶</a>
              <button class="btn btn--sm btn--danger" data-del="${i}">Sil</button>
            </div>
          </div>`).join("")}</div>` : `<div class="empty">Henüz klip yok.</div>`}
      </div>`;

    bind(v, R);
    $("#srAdd").onclick = () => {
      const lines = splitInput($("#srIn").value);
      let added = 0, bad = 0;
      lines.forEach((s) => {
        const id = parseYouTube(s);
        if (!id) return bad++;
        const brand = data.brands.find((b) => b.youtube.includes(id))?.key || "";
        R.clips.push({ id, start: parseStart(s) ?? 0, dur: 4, brand });
        added++;
      });
      if (added) setDirty();
      toast([added && `${added} klip eklendi`, bad && `${bad} link tanınmadı`].filter(Boolean).join(" · "), !added);
      render();
    };
    $("#srIn").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#srAdd").click(); } });
    $$("#srRows .row").forEach((row) => {
      const c = R.clips[+row.dataset.i];
      $$("[data-k]", row).forEach((el) =>
        el.addEventListener("change", () => {
          const k = el.dataset.k;
          c[k] = k === "start" ? toSec(el.value) : k === "dur" ? Math.max(1, +el.value || 4) : el.value;
          if (k === "start") el.value = toClock(c.start);
          setDirty();
          if (k !== "brand") $(".card .field div", v).textContent = `${R.clips.length} klip · ${toClock(R.clips.reduce((s, x) => s + (+x.dur || 0), 0))}`;
        })
      );
    });
    $$("[data-del]", v).forEach((x) => x.addEventListener("click", () => { R.clips.splice(+x.dataset.del, 1); setDirty(); render(); }));
    if ($("#srRows")) sortable($("#srRows"), ".row", (a, b) => { move(R.clips, a, b); setDirty(); render(); });
  }

  async function renderBackups(v) {
    $("#viewTitle").textContent = "Yedekler";
    v.innerHTML = `<div class="card"><div class="card__head"><h2>Otomatik yedekler</h2></div>
      <p class="desc">Her kayıttan önce eski hali yedeklenir (son 50 kayıt). Bir yedeği geri yüklemek mevcut içeriğin yerine geçer.</p><ul class="backups" id="bk"><li>Yükleniyor…</li></ul></div>`;
    try {
      const list = await (await fetch("../api/backups")).json();
      const fmt = (n) => { const m = n.match(/data-(\d{4})(\d\d)(\d\d)-(\d\d)(\d\d)(\d\d)/); return m ? `${m[3]}.${m[2]}.${m[1]} · ${m[4]}:${m[5]}:${m[6]}` : n; };
      $("#bk").innerHTML = list.length
        ? list.map((n) => `<li><span>${fmt(n)}</span><button class="btn btn--sm" data-r="${esc(n)}">Geri yükle</button></li>`).join("")
        : `<li class="empty">Henüz yedek yok. İlk kayıttan sonra burada görünecek.</li>`;
      $$("[data-r]", v).forEach((b) =>
        b.addEventListener("click", async () => {
          if (!(await confirmBox(`${fmt(b.dataset.r)} tarihli yedek geri yüklensin mi? Kaydedilmemiş değişiklikler kaybolur.`, "Geri yükle"))) return;
          const r = await fetch("../api/restore?name=" + encodeURIComponent(b.dataset.r), { method: "POST" });
          if (!r.ok) return toast("Geri yüklenemedi", true);
          await load(); setDirty(false); $("#status").textContent = "";
          toast("Yedek geri yüklendi"); go("settings");
        })
      );
    } catch {
      $("#bk").innerHTML = `<li class="empty">Yedekler alınamadı — sunucu çalışıyor mu?</li>`;
    }
  }

  /* ---------- Global events ---------- */
  $$(".side__nav button").forEach((b) => b.addEventListener("click", () => go(b.dataset.view)));
  $("#addBrand").onclick = () => {
    const key = uniqueKey("yeni-marka");
    data.brands.push({ key, title: "Yeni Marka", tag: "Çekim + Kurgu", note: "", color: SWATCHES[data.brands.length % SWATCHES.length], visible: true, fields: {}, youtube: [], reels: [] });
    setDirty(); go(key);
    $('[data-bind="title"]')?.select();
  };
  $("#saveBtn").onclick = save;
  addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); } });
  addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  load()
    .then(() => go("settings"))
    .catch(() => ($("#view").innerHTML = `<div class="empty">data.json okunamadı. Paneli <b>python3 server.py</b> ile açın.</div>`));
})();
