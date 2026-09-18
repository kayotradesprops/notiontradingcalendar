# Notion Forex Factory Calendar Widget

This project creates a dark Notion-friendly economic-calendar widget using
Forex Factory's public weekly JSON export.

## What it shows

- Today's USD economic events
- High / Medium / Low impact filters
- New York (ET) / Central (CT) time toggle
- Actual / Forecast / Previous columns (Actual is shown as — because the public FF JSON does not provide it)
- Forecast and Previous values
- A computed +/- 5 minute "NYAM Risk Window" for the next High/Medium event
- The next relevant USD event
- Auto refresh every 5 minutes
- Direct link to Forex Factory

## Important limitation

Forex Factory's public weekly JSON export currently contains:
`title`, `country`, `date`, `impact`, `forecast`, and `previous`.

It does NOT expose an `actual` field, so this version intentionally does not
fake an Actual value. If you want live Actual values inside the widget, that
requires a second data source or a separate server-side scraper/API.

## Deploy with Vercel (recommended)

1. Create a new GitHub repository.
2. Upload the contents of this folder to the repository root:
   - index.html
   - vercel.json
   - api/calendar.js
3. Sign in to Vercel.
4. Click "Add New" -> "Project".
5. Import the GitHub repository.
6. Framework Preset: "Other".
7. Leave build command blank.
8. Click Deploy.
9. Copy the HTTPS URL Vercel gives you.

## Add it to Notion Desktop

1. Open your Launch Pad page in Notion Desktop.
2. Type `/embed`.
3. Choose "Embed".
4. Paste your Vercel HTTPS URL.
5. Click "Embed link".
6. Drag the side handles until the widget fits your column.
7. Make it roughly 600-760 px tall if you want the summary cards visible.

The hosted page does not require a login, which is important for Notion
desktop/mobile embeds.

## Customize

Open `index.html` and search for these values:

- `America/New_York` -> default timezone
- `America/Chicago` -> alternate timezone
- `USD` -> currency filter
- `5 * 60 * 1000` -> auto-refresh interval
- CSS variables at the top -> colors

### Default colors

- background: #191919
- card: #242424
- borders: #3a3a3a
- high impact: #e25555
- medium impact: #e0a33d
- low impact: #909090

## Source

Forex Factory calendar:
https://www.forexfactory.com/calendar

Weekly JSON:
https://nfs.faireconomy.media/ff_calendar_thisweek.json
