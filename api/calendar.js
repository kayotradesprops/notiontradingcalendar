module.exports = async function handler(req, res) {
  const url = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 NotionCalendarWidget/1.0",
        "Accept": "application/json,text/plain,*/*"
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Forex Factory calendar request failed",
        status: response.status
      });
    }

    const data = await response.json();

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      error: "Unable to fetch Forex Factory calendar"
    });
  }
};
