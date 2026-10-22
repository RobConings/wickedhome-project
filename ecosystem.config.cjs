// pm2 processes for WickedHome. Start one with: pm2 start ecosystem.config.cjs --only <name>
// Node's --env-file never overrides variables that are already set, so `env` below wins over .env.
module.exports = {
  apps: [
    {
      // Production: built app + API on 127.0.0.1:3100, nginx (home.example.be) proxies to it.
      name: "wickedhome",
      script: "dist/server.js",
      node_args: "--env-file=.env --enable-source-maps",
      env: { NODE_ENV: "production", PORT: "3100", HOST: "127.0.0.1", COOKIE_SECURE: "true" },
    },
    {
      // Development: API + Vite with hot reload on http://192.168.1.10:3101
      name: "wickedhome-dev",
      script: "npm",
      args: "run dev",
      autorestart: true,
    },
    {
      // Component catalogue on http://192.168.1.10:6006
      name: "wickedhome-storybook",
      script: "npm",
      args: "run storybook",
      autorestart: true,
    },
  ],
};
