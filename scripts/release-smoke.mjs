const BASE_URL = process.env.RELEASE_SMOKE_BASE_URL || "https://lanaya.space";

const checks = [
  {
    name: "frontend",
    method: "GET",
    url: `${BASE_URL}/`,
    accept: (response, body) => response.status === 200 && body.length > 0,
  },
  {
    name: "api ping",
    method: "GET",
    url: `${BASE_URL}/api/ping`,
    accept: async (response) => {
      if (response.status !== 200) {
        return false;
      }

      try {
        const payload = await response.clone().json();
        return payload?.status === "ok";
      } catch {
        return false;
      }
    },
  },
  {
    name: "chat negotiate",
    method: "POST",
    url: `${BASE_URL}/chatHub/negotiate?negotiateVersion=1`,
    accept: (response) => response.status > 0 && response.status < 500,
  },
  {
    name: "voice negotiate",
    method: "POST",
    url: `${BASE_URL}/voiceHub/negotiate?negotiateVersion=1`,
    accept: (response) => response.status > 0 && response.status < 500,
  },
];

let failed = false;

for (const check of checks) {
  try {
    const response = await fetch(check.url, { method: check.method, redirect: "follow" });
    const body = check.name === "frontend" ? await response.text() : "";
    const accepted = await check.accept(response, body);
    const authNote = response.status === 401 ? " (auth enforced)" : "";
    console.log(`${accepted ? "ok" : "fail"} ${check.name}: HTTP ${response.status}${authNote}`);
    if (!accepted) {
      failed = true;
    }
  } catch (error) {
    failed = true;
    console.error(`fail ${check.name}: ${error?.message || String(error)}`);
  }
}

if (failed) {
  process.exitCode = 1;
}
