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
  assert.match(backendTemplate, /NoNewPrivileges=true/);
  assert.match(backendTemplate, /PrivateTmp=true/);
  assert.match(backendTemplate, /ProtectSystem=full/);
  assert.match(backendTemplate, /CapabilityBoundingSet=\s*$/m);
  assert.match(backendTemplate, /RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX/);

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
  assert.match(deployWorkflow, /HEALTHCHECK="https:\/\/lanaya\.space"/);
});

test("production deploy creates a reviewed migration artifact without applying it", () => {
  const deployWorkflow = read(".github/workflows/deploy.yml");
  const publishIndex = deployWorkflow.indexOf("Publish backend");
  const backupTimerIndex = deployWorkflow.indexOf("nodiscord-db-backup.timer");
  const migrationScriptIndex = deployWorkflow.indexOf("backend-migrations.sql");
  const healthIndex = deployWorkflow.indexOf("Run production health checks");

  assert(publishIndex > 0, "Deploy workflow must publish backend before migration preflight.");
  assert(backupTimerIndex > publishIndex, "Backup timer installation must remain after backend publish.");
  assert(migrationScriptIndex > publishIndex, "Migration script must be generated after backend publish.");
  assert(healthIndex > migrationScriptIndex, "Production health check must run after migration script generation.");
  assert.match(deployWorkflow, /dotnet tool restore/);
  assert.match(deployWorkflow, /dotnet tool run dotnet-ef migrations script --idempotent/);
  assert.match(deployWorkflow, /actions\/upload-artifact@v4/);
  assert.doesNotMatch(deployWorkflow, /dotnet\s+(?:tool\s+run\s+)?dotnet-ef\s+database\s+update/);
  assert.doesNotMatch(deployWorkflow, /dotnet\s+ef\s+database\s+update/);
});
