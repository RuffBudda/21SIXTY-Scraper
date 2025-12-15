/**
 * PM2 Ecosystem Configuration for 2160 Scraper
 * Optimized for DigitalOcean $6 droplet (1GB RAM, 1 vCPU)
 */
module.exports = {
  apps: [{
    name: 'scraper',
    script: 'npm',
    args: 'start',
    cwd: '/var/www/scraper',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    error_file: '/var/log/scraper/error.log',
    out_file: '/var/log/scraper/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '800M', // Restart if memory exceeds 800MB
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000,
  }],
};

