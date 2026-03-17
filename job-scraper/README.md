# Job Suitcase

Mongo-backed software job scraper and animated job browser built with Next.js, GSAP, and a background worker.

## What it does

- Scrapes multiple live sources for 10 software-engineering role families.
- Prefers direct ATS application links when available and replaces weaker listing links with higher-priority records.
- Deduplicates jobs by normalized company, title, and location.
- Refreshes on a 10-second worker loop and stores pooled results in MongoDB.
- Shows the results in a light-theme UI with a GSAP suitcase intro, centered search, role filters, and animated result cards.

## Sources

- Greenhouse
- SmartRecruiters
- Arbeitnow
- Remote OK
- The Muse
- Remotive

## Role Families

- Software Engineer
- Frontend Engineer
- Backend Engineer
- Full Stack Engineer
- Mobile Engineer
- Data Engineer
- ML Engineer
- DevOps Engineer
- SRE
- Security Engineer

## Environment

Create a `.env.local` or `.env` file from `.env.example`.

```bash
cp .env.example .env.local
```

Default values:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/job-scraper
SCRAPE_INTERVAL_MS=10000
SCRAPE_TARGET_RECORDS=1000
SCRAPE_TIME_BUDGET_MS=30000
```

## Run

```bash
npm install
npm run dev
```

`npm run dev` starts:

- a local `mongod` process on `127.0.0.1:27017` when one is not already running
- the Next.js web app
- the scraper worker that refreshes every 10 seconds

## Build

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## API

- `GET /api/jobs`
- `GET /api/jobs?role=frontend-engineer`
- `GET /api/jobs?query=react`
- `POST /api/scrape`

## Notes

- If you already run MongoDB locally, the startup script reuses that existing instance instead of starting another one.
- If you want to use an external MongoDB deployment, set `MONGODB_URI` and the app will connect there instead.
