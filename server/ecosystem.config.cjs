module.exports = {
  apps: [{
    name: 'pitchroom-server',
    script: './index.js',
    watch: true,
    ignore_watch: [
      'node_modules',
      'logs',
      'recordings',
      'uploads',
      'temp',
      '.git',
      '*.log',
      'ecosystem.config.cjs'
    ],
    watch_delay: 1000,
    time: true,
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production',
      watch: false
    }
  }]
};