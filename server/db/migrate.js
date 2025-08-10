import { Umzug, SequelizeStorage } from 'umzug';
import { Sequelize } from 'sequelize';
import 'dotenv/config';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

// Replicate __dirname functionality in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
});

export const migrator = new Umzug({
  migrations: {
    glob: ['migrations/*.sql', { cwd: __dirname }],
    // Custom resolver to execute raw SQL files via Sequelize
    resolve: ({ name, path: filepath, context }) => {
      return {
        name,
        up: async () => {
          const sql = await fs.readFile(filepath, 'utf8');
          return context.query(sql);
        },
        // Reversible migrations would need a separate down script; no-op for now
        down: async () => {
          console.warn(`[DB] No down migration for ${name}`);
        },
      };
    },
  },
  context: sequelize,
  storage: new SequelizeStorage({ sequelize }),
  logger: console,
});

// Helper to determine if the script is run directly
const isRunDirectly = import.meta.url === path.resolve(__filename).replace(/\\/g, '/');

if (isRunDirectly) {
  migrator.runAsCLI();
} 