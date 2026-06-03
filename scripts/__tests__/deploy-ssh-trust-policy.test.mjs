import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const deployWorkflow = readFileSync(".github/workflows/deploy.yml", "utf8");
const productionSshWorkflows = [
  [".github/workflows/deploy.yml", deployWorkflow],
  [".github/workflows/deploy-landing.yml", readFileSync(".github/workflows/deploy-landing.yml", "utf8")],
  [".github/workflows/backend-diagnostics.yml", readFileSync(".github/workflows/backend-diagnostics.yml", "utf8")],
];

test("deploy SSH trust is pinned instead of TOFU", () => {
  assert.match(
    deployWorkflow,
    /DEPLOY_SSH_KNOWN_HOSTS:\s*\$\{\{\s*secrets\.DEPLOY_SSH_KNOWN_HOSTS\s*\}\}/,
    "deploy workflow should require pinned known_hosts material from secrets",
  );
  assert.match(
    deployWorkflow,
    /DEPLOY_SSH_KNOWN_HOSTS is empty or missing/,
    "deploy validation should fail when pinned host keys are missing",
  );
  assert.match(
    deployWorkflow,
    /UserKnownHostsFile=\$HOME\/\.ssh\/known_hosts/,
    "ssh commands should use the pinned known_hosts file explicitly",
  );
  assert.match(
    deployWorkflow,
    /StrictHostKeyChecking=yes/,
    "ssh commands should fail on host-key mismatch",
  );
  assert.doesNotMatch(
    deployWorkflow,
    /ssh-keyscan|StrictHostKeyChecking=accept-new/,
    "deploy workflow must not trust first-use host keys",
  );
});

test("production SSH workflows use pinned host keys", () => {
  for (const [workflowPath, workflowSource] of productionSshWorkflows) {
    assert.match(
      workflowSource,
      /DEPLOY_SSH_KNOWN_HOSTS:\s*\$\{\{\s*secrets\.DEPLOY_SSH_KNOWN_HOSTS\s*\}\}/,
      `${workflowPath} should read pinned known_hosts material from secrets`,
    );
    assert.match(
      workflowSource,
      /UserKnownHostsFile=\$HOME\/\.ssh\/known_hosts/,
      `${workflowPath} should force ssh to use the pinned known_hosts file`,
    );
    assert.match(
      workflowSource,
      /StrictHostKeyChecking=yes/,
      `${workflowPath} should fail on host-key mismatch`,
    );
    assert.doesNotMatch(
      workflowSource,
      /ssh-keyscan|StrictHostKeyChecking=accept-new/,
      `${workflowPath} must not trust first-use host keys`,
    );
  }
});

test("certbot registration uses a monitored ops email", () => {
  assert.match(
    deployWorkflow,
    /CERTBOT_EMAIL:\s*\$\{\{\s*secrets\.CERTBOT_EMAIL\s*\}\}/,
    "deploy workflow should read certbot contact email from a secret",
  );
  assert.match(
    deployWorkflow,
    /CERTBOT_EMAIL is empty or missing/,
    "deploy should fail before certbot when contact email is missing",
  );
  assert.match(
    deployWorkflow,
    /certbot certonly[\s\S]*--email \\"\\\$CERTBOT_EMAIL\\"/,
    "certbot should register with the monitored contact email inside the remote SSH script",
  );
  assert.doesNotMatch(
    deployWorkflow,
    /--register-unsafely-without-email/,
    "certbot should not register without an email contact",
  );
});
