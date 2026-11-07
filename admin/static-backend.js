/*
 * Statik site modu (token yok, sunucu yok).
 * Panel internette açıldığında /api/* isteklerini tarayıcı içinde karşılar:
 *  - Kaydet  → güncel data.json bilgisayara indirilir; GitHub'a yüklenince site güncellenir.
 *  - Logo    → görsel data.json'un içine gömülür (ayrı dosya yüklemek gerekmez).
 *  - Şifre   → özeti data.json içinde ("admin") tutulur; varsayılan 7213.
 * Bilgisayarda (localhost) hiçbir şey yapmaz; orada server.py çalışır.
 */
(() => {
  const LOCAL = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  if (LOCAL && !/[?&]static=1/.test(location.search)) return; // ?static=1: yerelde test için

  const realFetch = window.fetch.bind(window);
  const DEFAULT_PASSWORD = "7213";
  const DRAFT_KEY = "sd-draft";
  let authed = sessionStorage.getItem("sd-static") === "1";
  let live = null;        // yayındaki data.json
  let pendingAuth = null; // değiştirilen şifre, bir sonraki kayıtta data.json'a yazılır

  const json = (code, obj) => new Response(JSON.stringify(obj), { status: code, headers: { "Content-Type": "application/json" } });
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const hash = async (pw, salt) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ":" + pw)));
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
  };

  async function loadLive() {
    const r = await realFetch(`/data.json?t=${Date.now()}`, { cache: "no-store" });
    live = await r.json();
    return live;
  }
  async function checkPassword(pw) {
    const d = live || (await loadLive());
    const a = d.admin;
    if (!a || !a.hash) return pw === DEFAULT_PASSWORD;
    return (await hash(pw, a.salt)) === a.hash;
  }
  function download(text) {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "data.json" });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const fileToDataURL = (blob) => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob);
  });

  const routes = {
    async "POST /api/login"(body) {
      const { password } = JSON.parse(body || "{}");
      await new Promise((r) => setTimeout(r, 300));
      if (!(await checkPassword(String(password || "")))) return json(401, { error: "Şifre yanlış" });
      authed = true; sessionStorage.setItem("sd-static", "1");
      return json(200, { ok: true, token: "static" });
    },
    async "POST /api/logout"() {
      authed = false; sessionStorage.removeItem("sd-static");
      return json(200, { ok: true });
    },
    async "GET /data.json"() {
      const d = await loadLive();
      // İndirilip henüz GitHub'a yüklenmemiş bir taslak varsa onunla devam et
      const draft = store.get(DRAFT_KEY);
      if (draft) {
        try {
          const t = JSON.parse(draft);
          if (JSON.stringify(t.base) === JSON.stringify(d)) {
            window.__SD_DRAFT__ = true;
            return json(200, t.data);
          }
        } catch {}
        store.set(DRAFT_KEY, null); // yayındaki sürüm değişmiş: taslak artık eski
      }
      return json(200, d);
    },
    async "PUT /api/data"(body) {
      const data = JSON.parse(body);
      if (pendingAuth) data.admin = pendingAuth;
      else if (live?.admin) data.admin = live.admin;
      const text = JSON.stringify(data, null, 2);
      download(text);
      store.set(DRAFT_KEY, JSON.stringify({ base: live, data }));
      return json(200, { ok: true, savedAt: new Date().toISOString(), download: true });
    },
    async "POST /api/upload"(body, url) {
      const name = new URL(url, location.href).searchParams.get("name") || "";
      if (!/\.(png|jpe?g|webp|svg|gif)$/i.test(name)) return json(400, { error: "Sadece PNG, JPG, WEBP, SVG, GIF" });
      const blob = body instanceof Blob ? body : new Blob([body]);
      if (blob.size > 400 * 1024) return json(400, { error: "Webden yüklenen logo en fazla 400 KB olabilir (data.json içine gömülür)" });
      return json(200, { ok: true, path: await fileToDataURL(blob) });
    },
    async "GET /api/backups"() {
      return json(200, []);
    },
    async "POST /api/restore"() {
      return json(400, { error: "Webde yedekler GitHub'daki dosya geçmişinden geri alınır" });
    },
    async "POST /api/password"(body) {
      const { current, new: next } = JSON.parse(body || "{}");
      if (!(await checkPassword(String(current || "")))) return json(400, { error: "Mevcut şifre yanlış" });
      if (!next || next.length < 4) return json(400, { error: "Yeni şifre en az 4 karakter olmalı" });
      const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
      pendingAuth = { salt, hash: await hash(next, salt) };
      window.dispatchEvent(new Event("sd-dirty"));
      return json(200, { ok: true, token: "static", needsSave: true });
    },
  };

  window.fetch = async (input, opt = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const path = new URL(url, location.href).pathname;
    const key = `${(opt.method || "GET").toUpperCase()} ${path}`;
    const handler = routes[key];
    if (!handler) return realFetch(input, opt);
    if (!authed && key !== "POST /api/login") return json(401, { error: "Oturum gerekli" });
    try {
      return await handler(opt.body, url);
    } catch (e) {
      return json(500, { error: e.message || "Beklenmeyen hata" });
    }
  };
  window.__SD_STATIC__ = true;
})();
