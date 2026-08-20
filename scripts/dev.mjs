import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const apiPort = process.env.FRESCOOP_API_PORT || '4174';

const server = spawn('node', ['server/index.js'], {
  cwd: root,
  env: { ...process.env, PORT: apiPort, FRESCOOP_HOST: '127.0.0.1' },
  stdio: 'inherit',
});

setTimeout(() => {
  const vite = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '5173'], {
    cwd: root,
    env: { ...process.env, FRESCOOP_API_PORT: apiPort },
    stdio: 'inherit',
    shell: true,
  });

  vite.on('exit', (code) => { server.kill(); process.exit(code); });
}, 1500);

server.on('exit', (code) => { process.exit(code); });
process.on('SIGINT', () => { server.kill(); process.exit(0); });
