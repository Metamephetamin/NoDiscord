import { readFileSync } from "node:fs";
import path from "node:path";

export const repoRoot = path.resolve(import.meta.dirname, "../../..");

const CSS_IMPORT_RE = /^@import\s+["']([^"']+)["'];\s*$/gm;

const expandCssImports = (relativePath, source, seen = new Set()) =>
  source.replace(CSS_IMPORT_RE, (match, importPath) => {
    const nextRelativePath = path.posix.normalize(path.posix.join(path.posix.dirname(relativePath), importPath));
    if (seen.has(nextRelativePath)) {
      return "";
    }

    seen.add(nextRelativePath);
    return expandCssImports(nextRelativePath, readRepoFile(nextRelativePath), seen);
  });

export const readRepoFile = (relativePath) => {
  const normalizedPath = path.posix.normalize(relativePath);
  const source = readFileSync(path.join(repoRoot, normalizedPath), "utf8");

  if (normalizedPath.endsWith(".css")) {
    return expandCssImports(normalizedPath, source, new Set([normalizedPath]));
  }

  return source;
};

export const readRepoFileIfExists = (relativePath) => {
  try {
    return readRepoFile(relativePath);
  } catch {
    return "";
  }
};
