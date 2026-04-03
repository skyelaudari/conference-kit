# ConferenceKit

A mobile-first, offline-ready web app for conference networking. Search attendees, view tailored talking points, and organize contacts by event — all from your phone.

## Features

- **Offline-first** — works without connectivity after first load (PWA with service worker)
- **No backend** — all data stays in your browser via IndexedDB
- **Google Sheets integration** — import contacts from a shared Google Sheet (public or authenticated)
- **File upload** — import .xlsx or .csv files directly
- **Multi-event** — organize contacts across multiple conferences
- **Search** — find people by name or company across all events
- **Rich profiles** — talking points, company overview, industry context, role background

## Quick Start

1. **[Copy the Google Sheets template](https://docs.google.com/spreadsheets/d/1rl-NP8v0fuUB5AjEAKJvPJTxmukMS57obmrjvNpT--c/edit?usp=sharing)** and fill in your data
2. Open the app and tap **Connect Google Sheet**
3. Paste your sheet URL and import

Or upload a `.xlsx` / `.csv` file directly.

## Template Format

Your spreadsheet should have a **Contacts** sheet with these columns:

| Column | Description |
|--------|-------------|
| Name | Contact's full name |
| Title | Job title |
| Company | Organization |
| Priority Tier | Tier 1, 2, or 3 |
| Company Overview | About the company |
| Industry Context | Sector relevance |
| Talking Points | Your pitch or notes |
| Role Context | Their background |

Optionally add an **Event Info** sheet with: Event Name, Start Date, End Date, Location, Conference Website, Agenda URL.

Column names are matched flexibly — the importer handles common variations (e.g., "Full Name", "Job Title", "Organization").

## Architecture

- Vanilla JS with ES modules (no build step)
- IndexedDB for local storage
- Service worker for offline caching
- Google Identity Services for OAuth (optional, for restricted sheets)
- SheetJS loaded on-demand from CDN for .xlsx parsing

## Development

```bash
cd conference-kit
python3 -m http.server 8080
```

Open `http://localhost:8080` in your browser.

## Privacy

All contact data is stored locally in your browser. Nothing is sent to any server. Google sign-in is optional and only used to read your own Google Sheets.

## License

MIT
