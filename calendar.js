const TV_URL = "https://economic-calendar.tradingview.com/events";
const FF_SCHEDULE_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

function impactFromTradingView(event) {
  const raw =
    event.importanceCode ??
    event.importance ??
    event.impact ??
    event.priority;

  if (typeof raw === "string") {
    const s = raw.toLowerCase();
    if (s.includes("high")) return "High";
    if (s.includes("med")) return "Medium";
    if (s.includes("low")) return "Low";
    const n = Number(raw);
    if (!Number.isNaN(n)) return n >= 1 ? "High" : n === 0 ? "Medium" : "Low";
  }

  if (typeof raw === "number") {
    return raw >= 1 ? "High" : raw === 0 ? "Medium" : "Low";
  }

  return "Low";
}

function formatValue(value, scale, unit) {
  if (value === null || value === undefined || value === "") return "";

  let out = String(value).trim();
  const suffix = [scale, unit]
    .filter(Boolean)
    .map(v => String(v).trim())
    .join("");

  // Avoid duplicating % / K / M / B etc. when TradingView already formatted it.
  if (suffix && !out.endsWith(suffix)) {
    const hasUnitAlready =
      /[%$€£¥]$/.test(out) ||
      /[KMBT]$/i.test(out);

    if (!hasUnitAlready) out += suffix;
  }

  return out;
}

function normalizeTradingViewEvent(e) {
  return {
    title: e.title || e.indicator || e.event || "Economic Event",
    country: "USD",
    date: e.date || e.datetime || e.time || e.timestamp,
    impact: impactFromTradingView(e),
    actual: formatValue(e.actual, e.scale, e.unit),
    forecast: formatValue(e.forecast, e.scale, e.unit),
    previous: formatValue(e.previous, e.scale, e.unit)
  };
}

async function fetchTradingView() {
  // Pull a wide enough UTC window that the frontend can correctly filter "today"
  // in either ET or CT.
  const now = new Date();
  const from = new Date(now.getTime() - 36 * 60 * 60 * 1000).toISOString();
  const to = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();

  const url = new URL(TV_URL);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  url.searchParams.set("countries", "US");

  const response = await fetch(url.toString(), {
    headers: {
      "Origin": "https://www.tradingview.com",
      "Referer": "https://www.tradingview.com/economic-calendar/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
      "Accept": "application/json,text/plain,*/*",
      "Accept-Language": "en-US,en;q=0.9"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`TradingView HTTP ${response.status}`);
  }

  const payload = await response.json();
  const result = Array.isArray(payload) ? payload : payload.result;

  if (!Array.isArray(result)) {
    throw new Error("TradingView response did not contain a result array");
  }

  const events = result
    .filter(e => (e.country || "").toUpperCase() === "US")
    .map(normalizeTradingViewEvent)
    .filter(e => e.date && !Number.isNaN(new Date(e.date).getTime()));

  if (!events.length) {
    throw new Error("TradingView returned no US events");
  }

  return events;
}

async function fetchForexFactorySchedule() {
  const response = await fetch(FF_SCHEDULE_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36",
      "Accept": "application/json,text/plain,*/*"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Forex Factory HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) throw new Error("Forex Factory response was not an array");

  return data.map(e => ({
    ...e,
    actual: ""
  }));
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=20, stale-while-revalidate=20");

  try {
    const events = await fetchTradingView();

    return res.status(200).json({
      events,
      actualsAvailable: true,
      source: "TradingView",
      fetchedAt: new Date().toISOString()
    });
  } catch (tvError) {
    try {
      const events = await fetchForexFactorySchedule();

      return res.status(200).json({
        events,
        actualsAvailable: false,
        source: "Forex Factory",
        liveError: tvError instanceof Error ? tvError.message : String(tvError),
        fetchedAt: new Date().toISOString()
      });
    } catch (ffError) {
      return res.status(502).json({
        error: "Both live and fallback calendar sources failed",
        tradingViewError:
          tvError instanceof Error ? tvError.message : String(tvError),
        forexFactoryError:
          ffError instanceof Error ? ffError.message : String(ffError)
      });
    }
  }
};
