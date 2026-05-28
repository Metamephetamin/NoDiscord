import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("storage backup timer is installed through deploy", () => {
  const expectedFiles = [
    "scripts/storage-backup.sh",
    "infra/systemd/nodiscord-storage-backup.service",
    "infra/systemd/nodiscord-storage-backup.timer",
    "docs/release/storage-backup-restore.md",
  ];

  for (const filePath of expectedFiles) {
    assert.equal(existsSync(filePath), true, `${filePath} should exist`);
  }

  const script = read("scripts/storage-backup.sh");
  const service = read("infra/systemd/nodiscord-storage-backup.service");
  const timer = read("infra/systemd/nodiscord-storage-backup.timer");
  const deployWorkflow = read(".github/workflows/deploy.yml");
  const freeScalingDoc = read("docs/release/free-scaling.md");

  assert.match(script, /Storage__Root/);
  assert.match(script, /tar/);
  assert.match(script, /--exclude=.*upload-\*\.tmp/);
  assert.match(script, /STORAGE_BACKUP_RETENTION_DAYS/);
  assert.doesNotMatch(script, /cat\s+"\$storage_root"/);
  assert.match(service, /EnvironmentFile=-\/opt\/nodiscord\/\.deploy\/backend\/\.env/);
  assert.match(timer, /nodiscord-storage-backup\.service/);
  assert.match(deployWorkflow, /storage-backup\.sh/);
  assert.match(deployWorkflow, /nodiscord-storage-backup\.timer/);
  assert.match(deployWorkflow, /systemctl enable --now nodiscord-storage-backup\.timer/);
  assert.match(freeScalingDoc, /storage-backup\.timer/);
});
