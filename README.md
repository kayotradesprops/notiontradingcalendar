# Original dashboard + live Actual values (Myfxbook source)

This version preserves the original custom Notion dashboard layout.

Data path:
1. Vercel server function fetches Myfxbook's public economic-calendar widget.
2. It parses USD event rows including Impact, Previous, Consensus and Actual.
3. The custom `index.html` renders those values in the original dashboard design.
4. The browser polls every 30 seconds.
5. If Myfxbook cannot be read, the API falls back to the Forex Factory weekly
   schedule. In fallback mode the dashboard says SCHEDULE instead of LIVE.

No API key is required.

## Replace in GitHub

Replace:
- `index.html`
- `api/calendar.js`

Keep `vercel.json` at the repository root.

## Test after Vercel redeploys

Open:
`https://YOUR-DOMAIN.vercel.app/api/calendar`

Healthy live mode:
- `"live": true`
- `"source": "Myfxbook"`
- `"parsedEvents"` greater than 0
- released events contain an `"actual"` value

Fallback mode:
- `"live": false`
- `"source": "Forex Factory fallback"`
- `liveError` explains why Myfxbook could not be parsed.

## Defaults
- USD only
- High + Medium on
- Low off
- ET / CT toggle
- 30-second refresh
