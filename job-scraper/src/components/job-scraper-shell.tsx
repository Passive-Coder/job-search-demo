"use client";

/* eslint-disable @next/next/no-img-element */

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type FormEvent, useEffect, useRef, useState } from "react";

import {
  ALL_ROLE_VALUE,
  SOFTWARE_ROLES,
  type RoleFilterValue,
} from "@/lib/jobs/roles";
import type { JobCard, ScrapeSummary } from "@/lib/jobs/types";

gsap.registerPlugin(ScrollTrigger);

type JobsResponse = {
  items: JobCard[];
  meta: {
    total: number;
    lastSeenAt: string | null;
    scrape: ScrapeSummary | null;
  };
};

const RESULT_LIMIT = 100;
const CASE_RATIO = 1.58;

function formatRelative(value: string | null) {
  if (!value) {
    return "freshly indexed";
  }

  const date = new Date(value);
  const diffMs = date.getTime() - Date.now();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const formatter = new Intl.RelativeTimeFormat("en", {
    numeric: "auto",
  });

  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, "hour");
  }

  return formatter.format(Math.round(diffHours / 24), "day");
}

function formatDuration(value: number) {
  if (value < 1000) {
    return `${value}ms`;
  }

  return `${(value / 1000).toFixed(1)}s`;
}

function getInitials(value: string) {
  return value
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function humanizeError(message: string) {
  if (/vector|index/i.test(message)) {
    return "The local vector index is warming up. Retry the search in a moment.";
  }

  if (/timed out|timeout/i.test(message)) {
    return "Live scraping took too long. Retry the search or use the scrape button again.";
  }

  return message;
}

export function JobScraperShell() {
  const [query, setQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [submittedLocation, setSubmittedLocation] = useState("");
  const [selectedRole, setSelectedRole] = useState<RoleFilterValue>(ALL_ROLE_VALUE);
  const [jobs, setJobs] = useState<JobCard[]>([]);
  const [total, setTotal] = useState(0);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [scrapeSummary, setScrapeSummary] = useState<ScrapeSummary | null>(null);
  const [requestNonce, setRequestNonce] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isScraping, setIsScraping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shellRef = useRef<HTMLDivElement | null>(null);
  const scrollSceneRef = useRef<HTMLDivElement | null>(null);
  const pinStageRef = useRef<HTMLDivElement | null>(null);
  const suitcaseFrameRef = useRef<HTMLDivElement | null>(null);
  const frontPanelRef = useRef<HTMLDivElement | null>(null);
  const innerShellRef = useRef<HTMLDivElement | null>(null);
  const contentDeckRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<HTMLDivElement | null>(null);
  const hingeRowRef = useRef<HTMLDivElement | null>(null);
  const searchClusterRef = useRef<HTMLDivElement | null>(null);
  const trayRef = useRef<HTMLDivElement | null>(null);
  const interiorGlowRef = useRef<HTMLDivElement | null>(null);
  const caseShadowRef = useRef<HTMLDivElement | null>(null);
  const forceScrapeRef = useRef(false);

  const executeSearch = (nextRole = selectedRole, nextForceScrape = true) => {
    setSelectedRole(nextRole);
    setSubmittedQuery(query.trim());
    setSubmittedLocation(locationQuery.trim());
    forceScrapeRef.current = nextForceScrape;
    setRequestNonce((value) => value + 1);
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    executeSearch();
  };

  useEffect(() => {
    const context = gsap.context(() => {
      gsap.set(suitcaseFrameRef.current, {
        top: "50%",
        left: "50%",
        width: `min(90vw, calc(90vh * ${CASE_RATIO}))`,
        height: `min(90vh, calc(90vw / ${CASE_RATIO}))`,
        xPercent: -50,
        yPercent: -50,
        borderRadius: 48,
        scale: 1,
        transformOrigin: "50% 50%",
      });
      gsap.set(frontPanelRef.current, {
        rotateX: 0,
        y: 0,
        z: 0,
        transformOrigin: "50% 100%",
        transformPerspective: 3200,
        transformStyle: "preserve-3d",
        backfaceVisibility: "hidden",
      });
      gsap.set(hingeRowRef.current, {
        autoAlpha: 1,
        transformOrigin: "50% 50%",
        transformPerspective: 2400,
      });
      gsap.set(innerShellRef.current, {
        top: 22,
        right: 22,
        bottom: 22,
        left: 22,
        borderRadius: 34,
      });
      gsap.set(contentDeckRef.current, {
        top: 34,
        right: 34,
        bottom: 34,
        left: 34,
        borderRadius: 30,
        autoAlpha: 0,
        scale: 0.96,
      });
      gsap.set(searchClusterRef.current, {
        autoAlpha: 0,
        y: 24,
      });
      gsap.set(trayRef.current, {
        autoAlpha: 0,
        y: 42,
      });
      gsap.set(interiorGlowRef.current, {
        autoAlpha: 0,
        scale: 0.84,
        transformOrigin: "50% 50%",
      });
      gsap.set(caseShadowRef.current, {
        scale: 0.82,
        autoAlpha: 0.56,
        transformOrigin: "50% 50%",
      });

      const timeline = gsap.timeline({
        defaults: {
          ease: "none",
        },
        scrollTrigger: {
          trigger: scrollSceneRef.current,
          pin: pinStageRef.current,
          start: "top top",
          end: "+=220%",
          scrub: 1,
          anticipatePin: 1,
        },
      });

      timeline
        .to(
          ".scene-orb",
          {
            yPercent: -10,
            scale: 1.06,
            stagger: 0.08,
            duration: 0.26,
          },
          0,
        )
        .to(
          caseShadowRef.current,
          {
            scale: 1.04,
            autoAlpha: 0.9,
            duration: 0.18,
          },
          0,
        )
        .to(
          frontPanelRef.current,
          {
            rotateX: 108,
            y: 92,
            z: 280,
            duration: 0.42,
          },
          0.04,
        )
        .to(
          hingeRowRef.current,
          {
            rotateX: -72,
            y: 16,
            duration: 0.28,
          },
          0.08,
        )
        .to(
          interiorGlowRef.current,
          {
            autoAlpha: 1,
            scale: 1,
            duration: 0.18,
          },
          0.16,
        )
        .to(
          contentDeckRef.current,
          {
            autoAlpha: 1,
            scale: 1,
            duration: 0.12,
          },
          0.22,
        )
        .to(
          suitcaseFrameRef.current,
          {
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            xPercent: 0,
            yPercent: 0,
            borderRadius: 0,
            duration: 0.44,
            ease: "power3.inOut",
          },
          0.36,
        )
        .to(
          innerShellRef.current,
          {
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            borderRadius: 0,
            duration: 0.34,
          },
          0.38,
        )
        .to(
          contentDeckRef.current,
          {
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            borderRadius: 0,
            duration: 0.34,
          },
          0.42,
        )
        .to(
          ".case-trim",
          {
            autoAlpha: 0,
            duration: 0.16,
          },
          0.48,
        )
        .to(
          [handleRef.current, hingeRowRef.current, caseShadowRef.current],
          {
            autoAlpha: 0,
            duration: 0.14,
          },
          0.56,
        )
        .to(
          frontPanelRef.current,
          {
            autoAlpha: 0,
            duration: 0.12,
          },
          0.6,
        )
        .to(
          searchClusterRef.current,
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.16,
          },
          0.66,
        )
        .to(
          trayRef.current,
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.18,
          },
          0.72,
        );
    }, shellRef);

    return () => context.revert();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      limit: String(RESULT_LIMIT),
    });
    const shouldScrape =
      forceScrapeRef.current ||
      Boolean(submittedQuery) ||
      Boolean(submittedLocation) ||
      selectedRole !== ALL_ROLE_VALUE ||
      requestNonce > 1;

    if (submittedQuery) {
      params.set("query", submittedQuery);
    }

    if (submittedLocation) {
      params.set("location", submittedLocation);
    }

    if (selectedRole !== ALL_ROLE_VALUE) {
      params.set("role", selectedRole);
    }

    if (shouldScrape) {
      params.set("scrape", "1");
    }

    queueMicrotask(() => {
      if (controller.signal.aborted) {
        return;
      }

      setIsLoading(true);
      setIsScraping(shouldScrape);
      setError(null);
    });

    fetch(`/api/jobs?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(payload?.error ?? "Unable to load jobs.");
        }

        return (await response.json()) as JobsResponse;
      })
      .then((payload) => {
        setJobs(payload.items);
        setTotal(payload.meta.total);
        setLastSeenAt(payload.meta.lastSeenAt);
        setScrapeSummary(payload.meta.scrape);
      })
      .catch((requestError: Error) => {
        if (controller.signal.aborted) {
          return;
        }

        setError(humanizeError(requestError.message));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setIsScraping(false);
          forceScrapeRef.current = false;
        }
      });

    return () => controller.abort();
  }, [requestNonce, selectedRole, submittedLocation, submittedQuery]);

  useEffect(() => {
    if (!trayRef.current) {
      return;
    }

    const cards = trayRef.current.querySelectorAll("[data-job-card]");

    if (!cards.length) {
      return;
    }

    gsap.fromTo(
      cards,
      {
        autoAlpha: 0,
        y: 48,
        rotateX: -14,
      },
      {
        autoAlpha: 1,
        y: 0,
        rotateX: 0,
        duration: 0.56,
        stagger: 0.03,
        ease: "power3.out",
      },
    );
  }, [jobs]);

  return (
    <div
      ref={shellRef}
      className="relative min-h-screen overflow-x-clip bg-[var(--background)]"
    >
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="scene-orb absolute left-[-12rem] top-[2%] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,_rgba(240,190,107,0.34),_transparent_66%)] blur-3xl" />
        <div className="scene-orb absolute right-[-9rem] top-[14%] h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,_rgba(255,234,196,0.58),_transparent_70%)] blur-3xl" />
        <div className="scene-orb absolute bottom-[10%] left-[8%] h-[22rem] w-[22rem] rounded-full bg-[radial-gradient(circle,_rgba(122,171,151,0.18),_transparent_72%)] blur-3xl" />
        <div className="scene-orb absolute bottom-[-5rem] right-[10%] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,_rgba(240,174,91,0.24),_transparent_72%)] blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(128,98,63,0.05)_1px,transparent_1px),linear-gradient(180deg,rgba(128,98,63,0.05)_1px,transparent_1px)] bg-[size:56px_56px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.92),_transparent_48%)]" />
      </div>

      <section
        ref={scrollSceneRef}
        className="relative h-[240vh]"
      >
        <div
          ref={pinStageRef}
          className="relative h-screen overflow-hidden"
        >
          <div className="absolute inset-0">
            <div className="relative h-full [perspective:3200px]">
              <div
                ref={caseShadowRef}
                className="pointer-events-none absolute left-1/2 top-[78%] h-32 w-[70vw] max-w-[72rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,_rgba(24,13,7,0.58),_transparent_72%)] blur-3xl"
              />

              <div
                ref={suitcaseFrameRef}
                className="absolute will-change-transform"
                style={{
                  top: "50%",
                  left: "50%",
                  width: `min(90vw, calc(90vh * ${CASE_RATIO}))`,
                  height: `min(90vh, calc(90vw / ${CASE_RATIO}))`,
                  borderRadius: 48,
                }}
              >
                <div className="case-trim absolute inset-0 rounded-[inherit] border border-[rgba(255,238,214,0.44)] bg-[linear-gradient(180deg,#e3b16b,#9a5a31)] shadow-[0_45px_120px_rgba(88,51,19,0.36)]" />
                <div className="case-trim absolute inset-[12px] rounded-[calc(inherit-8px)] border border-[rgba(119,72,35,0.26)] bg-[linear-gradient(180deg,#f0ce96,#bc703b)]" />
                <div className="case-trim absolute inset-x-[18px] bottom-[8px] h-[22px] rounded-b-[34px] bg-[linear-gradient(180deg,#8a5029,#5d3317)] opacity-90" />
                <div className="case-trim absolute bottom-[18px] left-[8px] top-[18px] w-[16px] rounded-l-[30px] bg-[linear-gradient(90deg,#cf8a48,#7b461f)] opacity-70" />
                <div className="case-trim absolute bottom-[18px] right-[8px] top-[18px] w-[16px] rounded-r-[30px] bg-[linear-gradient(90deg,#7b461f,#cf8a48)] opacity-70" />
                <div className="case-trim absolute inset-x-[7%] top-[9%] h-[1px] bg-[rgba(255,245,228,0.36)]" />
                <div className="case-trim absolute inset-x-[7%] bottom-[9%] h-[1px] bg-[rgba(123,79,38,0.28)]" />

                <div
                  ref={handleRef}
                  className="absolute left-1/2 top-[-18px] z-40 h-14 w-44 -translate-x-1/2 rounded-[20px_20px_10px_10px] border-[5px] border-[rgba(91,54,19,0.34)] bg-[linear-gradient(180deg,#fae0b6,#d6984a)] shadow-[0_20px_36px_rgba(78,47,17,0.16)]"
                />

                <div
                  ref={innerShellRef}
                  className="absolute z-10 overflow-hidden bg-[linear-gradient(180deg,#281c18,#120d0c)]"
                  style={{
                    top: 22,
                    right: 22,
                    bottom: 22,
                    left: 22,
                    borderRadius: 34,
                  }}
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(245,167,73,0.1),_transparent_40%)]" />
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:46px_46px]" />
                  <div className="absolute inset-[18px] rounded-[28px] border border-[rgba(255,232,196,0.08)]" />
                </div>

                <div
                  ref={interiorGlowRef}
                  className="pointer-events-none absolute inset-x-[16%] top-[12%] z-10 h-[28%] rounded-full bg-[radial-gradient(circle,_rgba(230,174,88,0.34),_transparent_72%)] blur-3xl"
                />

                <div
                  ref={contentDeckRef}
                  className="absolute z-20 flex flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(17,13,12,0.76),rgba(10,8,7,0.98))] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                  style={{
                    top: 34,
                    right: 34,
                    bottom: 34,
                    left: 34,
                    borderRadius: 30,
                  }}
                >
                  <div className="flex h-full w-full flex-col">
                    <div
                      ref={searchClusterRef}
                      className="relative z-10 border-b border-[rgba(255,239,214,0.12)] bg-[rgba(20,15,13,0.58)] backdrop-blur-2xl"
                      style={{
                        paddingInline: "clamp(16px, 2.2vw, 34px)",
                        paddingBlock: "clamp(14px, 1.8vh, 24px)",
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3 text-[#d9c09d]">
                          <div className="rounded-full border border-[rgba(255,239,214,0.12)] bg-[rgba(255,248,235,0.06)] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.28em]">
                            {total.toLocaleString()} indexed
                          </div>
                          <div className="rounded-full border border-[rgba(255,239,214,0.12)] bg-[rgba(255,248,235,0.06)] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.28em]">
                            {formatRelative(lastSeenAt)}
                          </div>
                          {scrapeSummary ? (
                            <div className="rounded-full border border-[rgba(255,239,214,0.12)] bg-[rgba(255,248,235,0.06)] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.28em]">
                              scraped {scrapeSummary.fetched.toLocaleString()} in {formatDuration(scrapeSummary.durationMs)}
                            </div>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          onClick={() => executeSearch(selectedRole, true)}
                          disabled={isLoading || isScraping}
                          className="rounded-full border border-[rgba(234,175,96,0.46)] bg-[rgba(225,161,76,0.14)] px-5 py-3 text-sm font-semibold text-[#f7d8a8] shadow-[0_16px_36px_rgba(0,0,0,0.22)] transition duration-300 hover:border-[rgba(245,190,112,0.7)] hover:bg-[rgba(225,161,76,0.22)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isScraping ? "Scraping live sources..." : "Scrape more related roles"}
                        </button>
                      </div>

                      <form
                        onSubmit={handleSearchSubmit}
                        className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(240px,0.75fr)] xl:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.75fr)_auto]"
                      >
                        <label className="group relative block w-full">
                          <span className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 font-mono text-2xl text-[rgba(85,63,39,0.48)] transition-transform duration-300 group-focus-within:scale-110">
                            /
                          </span>
                          <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search role, stack, company, or keyword"
                            className="w-full rounded-full border border-[rgba(228,210,182,0.26)] bg-[rgba(255,251,245,0.96)] pl-16 pr-6 text-base font-medium text-[var(--ink)] shadow-[0_28px_70px_rgba(6,4,2,0.24)] outline-none transition duration-300 placeholder:text-[rgba(85,63,39,0.52)] focus:border-[rgba(234,175,96,0.62)] focus:shadow-[0_36px_90px_rgba(6,4,2,0.28)] sm:text-lg"
                            style={{
                              height: "clamp(58px, 7vh, 78px)",
                            }}
                          />
                        </label>

                        <label className="group relative block w-full">
                          <span className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 font-mono text-sm uppercase tracking-[0.24em] text-[rgba(85,63,39,0.56)]">
                            LOC
                          </span>
                          <input
                            value={locationQuery}
                            onChange={(event) => setLocationQuery(event.target.value)}
                            placeholder="Location or Remote"
                            className="w-full rounded-full border border-[rgba(228,210,182,0.26)] bg-[rgba(255,251,245,0.96)] pl-20 pr-6 text-base font-medium text-[var(--ink)] shadow-[0_28px_70px_rgba(6,4,2,0.24)] outline-none transition duration-300 placeholder:text-[rgba(85,63,39,0.52)] focus:border-[rgba(234,175,96,0.62)] focus:shadow-[0_36px_90px_rgba(6,4,2,0.28)] sm:text-lg"
                            style={{
                              height: "clamp(58px, 7vh, 78px)",
                            }}
                          />
                        </label>

                        <button
                          type="submit"
                          className="flex h-[clamp(58px,7vh,78px)] items-center justify-center rounded-full border border-[rgba(234,175,96,0.46)] bg-[linear-gradient(180deg,#d59a4e,#b5722c)] px-8 text-base font-semibold text-white shadow-[0_24px_48px_rgba(0,0,0,0.22)] transition duration-300 hover:translate-y-[-1px] hover:shadow-[0_30px_56px_rgba(0,0,0,0.28)] md:col-span-2 xl:col-span-1"
                        >
                          Search
                        </button>
                      </form>

                      <div
                        className="mt-4 flex flex-wrap"
                        style={{
                          gap: "clamp(10px, 0.9vw, 16px)",
                        }}
                      >
                        {SOFTWARE_ROLES.map((role) => {
                          const active = selectedRole === role.id;

                          return (
                            <button
                              key={role.id}
                              type="button"
                              onClick={() => {
                                const nextRole =
                                  selectedRole === role.id ? ALL_ROLE_VALUE : role.id;
                                executeSearch(nextRole, true);
                              }}
                              className={`rounded-full border px-4 py-2.5 text-sm font-medium transition duration-300 ${
                                active
                                  ? "border-transparent bg-[var(--accent)] text-white shadow-[0_18px_40px_rgba(201,138,58,0.34)]"
                                  : "border-[rgba(255,236,208,0.16)] bg-[rgba(255,247,233,0.96)] text-[var(--ink)] shadow-[0_12px_28px_rgba(6,4,2,0.16)] hover:-translate-y-0.5 hover:border-[rgba(201,138,58,0.55)]"
                              }`}
                            >
                              {role.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div
                      ref={trayRef}
                      className="min-h-0 flex-1 overflow-y-auto"
                      style={{
                        paddingInline: "clamp(16px, 2.2vw, 34px)",
                        paddingTop: "clamp(18px, 2vh, 26px)",
                        paddingBottom: "clamp(22px, 2.8vh, 34px)",
                      }}
                    >
                      {error ? (
                        <div className="mb-5 rounded-[22px] border border-[rgba(255,170,144,0.26)] bg-[rgba(122,40,23,0.24)] px-4 py-3 text-sm text-[#ffd6c9]">
                          {error}
                        </div>
                      ) : null}

                      {isLoading && jobs.length === 0 ? (
                        <div
                          className="grid"
                          style={{
                            gap: "clamp(14px, 1.2vw, 22px)",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
                          }}
                        >
                          {Array.from({ length: 9 }, (_, index) => (
                            <div
                              key={index}
                              className="h-56 animate-pulse rounded-[24px] border border-[rgba(255,239,214,0.1)] bg-[rgba(255,251,245,0.08)]"
                            />
                          ))}
                        </div>
                      ) : jobs.length > 0 ? (
                        <div
                          className="grid content-start"
                          style={{
                            gap: "clamp(14px, 1.2vw, 22px)",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
                          }}
                        >
                          {jobs.map((job) => (
                            <a
                              key={job.id}
                              href={job.link}
                              target="_blank"
                              rel="noreferrer"
                              data-job-card
                              className="group rounded-[24px] border border-[rgba(255,239,214,0.1)] bg-[rgba(255,251,245,0.96)] p-5 text-[var(--ink)] shadow-[0_20px_58px_rgba(0,0,0,0.22)] transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_34px_80px_rgba(0,0,0,0.24)]"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex items-center gap-3">
                                  {job.pictureUrl ? (
                                    <img
                                      src={job.pictureUrl}
                                      alt={job.companyName}
                                      className="h-14 w-14 rounded-2xl border border-[rgba(113,90,61,0.12)] bg-[#fff7ea] object-cover shadow-sm"
                                    />
                                  ) : (
                                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[rgba(113,90,61,0.12)] bg-[linear-gradient(180deg,#fff5dc,#f6d699)] font-semibold text-[var(--ink)] shadow-sm">
                                      {getInitials(job.companyName)}
                                    </div>
                                  )}

                                  <div>
                                    <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-[var(--muted)]">
                                      {job.providerLabel}
                                    </p>
                                    <p className="mt-1 text-lg font-semibold leading-tight text-[var(--ink)]">
                                      {job.companyName}
                                    </p>
                                  </div>
                                </div>

                                <span className="rounded-full border border-[var(--line)] bg-[rgba(247,239,226,0.84)] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                                  {job.remote ? "Remote" : "On-site"}
                                </span>
                              </div>

                              <div className="mt-5 space-y-3">
                                <h3 className="text-2xl font-semibold leading-tight text-[var(--ink)] transition-colors duration-300 group-hover:text-[var(--accent-deep)]">
                                  {job.title}
                                </h3>
                                <p className="line-clamp-3 text-sm leading-6 text-[var(--muted)]">
                                  {job.shortDescription}
                                </p>
                              </div>

                              <div className="mt-5 flex flex-wrap gap-2">
                                <span className="rounded-full bg-[rgba(201,138,58,0.12)] px-3 py-1 text-xs font-medium text-[var(--accent-deep)]">
                                  {SOFTWARE_ROLES.find((role) => role.id === job.primaryRole)?.label}
                                </span>
                                {job.employmentType ? (
                                  <span className="rounded-full bg-[rgba(93,125,116,0.12)] px-3 py-1 text-xs font-medium text-[#35574e]">
                                    {job.employmentType}
                                  </span>
                                ) : null}
                                <span className="rounded-full bg-[rgba(122,106,90,0.09)] px-3 py-1 text-xs font-medium text-[var(--muted)]">
                                  {job.location}
                                </span>
                              </div>

                              <div className="mt-6 flex items-center justify-between text-sm text-[var(--muted)]">
                                <span>seen {formatRelative(job.lastSeenAt)}</span>
                                <span className="font-semibold text-[var(--accent-deep)]">
                                  Open role
                                </span>
                              </div>
                            </a>
                          ))}
                        </div>
                      ) : (
                        <div className="flex min-h-[42vh] items-center justify-center rounded-[26px] border border-dashed border-[rgba(255,239,214,0.12)] px-6 text-center text-sm text-[#d9c09d]">
                          No roles match the current search yet. Change the role, keyword, or location and scrape again.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div
                  ref={hingeRowRef}
                  className="absolute inset-x-0 bottom-[-14px] z-40 flex items-center justify-center gap-4 sm:gap-6"
                >
                  {Array.from({ length: 3 }, (_, index) => (
                    <div
                      key={index}
                      className="h-8 w-14 rounded-[10px] border-[3px] border-[rgba(95,57,22,0.4)] bg-[linear-gradient(180deg,#f2d19c,#bd743d)] shadow-[0_12px_20px_rgba(69,38,12,0.22)]"
                    />
                  ))}
                </div>

                <div
                  ref={frontPanelRef}
                  className="absolute inset-[12px] z-30 overflow-hidden rounded-[40px] border border-[rgba(107,67,29,0.18)] bg-[linear-gradient(180deg,#f7e3bf_0%,#e3b067_50%,#c5763e_100%)] shadow-[0_34px_90px_rgba(78,46,16,0.28)]"
                >
                  <div className="absolute inset-x-0 bottom-0 h-7 bg-[linear-gradient(180deg,#8e542a,#5a3116)]" />
                  <div className="absolute bottom-[10px] left-0 top-[10px] w-4 bg-[linear-gradient(90deg,#f7e3bf,#c47b3a)] opacity-80" />
                  <div className="absolute bottom-[10px] right-0 top-[10px] w-4 bg-[linear-gradient(90deg,#c47b3a,#8a5029)] opacity-80" />
                  <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.44),transparent_30%,transparent_72%,rgba(104,66,28,0.18))]" />
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(122,82,38,0.08)_1px,transparent_1px),linear-gradient(180deg,rgba(122,82,38,0.08)_1px,transparent_1px)] bg-[size:42px_42px] opacity-50" />
                  <div className="absolute inset-[7%] rounded-[30px] border border-[rgba(108,68,29,0.18)]" />
                  <div className="absolute left-[8%] right-[8%] top-[14%] h-[1px] bg-[rgba(255,247,230,0.3)]" />
                  <div className="absolute left-[8%] right-[8%] bottom-[14%] h-[1px] bg-[rgba(104,66,28,0.18)]" />
                  <div className="relative flex h-full flex-col items-center justify-center p-8 text-[#4b2c12]">
                    <div className="relative mb-10 flex h-36 w-40 items-center justify-center rounded-[32px] border-[4px] border-[#5d3915] bg-[rgba(255,250,244,0.2)] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
                      <div className="absolute left-1/2 top-[-26px] h-12 w-20 -translate-x-1/2 rounded-t-[18px] border-[4px] border-b-0 border-[#5d3915]" />
                      <div className="h-10 w-16 rounded-xl border-[4px] border-[#5d3915]" />
                      <div className="absolute inset-x-8 top-1/2 h-[4px] -translate-y-1/2 rounded-full bg-[#5d3915]" />
                    </div>

                    <div className="flex gap-5 opacity-70">
                      <div className="h-2.5 w-24 rounded-full bg-[rgba(93,57,21,0.24)]" />
                      <div className="h-2.5 w-32 rounded-full bg-[rgba(93,57,21,0.14)]" />
                    </div>
                    <div className="mt-4 flex gap-4 opacity-50">
                      <div className="h-2.5 w-28 rounded-full bg-[rgba(93,57,21,0.14)]" />
                      <div className="h-2.5 w-20 rounded-full bg-[rgba(93,57,21,0.14)]" />
                      <div className="h-2.5 w-24 rounded-full bg-[rgba(93,57,21,0.14)]" />
                    </div>

                    <div className="absolute bottom-[14%] font-mono text-[11px] uppercase tracking-[0.42em] text-[#74481f]">
                      scroll to open
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
