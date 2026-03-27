/**
 * Sequelize CLI configuration.
 *
 * Reads the same environment variables that connection.ts uses so both
 * the CLI and runtime share a single source of truth for credentials.
 */
module.exports = {
  development: {
    username: process.env.PGUSER || "scheduler",
    password: process.env.PGPASSWORD || "scheduler_pass",
    database: process.env.PGDATABASE || "scheduler_agent",
    host: process.env.PGHOST || "localhost",
    port: parseInt(process.env.PGPORT || "5432", 10),
    dialect: "postgres",
  },
  production: {
    use_env_variable: "DATABASE_URL",
    dialect: "postgres",
    dialectOptions: {
      ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
    },
  },
};
