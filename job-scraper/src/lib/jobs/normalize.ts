import type { JobSeed } from "@/lib/jobs/types";
import { compactWhitespace, toKebabCase } from "@/lib/jobs/text";

const AGGREGATOR_HOSTS = new Set([
  "arbeitnow.com",
  "www.arbeitnow.com",
  "linkedin.com",
  "www.linkedin.com",
  "in.linkedin.com",
  "remoteok.com",
  "remoteok.io",
  "www.remoteok.com",
  "www.themuse.com",
  "themuse.com",
  "remotive.com",
  "unstop.com",
  "www.unstop.com",
]);

const ATS_HOSTS = new Set([
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "boards-api.greenhouse.io",
  "jobs.smartrecruiters.com",
  "api.smartrecruiters.com",
  "lever.co",
  "jobs.lever.co",
]);

export function getDomain(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isAggregatorUrl(value: string | null | undefined): boolean {
  const domain = getDomain(value);
  return domain ? AGGREGATOR_HOSTS.has(domain) : false;
}

export function isAtsUrl(value: string | null | undefined): boolean {
  const domain = getDomain(value);
  return domain ? ATS_HOSTS.has(domain) : false;
}

function normalizeTitle(value: string): string {
  return compactWhitespace(value)
    .toLowerCase()
    .replace(/\b(sr|senior|staff|principal|lead|junior|jr|ii|iii|iv)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeCompany(value: string): string {
  return compactWhitespace(value)
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|gmbh|ag|plc)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeLocation(value: string, remote: boolean): string {
  if (remote) {
    return "remote";
  }

  return compactWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function createCanonicalKey(seed: JobSeed): string {
  return [
    normalizeCompany(seed.companyName),
    normalizeTitle(seed.title),
    normalizeLocation(seed.location, seed.remote),
  ]
    .filter(Boolean)
    .join("|");
}

export function choosePreferredLink(
  currentLink: string | null | undefined,
  currentSourceUrl: string | null | undefined,
  incomingLink: string | null | undefined,
  incomingSourceUrl: string | null | undefined,
): string {
  const candidates = [
    currentLink,
    incomingLink,
    currentSourceUrl,
    incomingSourceUrl,
  ].filter((value): value is string => Boolean(value));

  candidates.sort((left, right) => scoreLink(right) - scoreLink(left));

  return candidates[0];
}

export function buildPictureUrl(seed: JobSeed): string | null {
  if (seed.pictureUrl) {
    return seed.pictureUrl;
  }

  const preferredDomain = getDomain(seed.applicationUrl) ?? getDomain(seed.sourceUrl);

  if (!preferredDomain) {
    return null;
  }

  return `https://www.google.com/s2/favicons?sz=128&domain_url=https://${preferredDomain}`;
}

function scoreLink(value: string): number {
  const domain = getDomain(value);

  if (!domain) {
    return 0;
  }

  if (isAggregatorUrl(value)) {
    return 20;
  }

  if (isAtsUrl(value)) {
    return 80;
  }

  return 100;
}

export function computeFreshnessScore(postedAt: Date | null): number {
  if (!postedAt) {
    return 8;
  }

  const ageMs = Date.now() - postedAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  return Math.max(0, 30 - ageDays) * 0.7;
}

export function computeRankingScore(seed: JobSeed): number {
  const descriptionBoost = Math.min(seed.shortDescription.length / 20, 8);
  const remoteBoost = seed.remote ? 2 : 0;

  return seed.sourcePriority + computeFreshnessScore(seed.postedAt) + descriptionBoost + remoteBoost;
}

export function makeSmartRecruitersPostingUrl(companyId: string, jobId: string, title: string): string {
  return `https://jobs.smartrecruiters.com/${companyId}/${jobId}-${toKebabCase(title)}`;
}
