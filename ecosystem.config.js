/**
 * PM2 ecosystem do PsiClinic.
 *
 *   psiclinic-backend   uvicorn FastAPI ouvindo em 127.0.0.1:4220 (nginx proxia)
 *   psiclinic-frontend  next start ouvindo em 127.0.0.1:3010 (nginx proxia)
 *
 * Os segredos vêm de /opt/psiclinic-infra/.secrets.env carregados via
 * `--update-env` ao reload, ou exportados no shell antes de iniciar.
 *
 * Comandos úteis:
 *   pm2 start /opt/psiclinic/ecosystem.config.js
 *   pm2 reload psiclinic-backend --update-env
 *   pm2 logs psiclinic-backend --lines 100
 *   pm2 save && pm2 startup    # autostart no boot
 */
module.exports = {
  apps: [
    {
      name: 'psiclinic-backend',
      cwd: '/opt/psiclinic/backend',
      script: '/opt/psiclinic/backend/.venv/bin/uvicorn',
      args: 'app.main:app --host 127.0.0.1 --port 4220 --workers 2',
      interpreter: 'none',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '15s',
      max_memory_restart: '600M',
      kill_timeout: 5000,
      env: {
        APP_ENV: 'prod',
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8',
      },
      out_file: '/var/log/psiclinic/backend.out.log',
      error_file: '/var/log/psiclinic/backend.err.log',
      time: true,
    },
    {
      name: 'psiclinic-frontend',
      cwd: '/opt/psiclinic/frontend',
      // Chama o binário do next direto, evitando o `-p 3000` hardcoded em
      // package.json:scripts.start. -H 127.0.0.1 amarra ao loopback —
      // só o nginx alcança.
      script: '/opt/psiclinic/frontend/node_modules/.bin/next',
      args: 'start -p 3010 -H 127.0.0.1',
      interpreter: 'none',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '15s',
      max_memory_restart: '600M',
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
      },
      out_file: '/var/log/psiclinic/frontend.out.log',
      error_file: '/var/log/psiclinic/frontend.err.log',
      time: true,
    },
  ],
};
