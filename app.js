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

updateClocks();
setInterval(updateClocks, 1000);
