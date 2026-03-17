import { load } from "cheerio";
import pLimit from "p-limit";

import { getDomain, isAggregatorUrl, isAtsUrl } from "@/lib/jobs/normalize";
import { fetchJson } from "@/lib/jobs/providers/shared";
import { compactWhitespace } from "@/lib/jobs/text";
import type { JobSeed } from "@/lib/jobs/types";

type ClearbitCompany = {
  name?: string;
  domain?: string;
  logo?: string | null;
};

type CompanyTarget = {
  applicationUrl: string | null;
  companyWebsite: string | null;
  pictureUrl: string | null;
};

const ATS_HINTS = [
  "greenhouse.io",
  "lever.co",
  "smartrecruiters.com",
  "myworkdayjobs.com",
  "workdayjobs.com",
  "ashbyhq.com",
  "icims.com",
  "jobvite.com",
  "breezy.hr",
  "workable.com",
  "recruitee.com",
  "taleo.net",
  "oraclecloud.com",
  "successfactors.com",
  "teamtailor.com",
  "personio.de",
];

const CAREER_PATH_HINTS = [
  "/careers",
  "/career",
  "/jobs",
  "/job",
  "/join-us",
  "/joinus",
  "/work-with-us",
  "/opportunities",
  "/careers/jobs",
];

const companyTargetCache = new Map<string, Promise<CompanyTarget>>();
const domainLookupLimit = pLimit(4);

function normalizeCompanyName(value: string) {
  return compactWhitespace(value)
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|gmbh|ag|plc)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeCandidateUrl(value: string | null | undefined, baseUrl: string) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value, baseUrl);

    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    url.hash = "";

    return url.toString();
  } catch {
    return null;
  }
}

function buildCompanyKey(companyName: string) {
  return normalizeCompanyName(companyName) || companyName.toLowerCase();
}

function scoreCompanyMatch(companyName: string, option: ClearbitCompany) {
  const normalizedTarget = normalizeCompanyName(companyName);
  const normalizedOption = normalizeCompanyName(option.name ?? "");

  if (!option.domain || !normalizedOption) {
    return -1;
  }

  if (normalizedTarget === normalizedOption) {
    return 120;
  }

  if (normalizedOption.includes(normalizedTarget) || normalizedTarget.includes(normalizedOption)) {
    return 90;
  }

  const targetTokens = new Set(normalizedTarget.split(" ").filter(Boolean));
  const optionTokens = new Set(normalizedOption.split(" ").filter(Boolean));
  let overlaps = 0;

  for (const token of targetTokens) {
    if (optionTokens.has(token)) {
      overlaps += 1;
    }
  }

  return overlaps * 20;
}

async function resolveCompanyWebsite(companyName: string): Promise<Pick<CompanyTarget, "companyWebsite" | "pictureUrl">> {
  try {
    const response = await fetchJson<ClearbitCompany[]>(
      `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(companyName)}`,
      undefined,
      6000,
    );

    const bestMatch = [...response]
      .sort((left, right) => scoreCompanyMatch(companyName, right) - scoreCompanyMatch(companyName, left))
      .find((entry) => scoreCompanyMatch(companyName, entry) > 0);

    if (!bestMatch?.domain) {
      return {
        companyWebsite: null,
        pictureUrl: null,
      };
    }

    return {
      companyWebsite: `https://${bestMatch.domain}`,
      pictureUrl: bestMatch.logo ?? null,
    };
  } catch {
    return {
      companyWebsite: null,
      pictureUrl: null,
    };
  }
}

function scoreCareerLink(url: string, label: string, companyDomain: string | null) {
  const domain = getDomain(url);

  if (!domain || isAggregatorUrl(url)) {
    return -1;
  }

  const haystack = `${url} ${label}`.toLowerCase();
  let score = 0;

  if (companyDomain && (domain === companyDomain || domain.endsWith(`.${companyDomain}`))) {
    score += 90;
  }

  if (isAtsUrl(url)) {
    score += 120;
  }

  if (ATS_HINTS.some((hint) => haystack.includes(hint))) {
    score += 80;
  }

  if (CAREER_PATH_HINTS.some((hint) => haystack.includes(hint))) {
    score += 70;
  }

  if (/\b(career|careers|jobs|job|apply|join us|join-us|opportunit)/i.test(label)) {
    score += 32;
  }

  if (
    /\b(sign in|signin|login|privacy|terms|cookie|linkedin|unstop|savedjobs|recommendedjobs|actioncenter|profile|previous applications|application history|view previous)\b/i.test(
      haystack,
    )
  ) {
    score -= 120;
  }

  return score;
}

function buildCareerCandidates(companyWebsite: string) {
  const origin = new URL(companyWebsite).origin;
  const domain = getDomain(companyWebsite);

  if (!domain) {
    return [origin];
  }

  return [
    `https://careers.${domain}`,
    `https://jobs.${domain}`,
    `${origin}/careers`,
    `${origin}/careers/`,
    `${origin}/jobs`,
    `${origin}/jobs/`,
    `${origin}/careers/jobs`,
    `${origin}/careers/search`,
    `${origin}/work-with-us`,
    origin,
  ];
}

async function fetchCareerPage(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "job-scraper/1.0 (+https://localhost)",
      },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(7000),
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("text/html")) {
      return null;
    }

    return {
      html: await response.text(),
      finalUrl: response.url,
    };
  } catch {
    return null;
  }
}

async function resolveCareerApplicationUrl(companyWebsite: string) {
  const companyDomain = getDomain(companyWebsite);
  const seen = new Set<string>();

  for (const candidate of buildCareerCandidates(companyWebsite)) {
    if (seen.has(candidate)) {
      continue;
    }

    seen.add(candidate);

    const result = await fetchCareerPage(candidate);

    if (!result) {
      continue;
    }

    const $ = load(result.html);
    const discoveredLinks = $("a[href]")
      .toArray()
      .flatMap((element) => {
        const href = normalizeCandidateUrl($(element).attr("href"), result.finalUrl);

        if (!href) {
          return [];
        }

        const label = compactWhitespace(
          [$(element).text(), $(element).attr("aria-label"), $(element).attr("title")]
            .filter(Boolean)
            .join(" "),
        );

        return [{ href, label }];
      })
      .sort(
        (left, right) =>
          scoreCareerLink(right.href, right.label, companyDomain) -
          scoreCareerLink(left.href, left.label, companyDomain),
      );

    const bestDiscovered = discoveredLinks.find(
      (entry) => scoreCareerLink(entry.href, entry.label, companyDomain) >= 120,
    );

    if (bestDiscovered) {
      return bestDiscovered.href;
    }

    if (scoreCareerLink(result.finalUrl, "", companyDomain) >= 70) {
      return result.finalUrl;
    }
  }

  return null;
}

async function resolveCompanyTarget(companyName: string): Promise<CompanyTarget> {
  const resolvedCompany = await resolveCompanyWebsite(companyName);

  if (!resolvedCompany.companyWebsite) {
    return {
      applicationUrl: null,
      companyWebsite: null,
      pictureUrl: resolvedCompany.pictureUrl,
    };
  }

  const applicationUrl =
    (await resolveCareerApplicationUrl(resolvedCompany.companyWebsite)) ??
    resolvedCompany.companyWebsite;

  return {
    applicationUrl,
    companyWebsite: resolvedCompany.companyWebsite,
    pictureUrl: resolvedCompany.pictureUrl,
  };
}

export async function preferOfficialCompanyLink(seed: JobSeed): Promise<JobSeed> {
  if (!isAggregatorUrl(seed.applicationUrl ?? seed.sourceUrl)) {
    return seed;
  }

  const companyKey = buildCompanyKey(seed.companyName);
  const targetPromise =
    companyTargetCache.get(companyKey) ??
    domainLookupLimit(() => resolveCompanyTarget(seed.companyName));

  if (!companyTargetCache.has(companyKey)) {
    companyTargetCache.set(companyKey, targetPromise);
  }

  const target = await targetPromise;

  if (!target.applicationUrl && !target.companyWebsite && !target.pictureUrl) {
    return seed;
  }

  return {
    ...seed,
    applicationUrl: target.applicationUrl ?? seed.applicationUrl,
    companyWebsite: target.companyWebsite ?? seed.companyWebsite,
    pictureUrl: seed.pictureUrl ?? target.pictureUrl,
  };
}
