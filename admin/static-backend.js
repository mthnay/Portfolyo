/*
 * Statik site modu: panel internette (Render Static Site) açıldığında
 * /api/* isteklerini GitHub API'sine çevirir. Bilgisayarda (localhost)
 * hiçbir şey yapmaz; orada server.py çalışır.
 *
 * GitHub token'ı admin/vault.json içinde panel şifresiyle şifrelenmiş
 * (PBKDF2 + AES-GCM) olarak durur. Şifre olmadan token açılamaz.
 */
(() => {
  const LOCAL = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  if (LOCAL && !/[?&]static=1/.test(location.search)) return; // ?static=1: yerelde test için

  const realFetch = window.fetch.bind(window);
  const ITER = 600000;
  const VAULT_PATH = "admin/vault.json";
  let gh = null; // { token, repo, branch }
  try { gh = JSON.parse(sessionStorage.getItem("sd-gh") || "null"); } catch {}

  /* ---------- yardımcılar ---------- */
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const utf8ToB64 = (str) => { const bytes = enc.encode(str); let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const b64ToUtf8 = (s) => dec.decode(unb64(s.replace(/\n/g, "")));
  const json = (code, obj) => new Response(JSON.stringify(obj), { status: code, headers: { "Content-Type": "application/json" } });

  async function keyFrom(pw, salt) {
    const base = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function seal(pw, token, repo, branch) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyFrom(pw, salt), enc.encode(token));
    return { v: 1, repo, branch, iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
  }
  async function unseal(pw, v) {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(v.iv) }, await keyFrom(pw, unb64(v.salt)), unb64(v.ct));
    return dec.decode(pt);
  }

  async function api(path, opt = {}) {
    const r = await realFetch(`https://api.github.com/repos/${gh.repo}/${path}`, {
      ...opt,
      headers: { Authorization: `Bearer ${gh.token}`, Accept: "application/vnd.github+json", ...(opt.headers || {}) },
    });
    if (r.status === 401) throw Object.assign(new Error("GitHub token geçersiz veya süresi dolmuş"), { auth: true });
    return r;
  }
  async function getFile(path, ref) {
    const r = await api(`contents/${path}?ref=${encodeURIComponent(ref || gh.branch)}&t=${Date.now()}`);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("GitHub okunamadı: " + r.status);
    return r.json();
  }
  async function putFile(path, base64Content, message) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const cur = await getFile(path);
      if (cur && cur.content && cur.content.replace(/\n/g, "") === base64Content) return; // değişmemiş
      const r = await api(`contents/${path}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, content: base64Content, branch: gh.branch, ...(cur ? { sha: cur.sha } : {}) }),
      });
      if (r.ok) return;
      if (r.status === 409 && attempt === 0) continue; // aynı anda değişmiş, tekrar dene
      const j = await r.json().catch(() => ({}));
      throw new Error("GitHub'a yazılamadı: " + (j.message || r.status));
    }
  }
  async function readVault() {
    const r = await realFetch(`/${VAULT_PATH}?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    try { return await r.json(); } catch { return null; }
  }

  /* ---------- ilk kurulum ekranı ---------- */
  function setupDialog(pwFromLogin) {
    return new Promise((resolve) => {
      const el = document.createElement("div");
      el.className = "login";
      el.style.zIndex = 60;
      el.innerHTML = `<form class="login__box" autocomplete="off" style="width:min(460px,100%)">
        <div class="side__brand">SD<i>.</i> <span>İlk kurulum</span></div>
        <p class="desc" style="color:var(--mute);font-size:13px">Panelin internetten kayıt yapabilmesi için bir kerelik GitHub bağlantısı gerekiyor. Token, panel şifresiyle şifrelenip depoya kaydedilir.</p>
        <label class="field"><span>GitHub deposu <em>(kullanici/depo)</em></span><input type="text" id="suRepo" placeholder="kullanici/sdportfolyo" required></label>
        <label class="field"><span>Dal (branch)</span><input type="text" id="suBranch" value="main" required></label>
        <label class="field"><span>GitHub token <em>(Contents: Read and write)</em></span><input type="password" id="suTok" required></label>
        <label class="field"><span>Panel şifresi</span><input type="password" id="suPw" value="${pwFromLogin ? pwFromLogin.replace(/"/g, "&quot;") : ""}" required></label>
        <p class="login__err" id="suErr"></p>
        <button class="btn btn--primary" type="submit">Kurulumu tamamla</button>
      </form>`;
      document.body.append(el);
      $su("form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const repo = $su("#suRepo").value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$|\/$/g, "");
        const branch = $su("#suBranch").value.trim() || "main";
        const token = $su("#suTok").value.trim(), pw = $su("#suPw").value;
        const btn = $su("button"); btn.disabled = true; btn.textContent = "Bağlanıyor…";
        try {
          if (pw.length < 4) throw new Error("Şifre en az 4 karakter olmalı");
          gh = { token, repo, branch };
          const r = await api("");
          if (!r.ok) throw new Error(r.status === 404 ? "Depo bulunamadı ya da token'ın bu depoya erişimi yok" : "GitHub hatası: " + r.status);
          const info = await r.json();
          if (!info.permissions?.push) throw new Error("Token'ın bu depoya yazma izni yok");
          if (!(await getFile("data.json"))) throw new Error(`"${branch}" dalında data.json bulunamadı`);
          const vault = await seal(pw, token, repo, branch);
          await putFile(VAULT_PATH, utf8ToB64(JSON.stringify(vault, null, 2)), "Panel kurulumu");
          sessionStorage.setItem("sd-gh", JSON.stringify(gh));
          el.remove();
          resolve(true);
        } catch (err) {
          gh = null;
          $su("#suErr").textContent = err.message;
          btn.disabled = false; btn.textContent = "Kurulumu tamamla";
        }
      });
      function $su(s) { return el.querySelector(s); }
    });
  }

  /* ---------- /api/* karşılıkları ---------- */
  const routes = {
    async "POST /api/login"(body) {
      const { password } = JSON.parse(body || "{}");
      const vault = await readVault();
      if (!vault) {
        await setupDialog(password);
        return json(200, { ok: true, token: "gh" });
      }
      await new Promise((r) => setTimeout(r, 300));
      try {
        gh = { token: await unseal(String(password || ""), vault), repo: vault.repo, branch: vault.branch };
      } catch {
        return json(401, { error: "Şifre yanlış" });
      }
      sessionStorage.setItem("sd-gh", JSON.stringify(gh));
      return json(200, { ok: true, token: "gh" });
    },
    async "POST /api/logout"() {
      gh = null; sessionStorage.removeItem("sd-gh");
      return json(200, { ok: true });
    },
    async "GET /data.json"() {
      // Yayındaki (belki birkaç dakika eski) dosya yerine depodaki son hali
      const f = await getFile("data.json");
      return new Response(b64ToUtf8(f.content), { status: 200, headers: { "Content-Type": "application/json" } });
    },
    async "PUT /api/data"(body) {
      JSON.parse(body); // geçerli JSON mu
      await putFile("data.json", utf8ToB64(JSON.stringify(JSON.parse(body), null, 2)), "Panelden içerik güncellendi");
      return json(200, { ok: true, savedAt: new Date().toISOString() });
    },
    async "POST /api/upload"(body, url) {
      const name = new URL(url, location.href).searchParams.get("name") || "logo.png";
      const ext = (name.match(/\.(png|jpe?g|webp|svg|gif)$/i) || [])[0];
      if (!ext) return json(400, { error: "Sadece PNG, JPG, WEBP, SVG, GIF" });
      const buf = await new Response(body).arrayBuffer();
      if (buf.byteLength > 5 * 1024 * 1024) return json(400, { error: "Dosya 5 MB'tan küçük olmalı" });
      const stem = name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || "logo";
      const path = `logos/${stem}-${Math.floor(Date.now() / 1000)}${ext.toLowerCase()}`;
      let s = ""; const u8 = new Uint8Array(buf);
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
      await putFile(path, btoa(s), "Logo yüklendi");
      return json(200, { ok: true, path, rawUrl: `https://raw.githubusercontent.com/${gh.repo}/${gh.branch}/${path}` });
    },
    async "GET /api/backups"() {
      // Yedekler = data.json'ın GitHub geçmişi
      const r = await api(`commits?path=data.json&sha=${encodeURIComponent(gh.branch)}&per_page=30`);
      if (!r.ok) throw new Error("Geçmiş okunamadı");
      const list = await r.json();
      return json(200, list.slice(1).map((c) => {
        const d = new Date(c.commit.committer.date), p = (n) => String(n).padStart(2, "0");
        return `data-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${c.sha.slice(0, 12)}.json`;
      }));
    },
    async "POST /api/restore"(_b, url) {
      const name = new URL(url, location.href).searchParams.get("name") || "";
      const sha = (name.match(/-([0-9a-f]{7,40})\.json$/) || [])[1];
      if (!sha) return json(404, { error: "Yedek bulunamadı" });
      const f = await getFile("data.json", sha);
      if (!f) return json(404, { error: "Yedek bulunamadı" });
      await putFile("data.json", f.content.replace(/\n/g, ""), "Panelden yedek geri yüklendi");
      return json(200, { ok: true });
    },
    async "POST /api/password"(body) {
      const { current, new: next } = JSON.parse(body || "{}");
      const vault = await readVault();
      try { await unseal(String(current || ""), vault); } catch { return json(400, { error: "Mevcut şifre yanlış" }); }
      if (!next || next.length < 4) return json(400, { error: "Yeni şifre en az 4 karakter olmalı" });
      const nv = await seal(next, gh.token, gh.repo, gh.branch);
      await putFile(VAULT_PATH, utf8ToB64(JSON.stringify(nv, null, 2)), "Panel şifresi değişti");
      return json(200, { ok: true, token: "gh" });
    },
  };

  window.fetch = async (input, opt = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const path = new URL(url, location.href).pathname;
    const method = (opt.method || "GET").toUpperCase();
    const key = `${method} ${path}`;
    const handler = routes[key];
    if (!handler) return realFetch(input, opt);
    if (!gh && key !== "POST /api/login") return json(401, { error: "Oturum gerekli" });
    try {
      return await handler(opt.body, url);
    } catch (e) {
      if (e.auth) { gh = null; sessionStorage.removeItem("sd-gh"); return json(401, { error: e.message }); }
      return json(500, { error: e.message || "Beklenmeyen hata" });
    }
  };
  window.__SD_STATIC__ = true;
})();
