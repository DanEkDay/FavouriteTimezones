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

    const desc = weatherCodeToNl(code);
    const tempLabel = `${Math.round(temp)}°C`;
    const shorts = shortsVerdict(temp, code);
    const bbq = card.hasAttribute("data-bbq-brent") ? brentOutdoorSmokeBbqVerdict(code) : null;
    const brentLine = bbq
      ? `
      <span class="clock-bbq clock-bbq--${bbq.ok ? "yes" : "no"}" role="status">
        Brent kan buiten smoken en BBQ'en: <strong>${bbq.label}</strong>
      </span>`
      : "";

    let aria = `Weer: ${tempLabel}, ${desc}. ${shorts.aria}`;
    if (bbq) {
      aria += `. ${bbq.aria}`;
    }

    el.innerHTML = `
      <span class="clock-weather-line">
        <span class="clock-weather-temp">${tempLabel}</span>
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
