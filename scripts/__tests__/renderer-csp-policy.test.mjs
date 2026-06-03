import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const viteConfig = readFileSync("vite.renderer.config.mjs", "utf8");
const electronMain = readFileSync("src/main.js", "utf8");

const extractStringConstant = (source, name) => {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stringMatch = source.match(new RegExp(`const\\s+${escapedName}\\s*=\\s*"([^"]+)"\\s*;`));
  if (stringMatch) {
    return stringMatch[1];
  }

  const arrayMatch = source.match(new RegExp(`const\\s+${escapedName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\.join\\("; "\\)`));
  if (!arrayMatch) {
    throw new Error(`Could not find ${name}`);
  }

  return [...arrayMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]).join("; ");
};

const parseDirectives = (policy) => {
  const directives = new Map();
  for (const part of policy.split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length > 0) {
      directives.set(tokens[0], tokens.slice(1));
    }
  }
  return directives;
};

const assertNoBroadNetworkSources = (policy, name) => {
  const directives = parseDirectives(policy);
  for (const directiveName of ["connect-src", "img-src", "media-src"]) {
    const values = directives.get(directiveName) || [];
    for (const broadSource of ["http:", "https:", "ws:", "wss:"]) {
      assert.equal(
        values.includes(broadSource),
        false,
        `${name} ${directiveName} must not allow broad ${broadSource}`,
      );
    }
  }
};

const assertProductionConnectSources = (policy, name) => {
  const connectSources = parseDirectives(policy).get("connect-src") || [];
  assert(connectSources.includes("'self'"), `${name} connect-src should keep same-origin access`);
  assert(connectSources.includes("https://lanaya.space"), `${name} connect-src should allow production API`);
  assert(connectSources.includes("wss://lanaya.space"), `${name} connect-src should allow production websocket and LiveKit`);
};

test("production renderer CSP is restricted to explicit production origins", () => {
  const prodRendererCsp = extractStringConstant(viteConfig, "PROD_RENDERER_CSP");
  const prodElectronCsp = extractStringConstant(electronMain, "PROD_RENDERER_CONTENT_SECURITY_POLICY");

  for (const [name, policy] of [
    ["vite", prodRendererCsp],
    ["electron", prodElectronCsp],
  ]) {
    assertNoBroadNetworkSources(policy, name);
    assertProductionConnectSources(policy, name);
  }
});

test("development renderer CSP remains broad enough for local proxies", () => {
  const devRendererCsp = extractStringConstant(viteConfig, "DEV_RENDERER_CSP");
  const devElectronCsp = extractStringConstant(electronMain, "DEV_RENDERER_CONTENT_SECURITY_POLICY");

  for (const [name, policy] of [
    ["vite dev", devRendererCsp],
    ["electron dev", devElectronCsp],
  ]) {
    const connectSources = parseDirectives(policy).get("connect-src") || [];
    assert(connectSources.includes("http:"), `${name} connect-src should support local HTTP backends`);
    assert(connectSources.includes("ws:"), `${name} connect-src should support local websocket backends`);
  }
});
