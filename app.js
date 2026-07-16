/* =========================================================
   AppSurf PR – condições de surf no litoral do Paraná
   Fonte de dados: Open-Meteo Marine API (ondulação + maré) + Forecast API (vento)
   ========================================================= */

const CITIES = [
  {
    id: "matinhos",
    name: "Matinhos",
    spots: [
      { id: "pico-matinhos", name: "Pico de Matinhos (Praia Central)", lat: -25.8203, lon: -48.5344, shoreNormal: 105, idealTidePercent: 50, tideTolerance: 38 },
      { id: "brava-matinhos", name: "Praia Brava de Matinhos", lat: -25.8590, lon: -48.5500, shoreNormal: 115, idealTidePercent: 50, tideTolerance: 38 },
    ],
  },
  {
    id: "ilha-do-mel",
    name: "Ilha do Mel",
    spots: [
      { id: "praia-grande", name: "Praia Grande (face oceânica)", lat: -25.5606, lon: -48.3220, shoreNormal: 130, idealTidePercent: 50, tideTolerance: 38 },
      { id: "farol-conchas", name: "Farol das Conchas", lat: -25.5967, lon: -48.3013, shoreNormal: 140, idealTidePercent: 55, tideTolerance: 38 },
      { id: "nova-brasilia", name: "Nova Brasília (baía)", lat: -25.5261, lon: -48.3346, shoreNormal: 300, idealTidePercent: 50, tideTolerance: 38 },
    ],
  },
];

const RATINGS = [
  { key: "otimo", label: "Ótimo", min: 78, color: "var(--otimo)" },
  { key: "bom", label: "Bom", min: 58, color: "var(--bom)" },
  { key: "razoavel", label: "Razoável", min: 38, color: "var(--razoavel)" },
  { key: "ruim", label: "Ruim", min: 18, color: "var(--ruim)" },
  { key: "pessimo", label: "Péssimo", min: -1, color: "var(--pessimo)" },
];

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

let state = {
  cityId: CITIES[0].id,
  spotId: CITIES[0].spots[0].id,
  data: null,
  selectedTime: null,
};

// ---------- scoring ----------

function angleDiff(a, b) {
  let d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function scoreWaveHeight(h) {
  if (h == null) return 50;
  if (h < 0.3) return 15;
  if (h < 0.5) return 40;
  if (h < 0.8) return 75;
  if (h <= 1.6) return 100;
  if (h <= 2.0) return 78;
  if (h <= 2.6) return 50;
  return 20;
}

function scorePeriod(p) {
  if (p == null) return 50;
  if (p < 5) return 25;
  if (p < 7) return 55;
  if (p < 9) return 80;
  if (p < 12) return 100;
  return 90;
}

function scoreWind(speed, dir, shoreNormal) {
  if (speed == null || dir == null) return 50;
  const offshoreDir = (shoreNormal + 180) % 360;
  const diffOffshore = angleDiff(dir, offshoreDir);
  let directionFactor;
  if (diffOffshore <= 45) directionFactor = 1; // offshore
  else if (diffOffshore <= 100) directionFactor = 0.55; // cross-shore
  else directionFactor = 0; // onshore

  let speedPenalty;
  if (speed < 10) speedPenalty = 1;
  else if (speed < 20) speedPenalty = 0.8;
  else if (speed < 30) speedPenalty = 0.55;
  else speedPenalty = 0.3;

  if (directionFactor === 0) {
    if (speed < 10) return 55;
    if (speed < 20) return 30;
    return 10;
  }
  return Math.round(40 + 60 * directionFactor * speedPenalty);
}

// Pontuação de maré: compara a altura da hora com a amplitude do próprio dia,
// verificando o quão perto está da posição "ideal" do pico dentro dessa faixa
// (0% = baixa-mar do dia, 100% = preamar do dia). O padrão é meia-maré (50%),
// um ponto de partida razoável para praia de banco de areia – até termos
// relatos suficientes da comunidade para calibrar isso pico a pico.
function scoreTide(height, dayMin, dayMax, idealPercent, tolerance) {
  if (height == null || dayMin == null || dayMax == null) return 60;
  const range = dayMax - dayMin;
  if (range < 0.3) return 65; // maré de quadratura, pouca variação – fator menos decisivo
  const pct = ((height - dayMin) / range) * 100;
  const diff = Math.abs(pct - idealPercent);
  if (diff <= tolerance * 0.4) return 100;
  if (diff <= tolerance) return 72;
  if (diff <= tolerance * 1.7) return 45;
  return 25;
}

function ratingFor(score) {
  return RATINGS.find((r) => score >= r.min);
}

// ---------- data fetching ----------

async function fetchSpotData(spot) {
  const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${spot.lat}&longitude=${spot.lon}&hourly=wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,swell_wave_direction,sea_surface_temperature,sea_level_height_msl&timezone=America%2FSao_Paulo&forecast_days=6`;
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${spot.lat}&longitude=${spot.lon}&hourly=wind_speed_10m,wind_direction_10m,temperature_2m&timezone=America%2FSao_Paulo&forecast_days=6`;

  const [marineRes, weatherRes] = await Promise.all([fetch(marineUrl), fetch(weatherUrl)]);
  if (!marineRes.ok || !weatherRes.ok) throw new Error("Falha ao consultar previsão");
  const marine = await marineRes.json();
  const weather = await weatherRes.json();

  const times = marine.hourly.time;
  const hours = times.map((t, i) => ({
    time: t,
    waveHeight: marine.hourly.wave_height?.[i] ?? null,
    wavePeriod: marine.hourly.wave_period?.[i] ?? null,
    waveDir: marine.hourly.wave_direction?.[i] ?? null,
    swellHeight: marine.hourly.swell_wave_height?.[i] ?? null,
    swellPeriod: marine.hourly.swell_wave_period?.[i] ?? null,
    swellDir: marine.hourly.swell_wave_direction?.[i] ?? null,
    seaTemp: marine.hourly.sea_surface_temperature?.[i] ?? null,
    tideHeight: marine.hourly.sea_level_height_msl?.[i] ?? null,
    windSpeed: weather.hourly.wind_speed_10m?.[i] ?? null,
    windDir: weather.hourly.wind_direction_10m?.[i] ?? null,
    airTemp: weather.hourly.temperature_2m?.[i] ?? null,
  }));

  // amplitude de maré por dia, usada para normalizar a pontuação de maré
  const dayTideRange = {};
  hours.forEach((h) => {
    if (h.tideHeight == null) return;
    const day = h.time.slice(0, 10);
    if (!dayTideRange[day]) dayTideRange[day] = { min: h.tideHeight, max: h.tideHeight };
    else {
      dayTideRange[day].min = Math.min(dayTideRange[day].min, h.tideHeight);
      dayTideRange[day].max = Math.max(dayTideRange[day].max, h.tideHeight);
    }
  });

  hours.forEach((h) => {
    const day = h.time.slice(0, 10);
    const range = dayTideRange[day] || {};
    const sW = scoreWaveHeight(h.swellHeight ?? h.waveHeight);
    const sP = scorePeriod(h.swellPeriod ?? h.wavePeriod);
    const sWind = scoreWind(h.windSpeed, h.windDir, spot.shoreNormal);
    const sTide = scoreTide(h.tideHeight, range.min, range.max, spot.idealTidePercent ?? 50, spot.tideTolerance ?? 38);
    h.subScores = { wave: sW, period: sP, wind: sWind, tide: sTide };
    h.score = Math.round(sW * 0.28 + sP * 0.2 + sWind * 0.37 + sTide * 0.15);
    h.rating = ratingFor(h.score);
  });

  return hours;
}

// ---------- helpers ----------

function windCompass(deg) {
  if (deg == null) return "–";
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

function fmtHour(iso) {
  return iso.slice(11, 16);
}

function isSameDay(iso, dateObj) {
  return iso.slice(0, 10) === dateObj.toISOString().slice(0, 10);
}

function groupByDay(hours) {
  const map = new Map();
  hours.forEach((h) => {
    const day = h.time.slice(0, 10);
    if (!map.has(day)) map.set(day, []);
    map.get(day).push(h);
  });
  return Array.from(map.entries());
}

function nowIsoHour() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

function fmtNum(v) {
  if (v == null) return "–";
  return Math.round(v * 10) / 10;
}

// encontra os picos e vales de maré do dia (preamares e baixa-mares), a partir
// de dados horários – aproximação razoável para exibir os horários do dia
function findTideExtremes(dayHours) {
  const pts = dayHours.filter((h) => h.tideHeight != null);
  const extremes = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1].tideHeight;
    const cur = pts[i].tideHeight;
    const next = pts[i + 1].tideHeight;
    if (cur >= prev && cur >= next && (cur > prev || cur > next)) {
      extremes.push({ time: pts[i].time, height: cur, type: "high" });
    } else if (cur <= prev && cur <= next && (cur < prev || cur < next)) {
      extremes.push({ time: pts[i].time, height: cur, type: "low" });
    }
  }
  return extremes;
}

function tideTrend(hours, idx) {
  if (idx < 0 || idx >= hours.length - 1) return null;
  const cur = hours[idx].tideHeight;
  const next = hours[idx + 1].tideHeight;
  if (cur == null || next == null) return null;
  if (next > cur + 0.01) return "subindo";
  if (next < cur - 0.01) return "descendo";
  return "estável";
}

const TREND_ARROW = { subindo: "↑", descendo: "↓", estável: "→" };

// ---------- rendering ----------

function renderTabs() {
  const cityWrap = document.getElementById("cityTabs");
  cityWrap.innerHTML = "";
  CITIES.forEach((city) => {
    const btn = document.createElement("button");
    btn.className = "tab-btn" + (city.id === state.cityId ? " active" : "");
    btn.textContent = city.name;
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", city.id === state.cityId);
    btn.onclick = () => {
      state.cityId = city.id;
      state.spotId = city.spots[0].id;
      state.selectedTime = null;
      renderTabs();
      loadAndRender();
    };
    cityWrap.appendChild(btn);
  });

  const spotWrap = document.getElementById("spotPills");
  spotWrap.innerHTML = "";
  const city = CITIES.find((c) => c.id === state.cityId);
  city.spots.forEach((spot) => {
    const btn = document.createElement("button");
    btn.className = "spot-btn" + (spot.id === state.spotId ? " active" : "");
    btn.textContent = spot.name;
    btn.onclick = () => {
      state.spotId = spot.id;
      state.selectedTime = null;
      renderTabs();
      loadAndRender();
    };
    spotWrap.appendChild(btn);
  });
}

function currentSpot() {
  const city = CITIES.find((c) => c.id === state.cityId);
  return city.spots.find((s) => s.id === state.spotId);
}

function renderHero(hours) {
  const hero = document.getElementById("heroSection");
  const nowKey = nowIsoHour();
  let idx = hours.findIndex((h) => h.time === nowKey);
  if (idx === -1) idx = hours.findIndex((h) => h.time > nowKey);
  if (idx === -1) idx = 0;
  const current = hours[idx];

  const spot = currentSpot();
  const r = current.rating;
  const trend = tideTrend(hours, idx);

  hero.innerHTML = `
    <div class="hero-grid">
      <div class="rating-badge" style="--rc:${r.color}">
        <div class="r-label">${r.label}</div>
        <div class="r-score">${current.score}/100</div>
        <div class="r-now">agora · ${fmtHour(current.time)}</div>
      </div>
      <div class="hero-details">
        <h3>${spot.name}</h3>
        <p class="hero-sub">Condição atual estimada com base em ondulação, vento e maré</p>
        <div class="stat-row">
          <div class="stat"><p class="s-label">Altura</p><p class="s-value">${fmtNum(current.swellHeight ?? current.waveHeight)}<small>m</small></p></div>
          <div class="stat"><p class="s-label">Período</p><p class="s-value">${fmtNum(current.swellPeriod ?? current.wavePeriod)}<small>s</small></p></div>
          <div class="stat"><p class="s-label">Direção</p><p class="s-value">${windCompass(current.swellDir ?? current.waveDir)}</p></div>
          <div class="stat"><p class="s-label">Vento</p><p class="s-value">${fmtNum(current.windSpeed)}<small>km/h</small></p></div>
          <div class="stat"><p class="s-label">Vento de</p><p class="s-value">${windCompass(current.windDir)}</p></div>
          <div class="stat"><p class="s-label">Maré</p><p class="s-value">${fmtNum(current.tideHeight)}<small>m</small>${trend ? ` <span class="tide-arrow tide-${trend}">${TREND_ARROW[trend]}</span>` : ""}</p></div>
          <div class="stat"><p class="s-label">Água</p><p class="s-value">${current.seaTemp != null ? fmtNum(current.seaTemp) + "°" : "–"}</p></div>
        </div>
      </div>
    </div>
  `;
}

function renderLegend() {
  const el = document.getElementById("legendList");
  el.innerHTML = RATINGS.map(
    (r) => `<li><span class="dot" style="background:${r.color}"></span>${r.label}</li>`
  ).join("");
}

function renderTideExtremes(todayHours) {
  const el = document.getElementById("tideExtremes");
  if (!el) return;
  const extremes = findTideExtremes(todayHours);
  if (!extremes.length) {
    el.innerHTML = `<span class="tide-empty">Sem dados de maré suficientes para hoje.</span>`;
    return;
  }
  el.innerHTML = extremes
    .map(
      (e) =>
        `<span class="tide-chip tide-chip-${e.type}">${e.type === "high" ? "▲ Preamar" : "▼ Baixa-mar"} ${fmtHour(e.time)} · ${fmtNum(e.height)}m</span>`
    )
    .join("");
}

function renderHourDetail(hours, h) {
  const el = document.getElementById("hourDetail");
  if (!el) return;
  const r = h.rating;
  const idx = hours.findIndex((x) => x.time === h.time);
  const trend = tideTrend(hours, idx);
  el.style.setProperty("--rc", r.color);
  el.innerHTML = `
    <div class="hd-head">
      <p class="hd-title">${fmtHour(h.time)} · <b>${r.label}</b> <span class="mono" style="color:var(--foam-dimmer);font-size:0.8rem;">(${h.score}/100)</span></p>
      <button class="hd-close" type="button" aria-label="Fechar detalhes">×</button>
    </div>
    <div class="stat-row">
      <div class="stat"><p class="s-label">Altura</p><p class="s-value">${fmtNum(h.swellHeight ?? h.waveHeight)}<small>m</small></p></div>
      <div class="stat"><p class="s-label">Período</p><p class="s-value">${fmtNum(h.swellPeriod ?? h.wavePeriod)}<small>s</small></p></div>
      <div class="stat"><p class="s-label">Direção</p><p class="s-value">${windCompass(h.swellDir ?? h.waveDir)}</p></div>
      <div class="stat"><p class="s-label">Vento</p><p class="s-value">${fmtNum(h.windSpeed)}<small>km/h</small></p></div>
      <div class="stat"><p class="s-label">Vento de</p><p class="s-value">${windCompass(h.windDir)}</p></div>
      <div class="stat"><p class="s-label">Maré</p><p class="s-value">${fmtNum(h.tideHeight)}<small>m</small>${trend ? ` <span class="tide-arrow tide-${trend}">${TREND_ARROW[trend]}</span>` : ""}</p></div>
    </div>
  `;
  el.hidden = false;
  el.querySelector(".hd-close").addEventListener("click", () => {
    state.selectedTime = null;
    el.hidden = true;
    renderStrip(hours);
  });
}

function selectHour(hours, h) {
  state.selectedTime = h.time;
  renderHourDetail(hours, h);
  renderStrip(hours);
}

function renderStrip(hours) {
  const today = new Date();
  const todayHours = hours.filter((h) => isSameDay(h.time, today));
  const svg = document.getElementById("swellStrip");
  const W = 1000,
    H = 220;
  const padL = 34,
    padR = 10,
    padT = 14,
    padB = 26;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const n = todayHours.length || 1;
  const barW = chartW / n;

  const maxWave = Math.max(2, ...todayHours.map((h) => h.swellHeight ?? h.waveHeight ?? 0));

  const tideVals = todayHours.map((h) => h.tideHeight).filter((v) => v != null);
  const tideMin = tideVals.length ? Math.min(...tideVals) : 0;
  const tideMax = tideVals.length ? Math.max(...tideVals) : 1;
  const tideRange = Math.max(0.2, tideMax - tideMin);

  let bg = "";
  let labels = "";
  let pts = [];
  let tidePts = [];

  todayHours.forEach((h, i) => {
    const x = padL + i * barW;
    const wave = h.swellHeight ?? h.waveHeight ?? 0;
    const isSelected = state.selectedTime === h.time;
    const label = `${fmtHour(h.time)}, ${h.rating.label}, altura ${fmtNum(wave)} metros, vento ${fmtNum(h.windSpeed)} quilômetros por hora`;
    bg += `<rect class="hit" tabindex="0" role="button" data-idx="${i}" aria-label="${label}" x="${x}" y="${padT}" width="${barW + 0.5}" height="${chartH}" fill="${h.rating.color}" opacity="${isSelected ? 0.24 : 0.1}"/>`;
    const yVal = padT + chartH - (wave / maxWave) * chartH;
    pts.push([x + barW / 2, yVal]);
    if (h.tideHeight != null) {
      const yTide = padT + chartH - ((h.tideHeight - tideMin) / tideRange) * chartH;
      tidePts.push([x + barW / 2, yTide]);
    }
    if (i % 3 === 0) {
      labels += `<text x="${x + barW / 2}" y="${H - 8}" text-anchor="middle" class="mono" font-size="11" fill="var(--foam-dimmer)">${fmtHour(h.time)}</text>`;
    }
  });

  const waveLine = "M " + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" L ");
  const tideLine = tidePts.length ? "M " + tidePts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" L ") : "";

  const dots = pts
    .map((p, i) => {
      const h = todayHours[i];
      const isSelected = state.selectedTime === h.time;
      return `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${isSelected ? 5.5 : 3.4}" fill="${h.rating.color}" stroke="${isSelected ? "var(--foam)" : "none"}" stroke-width="1.5" style="pointer-events:none"/>`;
    })
    .join("");

  let selectionLine = "";
  const selIdx = todayHours.findIndex((h) => h.time === state.selectedTime);
  if (selIdx !== -1) {
    const hx = padL + selIdx * barW + barW / 2;
    selectionLine = `<line x1="${hx.toFixed(1)}" x2="${hx.toFixed(1)}" y1="${padT}" y2="${padT + chartH}" stroke="var(--foam)" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.55" style="pointer-events:none"/>`;
  }

  let grid = "";
  for (let g = 0; g <= 4; g++) {
    const gy = padT + (chartH / 4) * g;
    const val = (maxWave * (4 - g)) / 4;
    grid += `<line x1="${padL}" x2="${W - padR}" y1="${gy}" y2="${gy}" stroke="var(--navy-line)" stroke-width="1" style="pointer-events:none"/>`;
    grid += `<text x="${padL - 8}" y="${gy + 3}" text-anchor="end" class="mono" font-size="10" fill="var(--foam-dimmer)" style="pointer-events:none">${val.toFixed(1)}</text>`;
  }

  const tidePath = tideLine
    ? `<path d="${tideLine}" fill="none" stroke="var(--tide)" stroke-width="2" stroke-dasharray="5 4" opacity="0.9" style="pointer-events:none"/>`
    : "";

  svg.innerHTML = `${grid}${bg}${tidePath}<path d="${waveLine}" fill="none" stroke="var(--gold)" stroke-width="2" opacity="0.9" style="pointer-events:none"/>${selectionLine}${dots}${labels}`;

  svg.querySelectorAll(".hit").forEach((rect) => {
    const i = parseInt(rect.dataset.idx, 10);
    const h = todayHours[i];
    rect.addEventListener("click", () => selectHour(hours, h));
    rect.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectHour(hours, h);
      }
    });
  });

  renderTideExtremes(todayHours);
}

function renderDays(hours) {
  const grid = document.getElementById("daysGrid");
  const days = groupByDay(hours).slice(0, 6);
  grid.innerHTML = "";

  days.forEach(([dayStr, dayHours]) => {
    const dateObj = new Date(dayStr + "T12:00:00");
    const daylightHours = dayHours.filter((h) => {
      const hh = parseInt(h.time.slice(11, 13), 10);
      return hh >= 6 && hh <= 18;
    });
    const pool = daylightHours.length ? daylightHours : dayHours;
    const best = pool.reduce((a, b) => (b.score > a.score ? b : a), pool[0]);

    const card = document.createElement("div");
    card.className = "day-card";
    card.style.setProperty("--rc", best.rating.color);
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-expanded", "false");
    card.setAttribute("aria-label", `${WEEKDAYS[dateObj.getDay()]}, ${best.rating.label}, ver horários`);
    card.innerHTML = `
      <p class="d-name">${WEEKDAYS[dateObj.getDay()]}</p>
      <p class="d-date">${dateObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</p>
      <p class="d-rating">${best.rating.label}</p>
      <p class="d-best">melhor às ${fmtHour(best.time)} · ${fmtNum(best.swellHeight ?? best.waveHeight)}m</p>
      <p class="d-toggle">Toque para ver horários ▾</p>
      <div class="d-hours" hidden></div>
    `;

    const toggle = () => {
      const panel = card.querySelector(".d-hours");
      const toggleLabel = card.querySelector(".d-toggle");
      const expanded = card.getAttribute("aria-expanded") === "true";
      if (expanded) {
        panel.hidden = true;
        card.setAttribute("aria-expanded", "false");
        toggleLabel.textContent = "Toque para ver horários ▾";
      } else {
        if (!panel.dataset.filled) {
          const sample = dayHours.filter((h) => [6, 9, 12, 15, 18, 21].includes(parseInt(h.time.slice(11, 13), 10)));
          panel.innerHTML = sample
            .map((h) => `<span class="d-hour-chip" style="--rc:${h.rating.color}">${fmtHour(h.time)} <b>${h.rating.label}</b></span>`)
            .join("");
          panel.dataset.filled = "1";
        }
        panel.hidden = false;
        card.setAttribute("aria-expanded", "true");
        toggleLabel.textContent = "Toque para fechar ▴";
      }
    };

    card.addEventListener("click", toggle);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });

    grid.appendChild(card);
  });
}

function renderClock() {
  const el = document.getElementById("clock");
  const update = () => {
    const now = new Date();
    el.textContent = now.toLocaleString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };
  update();
  setInterval(update, 30000);
}

async function loadAndRender() {
  const hero = document.getElementById("heroSection");
  const stripSection = document.getElementById("stripSection");
  const daysSection = document.getElementById("daysSection");
  const hourDetail = document.getElementById("hourDetail");
  stripSection.hidden = true;
  daysSection.hidden = true;
  if (hourDetail) hourDetail.hidden = true;
  hero.innerHTML = `
    <div class="hero-loading">
      <div class="spinner" aria-hidden="true"></div>
      <p>Consultando boias, maré e modelos de ondulação…</p>
    </div>
  `;

  const spot = currentSpot();
  try {
    const hours = await fetchSpotData(spot);
    state.data = hours;
    renderHero(hours);
    renderStrip(hours);
    renderDays(hours);
    stripSection.hidden = false;
    daysSection.hidden = false;
  } catch (err) {
    hero.innerHTML = `
      <div class="hero-loading">
        <p>Não foi possível carregar a previsão agora. ${err.message || ""}<br/>Tente novamente em instantes.</p>
      </div>
    `;
  }
}

renderTabs();
renderLegend();
renderClock();
loadAndRender();
