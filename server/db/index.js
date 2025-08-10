import pg from 'pg';
import 'dotenv/config';
import { systemAlerts } from '../lib/alerting.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Add error handling for database connection issues
pool.on('error', (err, client) => {
  console.error('[Database] Unexpected error on idle client:', err);
  systemAlerts.databaseConnectionError(err);
});

pool.on('connect', (client) => {
  console.log('[Database] New client connected');
});

// Test connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('[Database] Error acquiring client:', err);
    systemAlerts.databaseConnectionError(err);
  } else {
    console.log('[Database] Initial connection successful');
    release();
  }
});

export default pool; 