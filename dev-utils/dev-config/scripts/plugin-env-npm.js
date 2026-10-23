module.exports = {
  name: 'plugin-env-npm',
  factory: () => ({
    hooks: {
      async getNpmAuthenticationHeader() {
        let token = process.env.NPM_TOKEN;

        if (!token) {
          // No .env is a legitimate state (the .deb container build passes the token through
          // the environment only) — fall through to an unauthenticated request, which fails as
          // a readable 401 on private packages instead of an ENOENT here.
          let envContent;
          try {
            const fs = require('fs/promises');
            envContent = await fs.readFile('.env', 'utf8');
          } catch (err) {
            if (err && err.code === 'ENOENT') {
              return undefined;
            }
            // Anything else (EACCES, EISDIR, ...) is a real problem: rethrow it so the
            // developer sees the cause instead of a mystifying 401 from the registry.
            throw err;
          }

          const rows = envContent.split(/\r?\n/);
          for (const row of rows) {
            const [key, value] = row.split('=', 2);
            if (key.trim() === 'NPM_TOKEN') {
              token = value.trim();
            }
          }
        }

        if (token) {
          return `Bearer ${token}`;
        }
      },
    },
  }),
};

// // workaround needed to inject NPM_TOKEN var from '.env' in yarn 3,
// // ref: https://stackoverflow.com/questions/76703784/how-can-i-access-environment-varibale-declared-in-env-file-from-yarnrc-yaml-fi
