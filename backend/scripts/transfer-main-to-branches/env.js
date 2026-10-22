// Connections for running inside the backend container (uses its POSTGRES_* and MONGO_URL; never prints secrets).
const { Client } = require('pg');
const { MongoClient, BSON } = require('mongoose').mongo;

module.exports = {
  EJSON: BSON.EJSON,
  pg: () => new Client({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT || 5432),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
    statement_timeout: 300000,
  }),
  mongo: () => new MongoClient(process.env.MONGO_URL),
};
