export const ALL_ROLE_VALUE = "all" as const;

export const SOFTWARE_ROLES = [
  {
    id: "software-engineer",
    label: "Software Engineer",
    blurb: "Generalist IC roles spanning product, platform, and applied engineering.",
    keywords: [
      "software engineer",
      "software developer",
      "application engineer",
      "full cycle developer",
      "member of technical staff",
    ],
  },
  {
    id: "frontend-engineer",
    label: "Frontend Engineer",
    blurb: "UI-heavy roles focused on web performance, design systems, and product polish.",
    keywords: [
      "frontend",
      "front end",
      "front-end",
      "ui engineer",
      "web engineer",
      "react",
      "javascript engineer",
      "typescript engineer",
    ],
  },
  {
    id: "backend-engineer",
    label: "Backend Engineer",
    blurb: "API, distributed systems, and services work behind the product surface.",
    keywords: [
      "backend",
      "back end",
      "back-end",
      "server-side",
      "api engineer",
      "distributed systems",
      "services engineer",
    ],
  },
  {
    id: "full-stack-engineer",
    label: "Full Stack Engineer",
    blurb: "Cross-stack product builders covering both client and server systems.",
    keywords: [
      "full stack",
      "full-stack",
      "fullstack",
      "full stack engineer",
      "full stack developer",
    ],
  },
  {
    id: "mobile-engineer",
    label: "Mobile Engineer",
    blurb: "Native or cross-platform Android and iOS engineering roles.",
    keywords: [
      "mobile engineer",
      "mobile developer",
      "android",
      "ios",
      "ios engineer",
      "android engineer",
      "react native",
      "flutter",
    ],
  },
  {
    id: "data-engineer",
    label: "Data Engineer",
    blurb: "Pipeline, warehousing, analytics infra, and data platform jobs.",
    keywords: [
      "data engineer",
      "analytics engineer",
      "data platform",
      "etl",
      "elt",
      "data pipeline",
      "big data",
    ],
  },
  {
    id: "machine-learning-engineer",
    label: "ML Engineer",
    blurb: "Applied AI, ML systems, model serving, and inference infrastructure roles.",
    keywords: [
      "machine learning",
      "ml engineer",
      "ai engineer",
      "applied scientist",
      "model serving",
      "llm",
      "generative ai",
      "artificial intelligence",
    ],
  },
  {
    id: "devops-engineer",
    label: "DevOps Engineer",
    blurb: "Delivery pipelines, cloud automation, and platform operations roles.",
    keywords: [
      "devops",
      "platform engineer",
      "cloud engineer",
      "infrastructure engineer",
      "release engineer",
      "build engineer",
      "ci/cd",
    ],
  },
  {
    id: "site-reliability-engineer",
    label: "SRE",
    blurb: "Reliability, observability, incident response, and production engineering roles.",
    keywords: [
      "site reliability",
      "sre",
      "production engineer",
      "reliability engineer",
      "observability",
      "incident response",
    ],
  },
  {
    id: "security-engineer",
    label: "Security Engineer",
    blurb: "Application, cloud, detection, and offensive security engineering positions.",
    keywords: [
      "security engineer",
      "application security",
      "product security",
      "cloud security",
      "security platform",
      "detection engineer",
      "security software",
      "offensive security",
    ],
  },
] as const;

export type SoftwareRole = (typeof SOFTWARE_ROLES)[number];
export type SoftwareRoleId = SoftwareRole["id"];
export type RoleFilterValue = SoftwareRoleId | typeof ALL_ROLE_VALUE;

const ROLE_INDEX = new Map(
  SOFTWARE_ROLES.map((role) => [role.id, role]),
);

export function getRoleById(roleId: SoftwareRoleId): SoftwareRole {
  return ROLE_INDEX.get(roleId)!;
}

function scoreNeedle(text: string, needle: string, title: string): number {
  const loweredNeedle = needle.toLowerCase();

  let score = 0;

  if (text.includes(loweredNeedle)) {
    score += 1;
  }

  if (title.includes(loweredNeedle)) {
    score += 3;
  }

  return score;
}

export function classifyRoles(
  title: string,
  summary: string,
  tags: string[] = [],
): { primaryRole: SoftwareRoleId | null; matchedRoles: SoftwareRoleId[] } {
  const normalizedTitle = title.toLowerCase();
  const corpus = `${normalizedTitle} ${summary.toLowerCase()} ${tags
    .join(" ")
    .toLowerCase()}`;

  const scored = SOFTWARE_ROLES.map((role) => {
    const score = role.keywords.reduce((total, needle) => {
      return total + scoreNeedle(corpus, needle, normalizedTitle);
    }, 0);

    return {
      id: role.id,
      score,
    };
  }).filter((entry) => entry.score > 0);

  if (scored.length === 0) {
    return {
      primaryRole: null,
      matchedRoles: [],
    };
  }

  scored.sort((left, right) => right.score - left.score);

  const matchedRoles = scored.map((entry) => entry.id);

  return {
    primaryRole: matchedRoles[0],
    matchedRoles,
  };
}
