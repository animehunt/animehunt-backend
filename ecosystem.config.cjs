/* PM2 process manager config — replaces the process supervision Workers
   gave you for free.

   Named .cjs, not .js: package.json sets "type": "module" for the rest of
   this project (needed for the ESM `import` syntax used everywhere else),
   but PM2 loads this file with require(), which can't parse ES module
   syntax. A plain .js file here would inherit "type": "module" from
   package.json and fail to load; .cjs forces Node to treat it as
   CommonJS regardless, which is what module.exports below actually is.

   Usage on the VPS:
     npm install -g pm2
     pm2 start ecosystem.config.cjs
     pm2 save
     pm2 startup        # follow the printed instructions to survive reboots
     pm2 install pm2-logrotate   # logs grow unbounded otherwise
*/
module.exports = {
  apps: [
    {
      name:        "animehunt-backend",
      script:      "src/index.js",
      cwd:         __dirname,
      instances:   1,              // KEEP AT 1 — the in-memory manual-run
                                    // rate-limit in routes/ai.js (POST /ai/run)
                                    // relies on a single process instance to
                                    // stay accurate. Switching to PM2 cluster
                                    // mode (multiple instances) would need
                                    // that rate limit moved into Redis first.
      exec_mode:   "fork",
      autorestart: true,
      watch:       false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production"
        // Actual secrets come from the .env file (loaded by your process
        // manager or a tool like dotenv-cli), not hardcoded here.
      }
    }
  ]
}
