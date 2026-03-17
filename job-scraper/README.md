# Job Suitcase

Chroma-backed software job scraper and animated job browser built with Next.js, GSAP, and a background worker.

## What it does

- Scrapes multiple live sources for 10 software-engineering role families.
- Prefers direct ATS application links when available and replaces weaker listing links with higher-priority records.
- Deduplicates jobs by normalized company, title, and location.
- Refreshes on a 10-second worker loop and stores pooled results in ChromaDB.
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

Example values:

```env
CHROMA_API_KEY=your-chroma-api-key
CHROMA_TENANT=your-chroma-tenant-id
CHROMA_DATABASE=your-chroma-database
CHROMA_COLLECTION=job-scraper-jobs-v2
SCRAPE_INTERVAL_MS=10000
SCRAPE_TARGET_RECORDS=1000
```

## Run

```bash
npm install
npm run dev
```

`npm run dev` starts:

- the Next.js web app
- the scraper worker that refreshes every 10 seconds and writes to ChromaDB

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

- The app expects Chroma Cloud credentials in the environment before any scrape or search requests can hit the vector store.
- No local `.vectra` files are used anymore; embeddings and metadata are stored in ChromaDB.
- yeah
