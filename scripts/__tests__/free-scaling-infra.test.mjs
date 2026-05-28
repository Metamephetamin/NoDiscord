import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("backend exposes optional Redis SignalR backplane configuration", () => {
  const projectFile = read("BackNoDiscord/BackNoDiscord/BackNoDiscord.csproj");
  const programSource = read("BackNoDiscord/BackNoDiscord/Program.cs");
  const envExample = read(".env.example");

  assert.match(projectFile, /Microsoft\.AspNetCore\.SignalR\.StackExchangeRedis/);
  assert.match(programSource, /Redis:ConnectionString/);
  assert.match(programSource, /AddStackExchangeRedis/);
  assert.match(programSource, /ChannelPrefix/);
  assert.match(envExample, /Redis__ConnectionString=/);
});

test("free production scaling templates are present", () => {
  const expectedFiles = [
    "infra/nginx/lanaya.space.load-balanced.conf",
    "infra/redis/docker-compose.yml",
    "infra/systemd/nodiscord-backend@.service",
    "infra/systemd/nodiscord-db-backup.service",
    "infra/systemd/nodiscord-db-backup.timer",
    "scripts/db-backup.sh",
    "docs/release/free-scaling.md",
  ];

  for (const filePath of expectedFiles) {
    assert.equal(existsSync(filePath), true, `${filePath} should exist`);
  }
});

test("backup and load-balancer templates use safe production defaults", () => {
  const backupScript = read("scripts/db-backup.sh");
  const backupService = read("infra/systemd/nodiscord-db-backup.service");
  const loadBalancedNginx = read("infra/nginx/lanaya.space.load-balanced.conf");
  const backendTemplate = read("infra/systemd/nodiscord-backend@.service");
  const redisCompose = read("infra/redis/docker-compose.yml");

  assert.match(backupScript, /pg_dump --format=custom --no-owner --no-acl/);
  assert.match(backupScript, /DB_BACKUP_RETENTION_DAYS/);
  assert.doesNotMatch(backupScript, /echo .*ConnectionStrings__DefaultConnection/);
  assert.match(backupService, /EnvironmentFile=-\/opt\/nodiscord\/\.deploy\/backend\/\.env/);

  assert.match(loadBalancedNginx, /upstream nodiscord_backend/);
  assert.match(loadBalancedNginx, /ip_hash/);
  assert.match(loadBalancedNginx, /proxy_pass http:\/\/nodiscord_backend/);
  assert.match(loadBalancedNginx, /location \/chatHub/);
  assert.match(loadBalancedNginx, /location \/voiceHub/);

  assert.match(backendTemplate, /Environment=ASPNETCORE_URLS=http:\/\/127\.0\.0\.1:%i/);
  assert.match(backendTemplate, /EnvironmentFile=-\/etc\/nodiscord\/backend-%i\.env/);

  assert.match(redisCompose, /redis:7-alpine/);
  assert.match(redisCompose, /appendonly yes/);
});

test("production deploy enables the single-server scaling layer", () => {
  const deployWorkflow = read(".github/workflows/deploy.yml");

  assert.match(deployWorkflow, /Enable free single-server scaling layer/);
  assert.match(deployWorkflow, /nodiscord-db-backup\.timer/);
  assert.match(deployWorkflow, /Redis__ConnectionString=127\.0\.0\.1:6379/);
  assert.match(deployWorkflow, /infra\/nginx\/lanaya\.space\.load-balanced\.conf/);
  assert.match(deployWorkflow, /nodiscord-backend@\.service/);
});
