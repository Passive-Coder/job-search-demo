import { decode } from "he";

export function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function stripHtml(value: string): string {
  const decoded = decode(decode(value));

  const withoutScripts = decoded
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");

  const withoutTags = withoutScripts.replace(/<[^>]+>/g, " ");

  return compactWhitespace(decode(withoutTags));
}

export function summarizeText(value: string, limit = 180): string {
  const cleaned = compactWhitespace(value);

  if (cleaned.length <= limit) {
    return cleaned;
  }

  const sliced = cleaned.slice(0, limit);
  const boundary = sliced.lastIndexOf(" ");

  return `${sliced.slice(0, boundary > 60 ? boundary : limit).trim()}...`;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function toKebabCase(value: string): string {
  return compactWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
