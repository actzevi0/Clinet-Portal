// ecosystem.config.cjs – PM2 config for EasyFinance dev sandbox
module.exports = {
  apps: [
    {
      name: 'easyfinance-dev',
      script: 'npx',
      args: 'wrangler pages dev . --ip 0.0.0.0 --port 3000',
      cwd: '/home/user/webapp',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    }
  ]
};
