const SCHEDULE_URL =
  "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

const LIVE_CALENDAR_URL =
  "https://www.forexfactory.com/calendar";

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache"
};

function decodeHtml(value = "") {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " "
  };

  return String(value)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16))
    )
    .replace(/&([a-z]+);/gi, (m, name) =>
      Object.prototype.hasOwnProperty.call(named, name.toLowerCase())
        ? named[name.toLowerCase()]
        : m
    );
}

function cleanText(value = "") {
  return decodeHtml(
    String(value)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function extractCell(rowHtml, className) {
  const safe = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<td[^>]*class=["'][^"']*${safe}[^"']*["'][^>]*>([\\s\\S]*?)<\\/td>`,
    "i"
  );
  const match = rowHtml.match(re);
  return match ? cleanText(match[1]) : "";
}

function extractEventTitle(rowHtml) {
  const span = rowHtml.match(
    /<span[^>]*class=["'][^"']*calendar__event-title[^"']*["'][^>]*>([\s\S]*?)<\/span>/i
  );
  if (span) return cleanText(span[1]);

  return extractCell(rowHtml, "calendar__event");
}

function normalize(value = "") {
  return decodeHtml(value)
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function eventKey(country, title) {
  return `${normalize(country)}|${normalize(title)}`;
}

function parseLiveCalendar(html) {
  const rows = [];
  const rowRegex =
    /<tr[^>]*class=["'][^"']*(?:calendar__row|calendar_row)[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi;

  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const row = match[1];
    const country = extractCell(row, "calendar__currency");
    const title = extractEventTitle(row);

    if (!country || !title) continue;

    rows.push({
      country,
      title,
      actual: extractCell(row, "calendar__actual"),
      forecast: extractCell(row, "calendar__forecast"),
      previous: extractCell(row, "calendar__previous")
    });
  }

  return rows;
}

function mergeActuals(schedule, liveRows) {
  // The same event title can occasionally occur more than once in a week.
  // Queue matching preserves Forex Factory's chronological row order.
  const queues = new Map();

  for (const row of liveRows) {
    const key = eventKey(row.country, row.title);
    if (!queues.has(key)) queues.set(key, []);
    queues.get(key).push(row);
  }

  return schedule.map(event => {
    const key = eventKey(event.country, event.title);
    const queue = queues.get(key);
    const live = queue && queue.length ? queue.shift() : null;

    return {
      ...event,
      actual: live?.actual || ""
    };
  });
}

async function fetchSchedule() {
  const response = await fetch(SCHEDULE_URL, {
    headers: {
      "User-Agent": REQUEST_HEADERS["User-Agent"],
      "Accept": "application/json,text/plain,*/*",
      "Cache-Control": "no-cache"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Schedule request failed: ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error("Schedule response was not an array");
  }

  return data;
}

async function fetchLiveActuals() {
  const response = await fetch(LIVE_CALENDAR_URL, {
    headers: REQUEST_HEADERS,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Live calendar request failed: ${response.status}`);
  }

  const html = await response.text();
  const rows = parseLiveCalendar(html);

  // If Forex Factory changes its HTML or serves a challenge page, don't
  // pretend the scrape succeeded.
  if (!rows.length) {
    throw new Error("No Forex Factory calendar rows were found");
  }

  return rows;
}

module.exports = async function handler(req, res) {
  try {
    const schedule = await fetchSchedule();

    let events = schedule.map(event => ({ ...event, actual: "" }));
    let actualsAvailable = false;
    let liveRowCount = 0;
    let liveError = null;

    try {
      const liveRows = await fetchLiveActuals();
      liveRowCount = liveRows.length;
      events = mergeActuals(schedule, liveRows);
      actualsAvailable = true;
    } catch (error) {
      // Keep the widget usable even if Forex Factory blocks the HTML request
      // or changes its page markup.
      liveError = error instanceof Error ? error.message : String(error);
    }

    // Keep this short enough for post-release values to appear quickly,
    // without hammering Forex Factory.
    res.setHeader(
      "Cache-Control",
      "s-maxage=30, stale-while-revalidate=30"
    );
    res.setHeader("Content-Type", "application/json; charset=utf-8");

    return res.status(200).json({
      events,
      actualsAvailable,
      liveRowCount,
      liveError,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      error: "Unable to fetch Forex Factory calendar",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
};
