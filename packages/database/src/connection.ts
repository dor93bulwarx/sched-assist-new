import { Sequelize } from "sequelize";

/**
 * Sequelize connection initialised from environment variables wired via
 * Docker Compose.  Falls back to sensible local-dev defaults so the package
 * can also be used outside containers during development.
 */
const sequelize = new Sequelize(
  process.env.DATABASE_URL ??
    `postgres://${process.env.PGUSER ?? "scheduler"}:${process.env.PGPASSWORD ?? "scheduler_pass"}@${process.env.PGHOST ?? "localhost"}:${process.env.PGPORT ?? "5432"}/${process.env.PGDATABASE ?? "scheduler_agent"}`,
  {
    dialect: "postgres",
    logging: process.env.NODE_ENV === "production" ? false : console.log,
    pool: {
      max: 10,
      min: 1,
      acquire: 30_000,
      idle: 10_000,
    },
  },
);

export { sequelize };
