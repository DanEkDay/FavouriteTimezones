const formatterCache = new Map();
const wheelDigits = [...Array(10).keys(), 0];

function getFormatter(timeZone) {
  if (!formatterCache.has(timeZone)) {
    formatterCache.set(
      timeZone,
      new Intl.DateTimeFormat("nl-NL", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        hourCycle: "h23",
      }),
    );
  }

  return formatterCache.get(timeZone);
}

function getTimeParts(timeZone, now) {
  const parts = getFormatter(timeZone).formatToParts(now);
  const valueByType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    hour: Number(valueByType.hour),
    minute: Number(valueByType.minute),
    second: Number(valueByType.second),
  };
}

function updateClocks() {
  const now = new Date();

  document.querySelectorAll("[data-timezone]").forEach((clockCard) => {
    const timeZone = clockCard.dataset.timezone;
    const display = clockCard.querySelector("[data-time]");

    if (!display) {
      return;
    }

    if (!display.dataset.initialized) {
      display.innerHTML = buildOdometerMarkup();
      display.dataset.initialized = "true";
    }

    updateOdometer(display, getTimeParts(timeZone, now));
  });
}

function buildOdometerMarkup() {
  const wheel = '<span class="odometer-wheel"><span class="odometer-strip">' +
    wheelDigits.map((digit) => `<span>${digit}</span>`).join("") +
    "</span></span>";

  return `
    <div class="odometer-group" aria-live="polite">
      ${wheel}
      ${wheel}
      <span class="odometer-separator" aria-hidden="true">:</span>
      ${wheel}
      ${wheel}
    </div>
  `;
}

function updateOdometer(display, { hour, minute, second }) {
  const wheels = display.querySelectorAll(".odometer-wheel");
  const visibleTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const values = [
    Math.floor(hour / 10),
    hour % 10,
    Math.floor(minute / 10),
    getRollingMinuteDigit(minute, second),
  ];

  wheels.forEach((wheel, index) => {
    wheel.style.setProperty("--offset", values[index]);
  });

  const group = display.querySelector(".odometer-group");
  if (group) {
    group.setAttribute("aria-label", `Lokale tijd ${visibleTime}`);
  }
}

function getRollingMinuteDigit(minute, second) {
  const minuteDigit = minute % 10;
  const progressToNextMinute = second / 60;

  return minuteDigit === 9
    ? 9 + progressToNextMinute
    : minuteDigit + progressToNextMinute;
}

const WEATHER_REFRESH_MS = 15 * 60 * 1000;

function isRoughWeatherForShorts(code) {
  return (
    (code >= 51 && code <= 67) ||
    (code >= 71 && code <= 77) ||
    (code >= 80 && code <= 86) ||
    (code >= 95 && code <= 99)
  );
}

/** Warm genoeg en geen “nat” weer → korte broek kan (kantoordoopje). */
function shortsVerdict(tempC, code) {
  const warmEnough = tempC >= 18;
  const ok = warmEnough && !isRoughWeatherForShorts(code);
  return {
    ok,
    label: ok ? "ja" : "nee",
    aria: ok ? "Korte broek: ja" : "Korte broek: nee",
  };
}

/** Buiten smoker/BBQ: droog en geen onweer (alleen Des Moines / Brent). */
function brentOutdoorSmokeBbqVerdict(code) {
  const bad =
    (code >= 51 && code <= 67) ||
    (code >= 71 && code <= 77) ||
    (code >= 80 && code <= 86) ||
    (code >= 95 && code <= 99);
  const ok = !bad;
  return {
    ok,
    label: ok ? "ja" : "nee",
    aria: ok
      ? "Brent kan buiten smoken en BBQ'en: ja"
      : "Brent kan buiten smoken en BBQ'en: nee",
  };
}

function weatherCodeToNl(code) {
  if (code === 0) return "Heldere lucht";
  if (code === 1) return "Overwegend helder";
  if (code === 2) return "Half bewolkt";
  if (code === 3) return "Bewolkt";
  if (code === 45 || code === 48) return "Mist";
  if (code === 51 || code === 53 || code === 55) return "Motregen";
  if (code === 56 || code === 57) return "IJzel";
  if (code === 61 || code === 63 || code === 65) return "Regen";
  if (code === 66 || code === 67) return "IJzige regen";
  if (code === 71 || code === 73 || code === 75) return "Sneeuw";
  if (code === 77) return "Sneeuwkorrels";
  if (code === 80 || code === 81 || code === 82) return "Buien";
  if (code === 85 || code === 86) return "Sneeuwbuien";
  if (code === 95) return "Onweer";
  if (code === 96 || code === 99) return "Onweer met hagel";
  return "Weer";
}

function celsiusToFahrenheit(c) {
  return (c * 9) / 5 + 32;
}

function formatTemperature(tempC, freedomUnits) {
  if (freedomUnits) {
    const n = Math.round(celsiusToFahrenheit(tempC));
    return `<strong>${n}</strong><span class="clock-freedom-units-label"> Freedom units</span>`;
  }
  return `${Math.round(tempC)}°C`;
}

/** Platte tekst voor aria-label (zonder HTML). */
function formatTemperatureAria(tempC, freedomUnits) {
  if (freedomUnits) {
    return `${Math.round(celsiusToFahrenheit(tempC))} Freedom units`;
  }
  return `${Math.round(tempC)}°C`;
}

function buildWeatherUrl(lat, lon) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,weather_code",
    timezone: "auto",
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

async function fetchWeatherForCard(card) {
  const el = card.querySelector("[data-weather]");
  if (!el) return;

  const lat = Number.parseFloat(card.dataset.lat);
  const lon = Number.parseFloat(card.dataset.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    el.textContent = "";
    el.removeAttribute("aria-label");
    return;
  }

  el.textContent = "Weer laden…";

  try {
    const res = await fetch(buildWeatherUrl(lat, lon));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const temp = data?.current?.temperature_2m;
    const code = data?.current?.weather_code;
    if (!Number.isFinite(temp) || !Number.isFinite(code)) {
      throw new Error("Ontbrekende weergegevens");
    }

    const freedomUnits = card.classList.contains("clock-card--us");
    const desc = weatherCodeToNl(code);
    const tempHtml = formatTemperature(temp, freedomUnits);
    const tempAria = formatTemperatureAria(temp, freedomUnits);
    const shorts = shortsVerdict(temp, code);
    const bbq = card.hasAttribute("data-bbq-brent") ? brentOutdoorSmokeBbqVerdict(code) : null;
    const brentLine = bbq
      ? `
      <span class="clock-bbq clock-bbq--${bbq.ok ? "yes" : "no"}" role="status">
        Brent kan buiten smoken en BBQ'en: <strong>${bbq.label}</strong>
      </span>`
      : "";

    let aria = `Weer: ${tempAria}, ${desc}. ${shorts.aria}`;
    if (bbq) {
      aria += `. ${bbq.aria}`;
    }

    el.innerHTML = `
      <span class="clock-weather-line">
        <span class="clock-weather-temp">${tempHtml}</span>
        <span class="clock-weather-desc">${desc}</span>
      </span>
      <span class="clock-shorts clock-shorts--${shorts.ok ? "yes" : "no"}" role="status">
        Korte broek: <strong>${shorts.label}</strong>
      </span>${brentLine}
    `;
    el.setAttribute("aria-label", aria);
  } catch {
    el.textContent = "Weer niet beschikbaar";
    el.setAttribute("aria-label", "Weer niet beschikbaar");
  }
}

function refreshAllWeather() {
  document.querySelectorAll("[data-timezone][data-lat][data-lon]").forEach((card) => {
    fetchWeatherForCard(card);
  });
}

updateClocks();
setInterval(updateClocks, 1000);

refreshAllWeather();
setInterval(refreshAllWeather, WEATHER_REFRESH_MS);

/* --- VS-vlag: vuurwerk (canvas) --- */

const FIREWORK_PALETTE = ["#ff3355", "#ffffff", "#5eb3ff", "#ffd04a", "#b8f4ff"];

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function createFireworksState() {
  const canvas = document.createElement("canvas");
  canvas.className = "fireworks-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  return {
    canvas,
    ctx,
    particles: [],
    rafId: 0,
    lastBurstAt: 0,
    running: false,
    onResize: null,
  };
}

let fireworksState = null;

function resizeFireworksCanvas(state) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  state.canvas.width = w * dpr;
  state.canvas.height = h * dpr;
  state.canvas.style.width = `${w}px`;
  state.canvas.style.height = `${h}px`;
  state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function spawnBurst(state, cx, cy, count = 72) {
  state.lastBurstAt = Date.now();
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2.2 + Math.random() * 6.5;
    state.particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.2,
      life: 0.92 + Math.random() * 0.28,
      decay: 0.011 + Math.random() * 0.014,
      color: FIREWORK_PALETTE[Math.floor(Math.random() * FIREWORK_PALETTE.length)],
      size: 1.1 + Math.random() * 2.4,
    });
  }
}

function tickFireworks() {
  const state = fireworksState;
  if (!state) return;

  const ctx = state.ctx;
  const w = window.innerWidth;
  const h = window.innerHeight;

  ctx.clearRect(0, 0, w, h);

  const particles = state.particles;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.vy += 0.11;
    p.vx *= 0.992;
    p.x += p.vx;
    p.y += p.vy;
    p.life -= p.decay;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    ctx.globalAlpha = Math.min(1, p.life);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  const quietMs = Date.now() - state.lastBurstAt;
  if (particles.length === 0 && quietMs > 2200) {
    teardownFireworks();
    return;
  }

  state.rafId = requestAnimationFrame(tickFireworks);
}

function teardownFireworks() {
  const state = fireworksState;
  if (!state) return;
  cancelAnimationFrame(state.rafId);
  window.removeEventListener("resize", state.onResize);
  state.canvas.remove();
  fireworksState = null;
}

function launchFireworksFromFlag(anchorX, anchorY) {
  if (prefersReducedMotion()) return;

  let state = fireworksState;
  if (!state) {
    state = createFireworksState();
    fireworksState = state;
    state.onResize = () => resizeFireworksCanvas(state);
    window.addEventListener("resize", state.onResize);
  }

  resizeFireworksCanvas(state);
  state.lastBurstAt = Date.now();

  const w = window.innerWidth;
  const h = window.innerHeight;

  const bursts = [
    [
      anchorX + (Math.random() - 0.5) * 70,
      Math.max(72, anchorY - 90 - Math.random() * 130),
      0,
    ],
    [w * (0.18 + Math.random() * 0.64), h * (0.1 + Math.random() * 0.22), 140],
    [w * (0.12 + Math.random() * 0.76), h * (0.08 + Math.random() * 0.2), 280],
    [w * (0.25 + Math.random() * 0.5), h * (0.12 + Math.random() * 0.18), 420],
  ];

  bursts.forEach(([x, y, delay]) => {
    window.setTimeout(() => {
      if (!fireworksState) return;
      spawnBurst(fireworksState, x, y);
    }, delay);
  });

  if (!state.running) {
    state.running = true;
    tickFireworks();
  }
}

function initUsFlagFireworks() {
  document.querySelectorAll(".clock-card--us .flag-badge").forEach((el) => {
    el.setAttribute("role", "button");
    el.tabIndex = 0;
    const prev = el.getAttribute("aria-label") || el.alt || "Amerikaanse vlag";
    el.setAttribute("aria-label", `${prev}: tik voor vuurwerk`);

    el.addEventListener("click", (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      launchFireworksFromFlag(r.left + r.width / 2, r.top + r.height / 2);
    });

    el.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      launchFireworksFromFlag(r.left + r.width / 2, r.top + r.height / 2);
    });
  });
}

initUsFlagFireworks();
