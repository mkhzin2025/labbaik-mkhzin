import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

async function createDatabase() {
  const host = process.env.POSTGRES_HOST || 'localhost';
  const port = parseInt(process.env.POSTGRES_PORT || '5432', 10);
  const user = process.env.POSTGRES_USER || 'postgres';
  const password = process.env.POSTGRES_PASSWORD || '123';
  const targetDb = process.env.POSTGRES_DB || 'labbaik_db';

  console.log(`🔌 Connecting to PostgreSQL at ${host}:${port} as "${user}"...`);

  const client = new Client({
    host,
    port,
    user,
    password,
    database: 'postgres', // connect to default maintenance database
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL server.');

    const checkRes = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [targetDb]
    );

    if (checkRes.rowCount === 0) {
      console.log(`🔨 Database "${targetDb}" not found. Creating it...`);
      await client.query(`CREATE DATABASE "${targetDb}"`);
      console.log(`🎉 Database "${targetDb}" created successfully!`);
    } else {
      console.log(`✨ Database "${targetDb}" already exists.`);
    }
  } catch (error: any) {
    console.error('❌ Error creating database:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

createDatabase();
