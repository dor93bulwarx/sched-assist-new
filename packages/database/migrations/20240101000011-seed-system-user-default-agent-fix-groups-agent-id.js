"use strict";

/**
 * 1. Seed a default agent
 * 2. Seed a system admin user (password: "admin123" — change in production)
 * 3. Make groups.agent_id NOT NULL (backfill existing rows with the default agent first)
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {


    // 1. Insert system admin user
    //    Password "admin123" hashed with bcrypt (10 rounds).
    //    The hash below is pre-computed; the app uses bcrypt.compare at login.
    const bcryptHash =
      "$2b$10$m925iSSJEQXkPR1Zd3I9DOImWOzxcAerzPb2D6389TpMfyXsvZuXC";

    // We use raw SQL so we can use the same default-value expression the table uses.
    await queryInterface.sequelize.query(
      `INSERT INTO users (id, display_name, user_identity, password, created_at, updated_at)
       VALUES ('SYSTEM', 'System Admin', '{"role":"admin"}'::jsonb, :password, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      { replacements: { password: bcryptHash } },
    );

    // 2. Backfill any existing groups that have NULL agent_id
    await queryInterface.sequelize.query(
      `UPDATE groups SET agent_id = :agentId WHERE agent_id IS NULL`,
      { replacements: { agentId: DEFAULT_AGENT_ID } },
    );

    // 3. Make agent_id NOT NULL
    await queryInterface.sequelize.query(
      `ALTER TABLE groups ALTER COLUMN agent_id SET NOT NULL`,
    );
  },

  async down(queryInterface, _Sequelize) {
    // Revert NOT NULL
    await queryInterface.sequelize.query(
      `ALTER TABLE groups ALTER COLUMN agent_id DROP NOT NULL`,
    );

    // Do not delete seed data on down — it may have been used by other rows.
  },
};
