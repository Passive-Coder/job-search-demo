import {
  ALL_ROLE_VALUE,
  SOFTWARE_ROLES,
  type RoleFilterValue,
  type SoftwareRoleId,
} from "@/lib/jobs/roles";
import {
  buildPictureUrl,
  choosePreferredLink,
  computeRankingScore,
  createCanonicalKey,
  getDomain,
  isAggregatorUrl,
} from "@/lib/jobs/normalize";
import { preferOfficialCompanyLink } from "@/lib/jobs/company-link-resolver";
import { scrapeLinkedInJobs } from "@/lib/jobs/providers/linkedin";
import { scrapeUnstopJobs } from "@/lib/jobs/providers/unstop";
import type {
  JobCard,
  JobSeed,
  ProviderId,
  ScrapeSummary,
  SourceSnapshot,
  StoredJobRecord,
} from "@/lib/jobs/types";
import {
  listStoredJobs,
  queryRelatedJobs,
  upsertStoredJobs,
} from "@/lib/jobs/vector-store";

const DEFAULT_TARGET_RECORDS = Number(process.env.SCRAPE_TARGET_RECORDS ?? 1000);
const SCRAPE_INTERVAL_MS = Number(process.env.SCRAPE_INTERVAL_MS ?? 10000);
const SCRAPE_WRITE_BATCH_SIZE = 10;
const ACTIVE_PROVIDER_IDS = new Set<ProviderId>(["linkedin", "unstop"]);

let activeScrapeCycle: Promise<ScrapeSummary> | null = null;
let lastScrapeStartedAt = 0;

type JobSearchOptions = {
  query?: string;
  role?: RoleFilterValue;
  location?: string;
  limit?: number;
  scrapeBeforeRead?: boolean;
};

type JobSearchFilters = {
  query: string;
  queryTerms: string[];
  location: string;
  locationTerms: string[];
  role: RoleFilterValue;
};

function normalizeValue(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function isActiveProvider(provider: ProviderId) {
  return ACTIVE_PROVIDER_IDS.has(provider);
}

function tokenizeValue(value: string) {
  return normalizeValue(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function providerTieBreaker(seed: JobSeed): number {
  const preferredDomain = getDomain(seed.applicationUrl ?? seed.sourceUrl);

  if (!preferredDomain) {
    return 0;
  }

  return isAggregatorUrl(seed.applicationUrl ?? seed.sourceUrl) ? 0 : 10;
}

function compareSeeds(left: JobSeed, right: JobSeed): number {
  const rankingDelta =
    computeRankingScore(right) +
    providerTieBreaker(right) -
    computeRankingScore(left) -
    providerTieBreaker(left);

  if (rankingDelta !== 0) {
    return rankingDelta;
  }

  return right.shortDescription.length - left.shortDescription.length;
}

function dedupeSeeds(seeds: JobSeed[]): JobSeed[] {
  const unique = new Map<string, JobSeed>();

  for (const seed of seeds) {
    const canonicalKey = createCanonicalKey(seed);
    const existing = unique.get(canonicalKey);

    if (!existing || compareSeeds(existing, seed) > 0) {
      unique.set(canonicalKey, seed);
    }
  }

  return [...unique.values()]
    .sort((left, right) => compareSeeds(left, right))
    .slice(0, Math.max(DEFAULT_TARGET_RECORDS * 2, 1500));
}

function chunkItems<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function mergeTags(current: string[] = [], incoming: string[] = []) {
  return [...new Set([...current, ...incoming])].slice(0, 16);
}

function mergeRoles(
  current: SoftwareRoleId[] = [],
  incoming: SoftwareRoleId[] = [],
) {
  return [...new Set([...current, ...incoming])] as SoftwareRoleId[];
}

function chooseSummary(current: string, incoming: string) {
  const currentLooksDirty = /<[^>]+>|&lt;|&gt;/.test(current);
  const incomingLooksDirty = /<[^>]+>|&lt;|&gt;/.test(incoming);

  if (currentLooksDirty !== incomingLooksDirty) {
    return incomingLooksDirty ? current : incoming;
  }

  return incoming.length > current.length ? incoming : current;
}

function chooseBetterSeed(existing: StoredJobRecord | null, seed: JobSeed) {
  if (!existing) {
    return true;
  }

  const existingScore = existing.priorityScore + (isAggregatorUrl(existing.link) ? 0 : 8);
  const incomingScore = seed.sourcePriority + providerTieBreaker(seed);

  if (incomingScore !== existingScore) {
    return incomingScore > existingScore;
  }

  return seed.shortDescription.length > existing.shortDescription.length;
}

function buildSearchText(seed: JobSeed, description: string, tags: string[]) {
  return [
    seed.title,
    seed.companyName,
    description,
    seed.location,
    tags.join(" "),
    SOFTWARE_ROLES.find((role) => role.id === seed.primaryRole)?.label ?? "",
    seed.providerLabel,
  ]
    .filter(Boolean)
    .join(" ");
}

function mergeSnapshots(
  existing: SourceSnapshot[] = [],
  seed: JobSeed,
  nowIso: string,
) {
  const snapshotKey = `${seed.provider}:${seed.externalId}`;
  const nextSnapshots = [
    ...existing.filter(
      (entry) => `${entry.provider}:${entry.externalId}` !== snapshotKey,
    ),
    {
      provider: seed.provider,
      providerKind: seed.providerKind,
      providerLabel: seed.providerLabel,
      externalId: seed.externalId,
      sourceUrl: seed.sourceUrl,
      applicationUrl: seed.applicationUrl,
      priority: seed.sourcePriority,
      capturedAt: nowIso,
    },
  ];

  nextSnapshots.sort(
    (left, right) =>
      new Date(right.capturedAt).getTime() - new Date(left.capturedAt).getTime(),
  );

  return nextSnapshots.slice(0, 8);
}

function toJobCard(job: StoredJobRecord): JobCard {
  return {
    id: job.id,
    title: job.title,
    companyName: job.companyName,
    shortDescription: job.shortDescription,
    link: job.applicationUrl ?? job.link,
    pictureUrl: job.pictureUrl,
    location: job.location,
    employmentType: job.employmentType,
    remote: job.remote,
    providerLabel: job.providerLabel,
    primaryRole: job.primaryRole,
    matchedRoles: job.matchedRoles,
    tags: job.tags,
    postedAt: job.postedAt,
    lastSeenAt: job.lastSeenAt,
  };
}

function scoreTermMatches(value: string, terms: string[], weight: number) {
  const haystack = value.toLowerCase();
  let score = 0;

  for (const term of terms) {
    if (haystack.includes(term)) {
      score += weight;
    }
  }

  return score;
}

function matchesLocation(job: StoredJobRecord, filters: JobSearchFilters) {
  if (!filters.location) {
    return true;
  }

  const normalizedLocation = normalizeValue(job.location);

  if (/remote/.test(filters.location) && job.remote) {
    return true;
  }

  return normalizedLocation.includes(filters.location);
}

function matchesQuery(job: StoredJobRecord, filters: JobSearchFilters) {
  if (!filters.query) {
    return true;
  }

  const haystack = [
    job.title,
    job.companyName,
    job.searchText,
    job.tags.join(" "),
  ]
    .join(" ")
    .toLowerCase();

  return filters.queryTerms.every((term) => haystack.includes(term));
}

function scoreJobMatch(
  job: StoredJobRecord,
  filters: JobSearchFilters,
  semanticScores: Map<string, number>,
) {
  let score = job.rankingScore;

  if (filters.role !== ALL_ROLE_VALUE) {
    if (job.primaryRole === filters.role) {
      score += 260;
    } else if (job.matchedRoles.includes(filters.role)) {
      score += 160;
    }
  }

  if (filters.query) {
    const title = job.title.toLowerCase();
    const companyName = job.companyName.toLowerCase();
    const description = job.description.toLowerCase();
    const tags = job.tags.join(" ").toLowerCase();

    if (title.includes(filters.query)) {
      score += 220;
    }

    if (companyName.includes(filters.query)) {
      score += 120;
    }

    score += scoreTermMatches(title, filters.queryTerms, 28);
    score += scoreTermMatches(companyName, filters.queryTerms, 14);
    score += scoreTermMatches(tags, filters.queryTerms, 18);
    score += scoreTermMatches(description, filters.queryTerms, 8);
  }

  if (filters.location) {
    const location = job.location.toLowerCase();

    if (location.includes(filters.location)) {
      score += 180;
    }

    if (/remote/.test(filters.location) && job.remote) {
      score += 200;
    }

    score += scoreTermMatches(location, filters.locationTerms, 24);
  }

  score += (semanticScores.get(job.canonicalKey) ?? 0) * 240;

  return score;
}

function buildStoredJobRecord(
  seed: JobSeed,
  existing: StoredJobRecord | null,
  nowIso: string,
) {
  const preferIncoming = chooseBetterSeed(existing, seed);
  const description = existing
    ? chooseSummary(existing.description, seed.description)
    : seed.description;
  const tags = mergeTags(existing?.tags, seed.tags);
  const matchedRoles = mergeRoles(existing?.matchedRoles, seed.matchedRoles);
  const link = choosePreferredLink(
    existing?.applicationUrl ?? existing?.link,
    existing?.sourceUrl,
    seed.applicationUrl ?? seed.sourceUrl,
    seed.sourceUrl,
  );
  const pictureUrl = existing?.pictureUrl ?? buildPictureUrl(seed);
  const rankingScore = Math.max(existing?.rankingScore ?? 0, computeRankingScore(seed));
  const postedAt =
    existing?.postedAt && seed.postedAt
      ? new Date(existing.postedAt) > seed.postedAt
        ? existing.postedAt
        : seed.postedAt.toISOString()
      : existing?.postedAt ?? seed.postedAt?.toISOString() ?? null;

  return {
    id: existing?.id ?? createCanonicalKey(seed),
    canonicalKey: createCanonicalKey(seed),
    externalId: preferIncoming ? seed.externalId : existing?.externalId ?? seed.externalId,
    provider: preferIncoming ? seed.provider : existing?.provider ?? seed.provider,
    providerKind: preferIncoming
      ? seed.providerKind
      : existing?.providerKind ?? seed.providerKind,
    providerLabel: preferIncoming
      ? seed.providerLabel
      : existing?.providerLabel ?? seed.providerLabel,
    companyName: seed.companyName,
    title: preferIncoming ? seed.title : existing?.title ?? seed.title,
    description,
    shortDescription: chooseSummary(existing?.shortDescription ?? "", seed.shortDescription),
    link,
    sourceUrl: preferIncoming ? seed.sourceUrl : existing?.sourceUrl ?? seed.sourceUrl,
    applicationUrl: link,
    companyWebsite:
      existing?.companyWebsite ??
      seed.companyWebsite ??
      (!isAggregatorUrl(link) ? new URL(link).origin : null),
    pictureUrl,
    location: preferIncoming ? seed.location : existing?.location ?? seed.location,
    employmentType: existing?.employmentType ?? seed.employmentType,
    remote: Boolean(existing?.remote || seed.remote),
    primaryRole: preferIncoming ? seed.primaryRole : existing?.primaryRole ?? seed.primaryRole,
    matchedRoles,
    tags,
    rankingScore,
    priorityScore: Math.max(existing?.priorityScore ?? 0, seed.sourcePriority),
    postedAt,
    lastSeenAt: nowIso,
    searchText: buildSearchText(seed, description, tags),
    sourceSnapshots: mergeSnapshots(existing?.sourceSnapshots, seed, nowIso),
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso,
  } satisfies StoredJobRecord;
}

async function runScrapeCycleOnce(): Promise<ScrapeSummary> {
  const startedAt = Date.now();

  const providerResults = await Promise.allSettled([
    scrapeLinkedInJobs(),
    scrapeUnstopJobs(),
  ]);

  const allSeeds: JobSeed[] = [];
  const errors: string[] = [];
  const sources: Record<string, number> = {};

  for (const result of providerResults) {
    if (result.status === "fulfilled") {
      allSeeds.push(...result.value.jobs);
      sources[result.value.provider] = result.value.jobs.length;
      errors.push(...result.value.errors);
      continue;
    }

    errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
  }

  const dedupedSeeds = await Promise.all(
    dedupeSeeds(allSeeds).map((seed) => preferOfficialCompanyLink(seed)),
  );
  const existingJobs = await listStoredJobs();
  const existingByKey = new Map(existingJobs.map((job) => [job.canonicalKey, job]));
  let upserted = 0;

  for (const chunk of chunkItems(dedupedSeeds, SCRAPE_WRITE_BATCH_SIZE)) {
    const nowIso = new Date().toISOString();
    const records = chunk.map((seed) => {
      const record = buildStoredJobRecord(
        seed,
        existingByKey.get(createCanonicalKey(seed)) ?? null,
        nowIso,
      );

      existingByKey.set(record.canonicalKey, record);
      return record;
    });

    await upsertStoredJobs(records);
    upserted += records.length;
  }

  return {
    durationMs: Date.now() - startedAt,
    fetched: allSeeds.length,
    deduped: dedupedSeeds.length,
    upserted,
    sources,
    errors: errors.slice(0, 20),
  };
}

export async function runScrapeCycle(force = false): Promise<ScrapeSummary> {
  if (activeScrapeCycle) {
    return activeScrapeCycle;
  }

  const now = Date.now();

  if (!force && lastScrapeStartedAt && now - lastScrapeStartedAt < SCRAPE_INTERVAL_MS) {
    return {
      durationMs: 0,
      fetched: 0,
      deduped: 0,
      upserted: 0,
      sources: {},
      errors: [],
    };
  }

  lastScrapeStartedAt = now;
  activeScrapeCycle = runScrapeCycleOnce().finally(() => {
    activeScrapeCycle = null;
  });

  return activeScrapeCycle;
}

export async function getJobs(options?: JobSearchOptions) {
  const queryValue = normalizeValue(options?.query);
  const locationValue = normalizeValue(options?.location);
  const role = options?.role ?? ALL_ROLE_VALUE;
  const limit = Math.min(Math.max(options?.limit ?? 24, 1), 120);
  const filters: JobSearchFilters = {
    query: queryValue,
    queryTerms: tokenizeValue(queryValue),
    location: locationValue,
    locationTerms: tokenizeValue(locationValue),
    role,
  };
  const hasActiveFilters =
    Boolean(filters.query) ||
    Boolean(filters.location) ||
    filters.role !== ALL_ROLE_VALUE;

  const allJobs = (await listStoredJobs()).filter((job) => isActiveProvider(job.provider));
  const relatedMatches = filters.query
    ? await queryRelatedJobs({
        query: filters.query,
        role: filters.role,
        location: filters.location,
        limit: Math.max(limit * 4, 30),
      })
        .then((matches) => matches.filter((entry) => isActiveProvider(entry.job.provider)))
    : [];
  const semanticScores = new Map(
    relatedMatches.map((entry) => [entry.job.canonicalKey, entry.score]),
  );

  const filteredJobs = allJobs.filter((job) => {
    if (filters.role !== ALL_ROLE_VALUE && !job.matchedRoles.includes(filters.role)) {
      return false;
    }

    if (!matchesLocation(job, filters)) {
      return false;
    }

    if (!filters.query) {
      return true;
    }

    return matchesQuery(job, filters) || semanticScores.has(job.canonicalKey);
  });

  filteredJobs.sort((left, right) => {
    const scoreDelta =
      scoreJobMatch(right, filters, semanticScores) -
      scoreJobMatch(left, filters, semanticScores);

    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });

  const defaultSorted = !hasActiveFilters
    ? [...allJobs].sort((left, right) => {
        if (right.rankingScore !== left.rankingScore) {
          return right.rankingScore - left.rankingScore;
        }

        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      })
    : filteredJobs;

  const resultJobs = hasActiveFilters ? filteredJobs : defaultSorted;
  const freshest = allJobs.sort(
    (left, right) =>
      new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime(),
  )[0];

  return {
    total: resultJobs.length,
    lastSeenAt: freshest?.lastSeenAt ?? null,
    items: resultJobs.slice(0, limit).map(toJobCard),
  };
}

export async function searchJobs(options?: JobSearchOptions) {
  let scrapeSummary: ScrapeSummary | null = null;

  const currentJobs = await getJobs(options);
  if (options?.scrapeBeforeRead) {
    scrapeSummary = await runScrapeCycle();
  }

  const finalJobs =
    scrapeSummary || currentJobs.total !== 0
      ? await getJobs(options)
      : currentJobs;

  return {
    ...finalJobs,
    scrapeSummary,
  };
}
