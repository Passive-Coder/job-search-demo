import { load } from "cheerio";
import pLimit from "p-limit";

import {
  EXTERNAL_ROLE_SEARCH_TERMS,
  LINKEDIN_PAGE_STARTS,
} from "@/lib/jobs/source-config";
import type { JobSeed, ProviderResult } from "@/lib/jobs/types";
import { asDate, fetchText, finalizeJobSeed } from "@/lib/jobs/providers/shared";

function buildLinkedInSearchUrl(searchTerm: string, start: number) {
  const params = new URLSearchParams({
    keywords: searchTerm,
    location: "Worldwide",
    start: String(start),
  });

  return `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${params.toString()}`;
}

function extractPostingId(value: string | undefined, fallback: string) {
  const urnMatch = value?.match(/jobPosting:(\d+)/);

  if (urnMatch) {
    return urnMatch[1];
  }

  const fallbackMatch = fallback.match(/-(\d+)(?:[/?]|$)/);
  return fallbackMatch?.[1] ?? fallback;
}

function normalizeLinkedInImage(value: string | undefined) {
  if (!value) {
    return null;
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  if (value.startsWith("//")) {
    return `https:${value}`;
  }

  return null;
}

export async function scrapeLinkedInJobs(): Promise<ProviderResult> {
  const requestLimit = pLimit(4);
  const errors: string[] = [];

  const settled = await Promise.allSettled(
    EXTERNAL_ROLE_SEARCH_TERMS.flatMap((searchTerm) =>
      LINKEDIN_PAGE_STARTS.map((start) =>
        requestLimit(async () => {
          const html = await fetchText(
            buildLinkedInSearchUrl(searchTerm, start),
            {
              headers: {
                "Accept-Language": "en-US,en;q=0.9",
              },
            },
            12000,
          );
          const $ = load(html);

          return $("li")
            .toArray()
            .flatMap((element): JobSeed[] => {
              const card = $(element);
              const link = card.find("a.base-card__full-link").attr("href")?.trim();
              const title = card.find("h3.base-search-card__title").text().trim();
              const companyName = card
                .find("h4.base-search-card__subtitle")
                .text()
                .trim();

              if (!link || !title || !companyName) {
                return [];
              }

              const location =
                card.find(".job-search-card__location").text().trim() || "Global";
              const image =
                normalizeLinkedInImage(card.find("img").attr("data-delayed-url")) ??
                normalizeLinkedInImage(card.find("img").attr("src"));
              const postedAt = asDate(card.find("time").attr("datetime"));
              const tags = [searchTerm, location, "LinkedIn"].filter(Boolean);

              const seed = finalizeJobSeed({
                externalId: extractPostingId(
                  card.find("[data-entity-urn]").attr("data-entity-urn"),
                  link,
                ),
                provider: "linkedin",
                providerKind: "aggregator",
                providerLabel: "LinkedIn",
                sourcePriority: 34,
                companyName,
                title,
                descriptionSource: `${searchTerm} role at ${companyName}. ${location}.`,
                fallbackSummary: tags.join(" · "),
                location,
                employmentType: null,
                remote: /remote/i.test(searchTerm) || /remote/i.test(location),
                sourceUrl: link,
                applicationUrl: link,
                companyWebsite: null,
                pictureUrl: image,
                postedAt,
                tags,
              });

              return seed ? [seed] : [];
            });
        }),
      ),
    ),
  );

  const jobs = settled.flatMap((result) => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
    return [];
  });

  return {
    provider: "linkedin",
    fetched: jobs.length,
    jobs,
    errors,
  };
}
