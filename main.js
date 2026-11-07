(async () => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const pad = (n) => String(n).padStart(2, "0");
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  gsap.registerPlugin(ScrollTrigger);

  /* ---------- Load data ---------- */
  let RAW;
  try {
    RAW = await (await fetch("data.json", { cache: "no-store" })).json();
  } catch (e) {
    document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif;color:#fff">data.json yüklenemedi. Siteyi "python3 server.py" ile açın.</p>';
    return;
  }
  const S = RAW.settings || {};
  const FIELDS = (RAW.customFields || []).filter((f) => f.showOnSite);
  const D = {
    ...S,
    brands: (RAW.brands || []).filter((b) => b.visible !== false).map((b) => ({
      ...b,
      youtube: (b.youtube || []).map((id) => ({ url: `https://youtu.be/${id}`, thumb: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg` })),
      reels: (b.reels || []).map((id) => ({ id })),
    })),
  };

  /* ---------- Static texts from settings ---------- */
  if (S.name) {
    document.title = `${S.name} — Portfolio`;
    $(".hero__sign text").textContent = S.name;
    $(".hero__sign").setAttribute("aria-label", S.name);
  }
  if (S.kicker) $(".hero__kicker").innerHTML = `<span class="dot"></span> ${esc(S.kicker)}`;
  if (S.about) $(".about__text").innerHTML = esc(S.about).replace(/\*(.+?)\*/g, "<em>$1</em>");
  if (S.contactKicker) $(".contact__kicker").textContent = S.contactKicker;
  const ct = $$(".contact__title [data-split]");
  if (S.contactLine1) ct[0].textContent = S.contactLine1;
  if (S.contactLine2) ct[1].textContent = S.contactLine2; else if ("contactLine2" in S) ct[1].remove();
  $(".foot span").textContent = `© ${new Date().getFullYear()} ${S.name || ""}`;

  const SR = RAW.showreel || {};
  const brandOf = (key) => (RAW.brands || []).find((b) => b.key === key);
  const SR_CLIPS = (SR.clips || []).filter((c) => c.id && (!c.brand || brandOf(c.brand)?.visible !== false));
  if (!SR.enabled || !SR_CLIPS.length) $("#showreel").remove();
  else {
    if (SR.title) $("#srTitle").textContent = SR.title;
    if (SR.kicker) $(".sr__kicker").innerHTML = `<i></i> ${esc(SR.kicker)}`;
    if (SR.showBrand === false) $("#srBrand").remove();
  }

  /* ---------- Build DOM from data ---------- */
  const totalReels = D.brands.reduce((s, b) => s + b.reels.length, 0);
  $("#marquee").innerHTML = Array(2).fill(D.brands.map((b) => `<span>${esc(b.title)}</span>`).join("")).join("");
  $("#navLinks").innerHTML = D.brands.map((b) => `<a href="#${esc(b.key)}">${esc(b.title)}</a>`).join("");

  const links = [];
  if (D.email) links.push(`<a href="mailto:${esc(D.email)}" data-magnetic>${esc(D.email)}</a>`);
  if (D.instagram) links.push(`<a class="ghost" href="${esc(D.instagram)}" target="_blank" rel="noopener" data-magnetic>Instagram ↗</a>`);
  if (D.linkedin) links.push(`<a class="ghost" href="${esc(D.linkedin)}" target="_blank" rel="noopener" data-magnetic>LinkedIn ↗</a>`);
  if (D.phone) {
    const num = D.phone.replace(/[^\d+]/g, "");
    links.push(`<a class="ghost" href="https://wa.me/${num.replace("+", "")}" target="_blank" rel="noopener" data-magnetic>WhatsApp ↗</a>`);
    links.push(`<a class="ghost" href="tel:${num}" data-magnetic>${esc(D.phone)}</a>`);
  }
  $("#contactLinks").innerHTML = links.join("");

  $("#brands").innerHTML = D.brands
    .map((b, i) => {
      const yt = b.youtube
        .map(
          (v, j) => `
        <a class="yt__card" data-tilt data-cursor="İZLE" href="${v.url}" data-yt="${v.url}">
          <img src="${v.thumb}" alt="${esc(b.title)} YouTube ${j + 1}" loading="lazy" onerror="if(!this.dataset.f){this.dataset.f=1;this.src=this.src.replace('maxresdefault','hqdefault')}">
          <span class="yt__play">▶</span>
        </a>`
        )
        .join("");
      const reels = b.reels
        .map(
          (r, j) => `
        <div class="phone" data-cursor="OYNAT" data-reel="${esc(r.id)}">
          <span class="phone__notch"></span>
          <div class="phone__screen"><div class="phone__skel"></div></div>
          <button class="phone__hit" aria-label="${esc(b.title)} reel ${j + 1} oynat">
            <span class="phone__idx">${pad(j + 1)}</span><span class="phone__ig">Reel</span>
          </button>
        </div>`
        )
        .join("");
      const extra = FIELDS.map((f) => {
        const v = (b.fields || {})[f.key];
        if (v === undefined || v === "" || v === false) return "";
        if (f.type === "url") return `<a class="pill" href="${esc(v)}" target="_blank" rel="noopener">${esc(f.label)} ↗</a>`;
        if (f.type === "checkbox") return `<span class="pill">${esc(f.label)}</span>`;
        return `<span class="pill"><i class="pill__k">${esc(f.label)}</i> ${esc(v)}</span>`;
      }).join("");
      return `
      <section class="brand" id="${esc(b.key)}" style="--accent:${esc(b.color || "#ff2d3d")}">
        <div class="brand__head">
          ${b.logo ? `<span class="brand__num brand__logo"><img src="${esc(b.logo)}" alt="${esc(b.title)} logosu" loading="lazy"></span>` : `<span class="brand__num brand__logo brand__logo--txt">${esc((b.title || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toLocaleUpperCase("tr"))}</span>`}
          <h2 class="brand__title" data-split>${esc(b.title)}</h2>
          <div class="brand__info">
            ${b.tag ? `<span class="pill pill--accent">${esc(b.tag)}</span>` : ""}
            ${yt ? `<button type="button" class="pill pill--jump" data-jump="yt">YouTube ↓</button>` : ""}
            ${reels ? `<button type="button" class="pill pill--jump" data-jump="ig">Instagram ↓</button>` : ""}
            ${extra}
            ${b.note ? `<span class="brand__note">${esc(b.note)}</span>` : ""}
          </div>
        </div>
        ${yt ? `<div class="brand__label" data-anchor="yt"><b>▶</b> YouTube</div><div class="yt">${yt}</div>` : ""}
        ${reels ? `<div class="brand__label" data-anchor="ig"><b>●</b> Instagram Reels · ${b.reels.length}</div>
        <div class="reels"><div class="reels__track">${reels}
          <div class="reels__end"><b>${pad(b.reels.length)}</b><span>${esc(b.title)} için<br>üretilen reel</span></div>
        </div></div>` : ""}
      </section>`;
    })
    .join("");

  /* ---------- Split text into chars ---------- */
  $$("[data-split]").forEach((el) => {
    const words = el.textContent.trim().split(" ");
    el.innerHTML = words
      .map((w) => `<span class="char-wrap">${[...w].map((c) => `<span class="char">${c}</span>`).join("")}</span>`)
      .join(" ");
  });
  $$("[data-reveal-words]").forEach((el) => {
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((t) => {
            if (!t.trim()) return frag.append(t);
            const s = document.createElement("span");
            s.className = "w";
            s.textContent = t;
            frag.append(s);
          });
          n.replaceWith(frag);
        } else walk(n);
      });
    };
    walk(el);
  });

  /* ---------- Smooth scroll ---------- */
  const lenis = new Lenis({ lerp: 0.09, smoothWheel: !reduce });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();
  $$('a[href^="#"]').forEach((a) =>
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if (id.length < 2 || a.dataset.yt) return;
      const t = document.getElementById(id.slice(1));
      if (!t) return;
      e.preventDefault();
      lenis.scrollTo(t, { duration: 1.6 });
    })
  );

  /* ---------- Hero stats ---------- */
  const STATS = (S.stats || [
    { mode: "reels", suffix: "+", label: "Reel & kısa video" },
    { mode: "brands", label: "Marka & kulüp" },
    { mode: "custom", value: "2026", label: "Sezon" },
  ]).map((s) => {
    const raw = s.mode === "reels" ? totalReels : s.mode === "brands" ? D.brands.length : String(s.value ?? "").trim();
    const num = typeof raw === "number" ? raw : /^\d+$/.test(raw) && raw.length < 4 ? Number(raw) : null;
    return { num, text: String(raw), suffix: s.suffix || "", label: s.label || "" };
  });
  const metaEl = $(".hero__meta");
  metaEl.innerHTML = STATS.map((s, i) => `<div><b id="stat${i}">${s.num !== null ? "0" : esc(s.text + s.suffix)}</b><span>${esc(s.label)}</span></div>`).join("");
  if (!STATS.length) metaEl.remove();

  /* ---------- Preloader → hero intro ---------- */
  document.body.classList.add("loading");
  const counter = { v: 0 };
  const intro = gsap.timeline({ paused: true });
  intro
    .from(".hero .hero__word .char", { yPercent: 110, rotate: 8, duration: 1.1, stagger: 0.05, ease: "expo.out" })
    .to(".hero__sign text", { strokeDashoffset: 0, duration: 2.2, ease: "power2.inOut", onComplete: () => $(".hero__sign").classList.add("is-filled") }, "-=0.6")
    .from(".hero__kicker, .hero__meta > div, .hero__scroll", { y: 30, opacity: 0, stagger: 0.08, duration: 0.8, ease: "power3.out" }, "<0.2")
    .from(".nav", { yPercent: -100, opacity: 0, duration: 0.8, ease: "power3.out" }, "<")
    .add(() => STATS.forEach((s, i) => s.num !== null && countUp("#stat" + i, s.num, s.suffix)), "<");

  gsap.timeline()
    .to(counter, { v: 100, duration: reduce ? 0.2 : 1.8, ease: "power2.inOut", onUpdate: () => {
      $("#loaderNum").textContent = Math.round(counter.v);
      $("#loaderBar").style.width = counter.v + "%";
    } })
    .to("#wipe", { scaleY: 1, duration: 0.6, ease: "power4.inOut" })
    .set("#loader", { display: "none" })
    .to("#wipe", { scaleY: 0, transformOrigin: "top", duration: 0.7, ease: "power4.inOut" })
    .add(() => {
      document.body.classList.remove("loading");
      lenis.start();
      intro.play();
    }, "-=0.35");

  function countUp(sel, to, suffix = "") {
    const o = { v: 0 };
    gsap.to(o, { v: to, duration: 1.6, ease: "power3.out", onUpdate: () => ($(sel).textContent = Math.round(o.v) + suffix) });
  }

  /* ---------- Scroll animations ---------- */
  gsap.to("#progress", { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: 0.3 } });

  // hero parallax out
  gsap.to(".hero__title", { yPercent: 40, scale: 0.9, opacity: 0.2, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
  gsap.to(".hero__sign", { yPercent: -60, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });

  // marquee: base loop + velocity skew/boost
  const mq = gsap.to("#marquee", { xPercent: -50, duration: 28, ease: "none", repeat: -1 });
  let skewTo = gsap.quickTo("#marquee", "skewX", { duration: 0.4 });
  lenis.on("scroll", ({ velocity }) => {
    const v = gsap.utils.clamp(-20, 20, velocity);
    skewTo(-v * 0.6);
    mq.timeScale(1 + Math.abs(v) * 0.25 * (v < 0 ? -1 : 1));
  });

  // about: words light up
  gsap.to(".about__text .w", {
    opacity: 1, stagger: 0.1, ease: "none",
    scrollTrigger: { trigger: ".about", start: "top 75%", end: "bottom 60%", scrub: true },
  });

  // reels: pinned horizontal scroll on desktop
  const mm = gsap.matchMedia();
  mm.add("(min-width: 761px)", () => {
    $$(".reels").forEach((wrap) => {
      const track = $(".reels__track", wrap);
      const dist = () => Math.max(0, track.scrollWidth - innerWidth);
      if (dist() < 40) return;
      gsap.to(track, {
        x: () => -dist(), ease: "none",
        scrollTrigger: { trigger: wrap, start: "center center", end: () => "+=" + dist(), pin: true, scrub: 0.8, invalidateOnRefresh: true, anticipatePin: 1 },
      });
      gsap.from($$(".phone", track), { y: 120, rotate: (i) => (i % 2 ? 4 : -4), opacity: 0, stagger: 0.05, duration: 1, ease: "power3.out", scrollTrigger: { trigger: wrap, start: "top 85%" } });
    });
  });

  // brand titles + numbers
  $$(".brand").forEach((sec) => {
    gsap.from($$(".brand__title .char", sec), {
      yPercent: 120, rotate: 6, stagger: 0.025, duration: 1, ease: "expo.out",
      scrollTrigger: { trigger: sec, start: "top 75%" },
    });
    gsap.from($(".brand__num", sec), { xPercent: -40, opacity: 0, duration: 1.2, ease: "expo.out", scrollTrigger: { trigger: sec, start: "top 75%" } });
    gsap.from($$(".pill, .brand__note", sec), { y: 20, opacity: 0, stagger: 0.06, duration: 0.6, scrollTrigger: { trigger: sec, start: "top 70%" } });
    gsap.from($$(".yt__card", sec), {
      y: 80, opacity: 0, rotateX: -25, stagger: 0.08, duration: 1, ease: "power3.out",
      scrollTrigger: { trigger: $(".yt", sec) || sec, start: "top 85%" },
    });

    // body accent color follows active brand
    ScrollTrigger.create({
      trigger: sec, start: "top 50%", end: "bottom 50%",
      onToggle: (self) => {
        if (!self.isActive) return;
        const c = getComputedStyle(sec).getPropertyValue("--accent");
        document.documentElement.style.setProperty("--red", c.trim());
        $$("#navLinks a").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + sec.id));
      },
    });
  });
  ScrollTrigger.create({ trigger: ".hero", start: "top top", end: "bottom 50%", onEnterBack: () => document.documentElement.style.setProperty("--red", "#ff2d3d") });
  ScrollTrigger.create({ trigger: ".contact", start: "top 60%", onEnter: () => document.documentElement.style.setProperty("--red", "#ff2d3d") });

  // contact
  gsap.from(".contact__title .char", { yPercent: 120, stagger: 0.04, duration: 1.1, ease: "expo.out", scrollTrigger: { trigger: ".contact", start: "top 60%" } });

  /* ---------- Lazy-load reel previews ---------- */
  // Embeds are heavy (each one is a full Instagram page). Only keep the ones
  // near the viewport alive, load them one at a time, and tear them down
  // once they scroll away so memory and CPU stay flat.
  const MAX_PARALLEL = 2;
  let loading = 0;
  const queue = [];
  const pump = () => {
    while (loading < MAX_PARALLEL && queue.length) {
      const ph = queue.shift();
      if (!ph._want || $("iframe", ph)) continue;
      loading++;
      const f = document.createElement("iframe");
      f.title = "Instagram reel";
      f.tabIndex = -1;
      f.src = `https://www.instagram.com/reel/${ph.dataset.reel}/embed/`;
      const done = () => { loading = Math.max(0, loading - 1); pump(); };
      f.onload = () => { ph.classList.add("is-loaded"); done(); };
      setTimeout(() => { if (!ph.classList.contains("is-loaded")) done(); }, 6000);
      $(".phone__screen", ph).append(f);
    }
  };
  const unload = (ph) => {
    $("iframe", ph)?.remove();
    ph.classList.remove("is-loaded");
  };
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      const ph = e.target;
      clearTimeout(ph._t);
      ph._want = e.isIntersecting;
      // short delay so fast scrolling past a section doesn't spawn embeds
      ph._t = e.isIntersecting
        ? setTimeout(() => { queue.push(ph); pump(); }, 250)
        : setTimeout(() => unload(ph), 1500);
    }),
    { rootMargin: "100px 250px" }
  );
  $$(".phone").forEach((p) => io.observe(p));

  /* ---------- Modal ---------- */
  const modal = $("#modal"), body = $("#modalBody");
  const open = (html, wide, reel) => {
    body.innerHTML = html;
    body.classList.toggle("is-wide", !!wide);
    body.classList.toggle("is-reel", !!reel);
    modal.classList.add("is-open");
    lenis.stop();
    gsap.to(modal, { opacity: 1, duration: 0.35 });
    gsap.fromTo(body, { scale: 0.85, y: 40 }, { scale: 1, y: 0, duration: 0.6, ease: "expo.out" });
  };
  const close = () => {
    gsap.to(modal, { opacity: 0, duration: 0.3, onComplete: () => { modal.classList.remove("is-open"); body.innerHTML = ""; } });
    lenis.start();
  };
  $("#modalClose").onclick = close;
  modal.addEventListener("click", (e) => e.target === modal && close());
  addEventListener("keydown", (e) => e.key === "Escape" && modal.classList.contains("is-open") && close());

  document.addEventListener("click", (e) => {
    const jb = e.target.closest("[data-jump]");
    if (jb) {
      const t = jb.closest(".brand")?.querySelector(`[data-anchor="${jb.dataset.jump}"]`);
      if (t) lenis.scrollTo(t, { offset: -110, duration: 1.2 });
      return;
    }
    const ph = e.target.closest(".phone");
    if (ph) return open(`<iframe src="https://www.instagram.com/reel/${ph.dataset.reel}/embed/" allow="autoplay; encrypted-media; fullscreen" allowfullscreen scrolling="no"></iframe>`, false, true);
    const yt = e.target.closest("[data-yt]");
    if (yt) {
      const m = yt.dataset.yt.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/);
      if (!m) return;
      e.preventDefault();
      open(`<iframe src="https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1&rel=0" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`, true);
    }
  });

  /* ---------- Showreel: plays short moments from YouTube work back to back ---------- */
  if ($("#showreel")) {
    const frame = $(".sr__frame"), wipe = $("#srWipe"), brandEl = $("#srBrand");
    const bars = $("#srBars"), soundBtn = $("#srSound"), playBtn = $("#srPlay");
    const N = SR_CLIPS.length;
    $("#srTotal").textContent = pad(N);
    bars.innerHTML = SR_CLIPS.map(() => "<i><b></b></i>").join("");
    const fills = $$("b", bars);

    let player, ready = false, inView = false, i = 0, timer, barTween, waitingFor = -1, muted = true, started = false;

    const colorOf = (c) => brandOf(c.brand)?.color || "#ff2d3d";
    const setHud = (n) => {
      const c = SR_CLIPS[n], b = brandOf(c.brand);
      frame.style.setProperty("--c", colorOf(c));
      $("#srIdx").textContent = pad(n + 1);
      if (!brandEl.isConnected) return;
      brandEl.innerHTML = b ? `<small>${esc(b.tag || "")}</small><span>${esc(b.title)}</span>` : "";
      gsap.fromTo(brandEl.querySelector("span"), { yPercent: 110 }, { yPercent: 0, duration: 0.8, ease: "expo.out" });
      fills.forEach((f, k) => gsap.set(f, { scaleX: k < n ? 1 : 0 }));
    };

    const stop = () => {
      clearTimeout(timer);
      barTween?.kill();
      waitingFor = -1;
      if (ready) player.pauseVideo();
    };

    const go = (n) => {
      if (!ready || !inView) return;
      stop();
      i = ((n % N) + N) % N;
      const c = SR_CLIPS[i];
      setHud(i);
      gsap.to(wipe, {
        scaleX: 1, transformOrigin: "left", duration: started ? 0.45 : 0, ease: "power4.inOut",
        onComplete: () => {
          waitingFor = i;
          player.loadVideoById({ videoId: c.id, startSeconds: +c.start || 0, endSeconds: (+c.start || 0) + (+c.dur || 4) + 1 });
          // if autoplay is blocked, offer a manual play button
          timer = setTimeout(() => { if (waitingFor === i) playBtn.hidden = false; }, 4000);
        },
      });
    };

    const onPlaying = () => {
      if (waitingFor !== i) return;
      try { player.unloadModule("captions"); player.unloadModule("cc"); } catch {}
      waitingFor = -1;
      started = true;
      playBtn.hidden = true;
      clearTimeout(timer);
      const dur = +SR_CLIPS[i].dur || 4;
      gsap.to(wipe, { scaleX: 0, transformOrigin: "right", duration: 0.55, ease: "power4.inOut" });
      barTween = gsap.fromTo(fills[i], { scaleX: 0 }, { scaleX: 1, duration: dur, ease: "none" });
      timer = setTimeout(() => go(i + 1), dur * 1000);
    };

    const boot = () => {
      player = new YT.Player("srPlayer", {
        host: "https://www.youtube-nocookie.com",
        width: "100%", height: "100%",
        playerVars: { autoplay: 0, mute: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, playsinline: 1, iv_load_policy: 3, modestbranding: 1, cc_load_policy: 0, cc_lang_pref: "xx" },
        events: {
          onReady: () => { ready = true; player.mute(); if (inView) go(i); },
          onStateChange: (e) => { if (e.data === YT.PlayerState.PLAYING) onPlaying(); },
          onError: () => go(i + 1), // skip clips that can't be embedded
        },
      });
    };

    // load the YouTube API only when the reel is about to be seen
    let apiRequested = false;
    const loadApi = () => {
      if (apiRequested) return;
      apiRequested = true;
      if (window.YT?.Player) return boot();
      window.onYouTubeIframeAPIReady = boot;
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.append(s);
    };
    new IntersectionObserver(([e]) => { if (e.isIntersecting) loadApi(); }, { rootMargin: "800px 0px" }).observe(frame);
    new IntersectionObserver(([e]) => {
      inView = e.isIntersecting;
      if (inView) go(i); else stop();
    }, { threshold: 0.35 }).observe(frame);
    document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else if (inView) go(i); });

    soundBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      muted = !muted;
      if (ready) muted ? player.mute() : (player.unMute(), player.setVolume(80));
      soundBtn.setAttribute("aria-pressed", String(!muted));
      $("em", soundBtn).textContent = muted ? "Sesi aç" : "Sesi kapat";
    });
    playBtn.addEventListener("click", (e) => { e.stopPropagation(); playBtn.hidden = true; if (ready) { player.playVideo(); } });
    frame.addEventListener("click", () => {
      const c = SR_CLIPS[i];
      stop();
      open(`<iframe src="https://www.youtube-nocookie.com/embed/${c.id}?autoplay=1&rel=0&start=${Math.floor(+c.start || 0)}" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`, true);
    });
    $("#modalClose").addEventListener("click", () => inView && setTimeout(() => go(i), 350));

    gsap.from(".sr__title .char", { yPercent: 120, stagger: 0.04, duration: 1, ease: "expo.out", scrollTrigger: { trigger: "#showreel", start: "top 75%" } });
    gsap.fromTo(frame, { scale: 0.86, borderRadius: 60 }, { scale: 1, borderRadius: 24, ease: "none", scrollTrigger: { trigger: frame, start: "top bottom", end: "top 25%", scrub: true } });
  }

  /* ---------- Cursor, tilt, magnetic ---------- */
  if (matchMedia("(hover: hover)").matches) {
    const cur = $("#cursor"), lab = $("#cursorLabel");
    const xTo = gsap.quickTo(cur, "x", { duration: 0.25, ease: "power3" });
    const yTo = gsap.quickTo(cur, "y", { duration: 0.25, ease: "power3" });
    addEventListener("pointermove", (e) => { xTo(e.clientX); yTo(e.clientY); });
    document.addEventListener("pointerover", (e) => {
      const t = e.target.closest("[data-cursor]");
      cur.classList.toggle("is-big", !!t);
      lab.textContent = t ? t.dataset.cursor : "";
    });

    $$("[data-tilt]").forEach((el) => {
      const rx = gsap.quickTo(el, "rotateX", { duration: 0.5, ease: "power3.out" });
      const ry = gsap.quickTo(el, "rotateY", { duration: 0.5, ease: "power3.out" });
      let rect;
      el.addEventListener("pointerenter", () => (rect = el.getBoundingClientRect()));
      el.addEventListener("pointermove", (e) => {
        rect ||= el.getBoundingClientRect();
        ry(((e.clientX - rect.left) / rect.width - 0.5) * 14);
        rx(-((e.clientY - rect.top) / rect.height - 0.5) * 14);
      });
      el.addEventListener("pointerleave", () => { rect = null; rx(0); ry(0); });
    });

    $$("[data-magnetic]").forEach((el) => {
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        gsap.to(el, { x: (e.clientX - r.left - r.width / 2) * 0.35, y: (e.clientY - r.top - r.height / 2) * 0.35, duration: 0.4 });
      });
      el.addEventListener("pointerleave", () => gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: "elastic.out(1,0.4)" }));
    });
  }

  addEventListener("load", () => ScrollTrigger.refresh());
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
})();
