import {
  createHash,
} from "node:crypto";

import {
  CloudClient,
  type Collection,
  type Metadata,
} from "chromadb";

import {
  ALL_ROLE_VALUE,
  SOFTWARE_ROLES,
  type RoleFilterValue,
  type SoftwareRoleId,
} from "@/lib/jobs/roles";
import type { StoredJobRecord } from "@/lib/jobs/types";

const VECTOR_DIMENSIONS = 192;
const COLLECTION_NAME = process.env.CHROMA_COLLECTION ?? "job-scraper-jobs-v2";
const UPSERT_BATCH_SIZE = 10;
const LIST_BATCH_SIZE = 200;

type ChromaJobMetadata = {
  canonicalKey: string;
  companyName: string;
  lastSeenAt: number;
  location: string;
  primaryRole: string;
  remote: boolean;
  title: string;
  updatedAt: number;
} & Metadata;

type RelatedJobMatch = {
  job: StoredJobRecord;
  score: number;
};

const ROLE_METADATA_KEYS = Object.fromEntries(
  SOFTWARE_ROLES.map((role) => [role.id, `role__${role.id.replace(/-/g, "_")}`]),
) as Record<SoftwareRoleId, string>;

let cachedCollectionPromise: Promise<Collection> | null = null;

function normalizeValue(value: string) {
  return value.trim().toLowerCase();
}

function tokenizeValue(value: string) {
  return normalizeValue(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

function hashToken(token: string) {
  let hash = 0;

  for (let index = 0; index < token.length; index += 1) {
    hash = (hash * 31 + token.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function normalizeVector(vector: number[]) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  if (!magnitude) {
    return vector;
  }

  return vector.map((value) => value / magnitude);
}

export function embedText(value: string) {
  const vector = new Array<number>(VECTOR_DIMENSIONS).fill(0);
  const tokens = tokenizeValue(value);

  if (tokens.length === 0) {
    return vector;
  }

  for (const token of tokens) {
    const hash = hashToken(token);
    const primaryIndex = hash % VECTOR_DIMENSIONS;
    const secondaryIndex = (hash >>> 8) % VECTOR_DIMENSIONS;

    vector[primaryIndex] += 1.2;
    vector[secondaryIndex] += 0.55;
  }

  return normalizeVector(vector);
}

function buildRoleMetadata(matchedRoles: SoftwareRoleId[]) {
  return Object.fromEntries(
    SOFTWARE_ROLES.map((role) => [ROLE_METADATA_KEYS[role.id], matchedRoles.includes(role.id)]),
  );
}

function createSearchText(job: StoredJobRecord) {
  return [
    job.title,
    job.companyName,
    job.description,
    job.shortDescription,
    job.location,
    job.tags.join(" "),
    job.matchedRoles.join(" "),
    job.providerLabel,
  ]
    .filter(Boolean)
    .join(" ");
}

function toChromaMetadata(job: StoredJobRecord): ChromaJobMetadata {
  return {
    canonicalKey: job.canonicalKey,
    title: job.title,
    companyName: job.companyName,
    location: job.location,
    primaryRole: job.primaryRole,
    remote: job.remote,
    lastSeenAt: new Date(job.lastSeenAt).getTime(),
    updatedAt: new Date(job.updatedAt).getTime(),
    ...buildRoleMetadata(job.matchedRoles),
  };
}

function parseStoredJob(document: string | null | undefined) {
  if (!document) {
    throw new Error("Chroma record is missing its payload document.");
  }

  return JSON.parse(document) as StoredJobRecord;
}

function clampText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function buildCompactStoredJob(
  job: StoredJobRecord,
  limits: {
    description: number;
    shortDescription: number;
    searchText: number;
  },
): StoredJobRecord {
  return {
    ...job,
    description: clampText(job.description, limits.description),
    shortDescription: clampText(job.shortDescription, limits.shortDescription),
    searchText: clampText(job.searchText, limits.searchText),
    sourceSnapshots: [],
  };
}

function serializeStoredJob(job: StoredJobRecord) {
  const candidates = [
    buildCompactStoredJob(job, {
      description: 1800,
      shortDescription: 420,
      searchText: 2400,
    }),
    buildCompactStoredJob(job, {
      description: 900,
      shortDescription: 320,
      searchText: 1400,
    }),
    buildCompactStoredJob(
      {
        ...job,
        description: job.shortDescription,
        searchText: [
          job.title,
          job.companyName,
          job.location,
          job.tags.join(" "),
          job.shortDescription,
        ]
          .filter(Boolean)
          .join(" "),
      },
      {
        description: 420,
        shortDescription: 260,
        searchText: 900,
      },
    ),
  ];

  for (const candidate of candidates) {
    const serialized = JSON.stringify(candidate);

    if (serialized.length <= 15000) {
      return serialized;
    }
  }

  return JSON.stringify(candidates[candidates.length - 1]);
}

function chunkItems<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function createRecordId(canonicalKey: string) {
  return createHash("sha256").update(canonicalKey).digest("hex");
}

function locationMatches(job: StoredJobRecord, location: string) {
  if (!location) {
    return true;
  }

  const normalizedLocation = normalizeValue(location);
  const jobLocation = normalizeValue(job.location);

  if (/remote/.test(normalizedLocation) && job.remote) {
    return true;
  }

  return jobLocation.includes(normalizedLocation);
}

function resolveChromaConfig() {
  const apiKey = process.env.CHROMA_API_KEY;
  const tenant = process.env.CHROMA_TENANT;
  const database = process.env.CHROMA_DATABASE;
  const missing = [
    !apiKey ? "CHROMA_API_KEY" : null,
    !tenant ? "CHROMA_TENANT" : null,
    !database ? "CHROMA_DATABASE" : null,
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `Missing Chroma configuration: ${missing.join(", ")}. Set them in .env.local or your deployment environment.`,
    );
  }

  return {
    apiKey,
    tenant,
    database,
    host: process.env.CHROMA_HOST,
    port: process.env.CHROMA_PORT ? Number(process.env.CHROMA_PORT) : undefined,
  };
}

async function getCollection() {
  if (!cachedCollectionPromise) {
    cachedCollectionPromise = (async () => {
      const config = resolveChromaConfig();
      const client = new CloudClient({
        apiKey: config.apiKey,
        tenant: config.tenant,
        database: config.database,
        host: config.host,
        port: config.port,
      });

      return client.getOrCreateCollection({
        name: COLLECTION_NAME,
        embeddingFunction: null,
        metadata: {
          app: "job-scraper",
          version: 2,
        },
      });
    })().catch((error) => {
      cachedCollectionPromise = null;
      throw error;
    });
  }

  return cachedCollectionPromise;
}

export async function listStoredJobs() {
  const collection = await getCollection();
  const total = await collection.count();

  if (total === 0) {
    return [] as StoredJobRecord[];
  }

  const jobs: StoredJobRecord[] = [];

  for (let offset = 0; offset < total; offset += LIST_BATCH_SIZE) {
    const batch = await collection.get<ChromaJobMetadata>({
      limit: LIST_BATCH_SIZE,
      offset,
      include: ["documents", "metadatas"],
    });

    for (const [index, metadata] of batch.metadatas.entries()) {
      try {
        const document = batch.documents[index] ?? null;
        const job = parseStoredJob(document);

        if (metadata) {
          jobs.push({
            ...job,
            canonicalKey: metadata.canonicalKey,
          });
          continue;
        }

        jobs.push(job);
      } catch {
        continue;
      }
    }
  }

  return jobs;
}

export async function getStoredJob(canonicalKey: string) {
  const collection = await getCollection();
  const result = await collection.get<ChromaJobMetadata>({
    where: {
      canonicalKey: {
        $eq: canonicalKey,
      },
    },
    limit: 1,
    include: ["documents", "metadatas"],
  });

  const document = result.documents[0] ?? null;
  const metadata = result.metadatas[0] ?? null;

  if (!document) {
    return null;
  }

  const job = parseStoredJob(document);
  return metadata ? { ...job, canonicalKey: metadata.canonicalKey } : job;
}

export async function upsertStoredJobs(records: StoredJobRecord[]) {
  if (records.length === 0) {
    return;
  }

  const collection = await getCollection();

  for (const batch of chunkItems(records, UPSERT_BATCH_SIZE)) {
    await collection.upsert({
      ids: batch.map((job) => createRecordId(job.canonicalKey)),
      embeddings: batch.map((job) => embedText(createSearchText(job))),
      documents: batch.map((job) => serializeStoredJob(job)),
      metadatas: batch.map((job) => toChromaMetadata(job)),
    });
  }
}

export async function queryRelatedJobs(options: {
  query: string;
  role?: RoleFilterValue;
  location?: string;
  limit?: number;
}) {
  const searchQuery = [
    options.query,
    options.role && options.role !== ALL_ROLE_VALUE
      ? SOFTWARE_ROLES.find((role) => role.id === options.role)?.label ?? ""
      : "",
    options.location ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  if (!searchQuery.trim()) {
    return [] as RelatedJobMatch[];
  }

  const collection = await getCollection();
  const queryResult = await collection.query<ChromaJobMetadata>({
    queryEmbeddings: [embedText(searchQuery)],
    nResults: Math.max((options.limit ?? 12) * 4, 24),
    include: ["documents", "metadatas", "distances"],
  });

  const rows = queryResult.rows()[0] ?? [];

  return rows
    .flatMap((row) => {
      try {
        const job = parseStoredJob(row.document ?? null);

        if (
          options.role &&
          options.role !== ALL_ROLE_VALUE &&
          !job.matchedRoles.includes(options.role)
        ) {
          return [];
        }

        if (!locationMatches(job, options.location ?? "")) {
          return [];
        }

        const distance = row.distance ?? 2;

        return [
          {
            job,
            score: Math.max(0, 1 - distance / 2),
          },
        ];
      } catch {
        return [];
      }
    })
    .slice(0, options.limit ?? 12);
}
