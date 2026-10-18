// E2E 用: 空のローカル D1 を作り、モック Google を指す設定で wrangler dev を起動する。
import { rmSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';

const PORT = process.env.E2E_PORT || '8788';
const STATE = '.e2e-state';

rmSync(STATE, { recursive: true, force: true });

const migrate = spawnSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', STATE], {
  stdio: 'inherit',
});
if (migrate.status !== 0) process.exit(migrate.status ?? 1);

const dev = spawn(
  'npx',
  [
    'wrangler',
    'dev',
    '--local',
    '--port',
    PORT,
    '--persist-to',
    STATE,
    '--var',
    'GOOGLE_CLIENT_ID:test-client',
    '--var',
    'GOOGLE_CLIENT_SECRET:test-secret',
    '--var',
    'GOOGLE_AUTH_URL:http://localhost:9099/authorize',
    '--var',
    'GOOGLE_TOKEN_URL:http://localhost:9099/token',
  ],
  { stdio: 'inherit' },
);

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => dev.kill(sig));
dev.on('exit', (code) => process.exit(code ?? 0));
