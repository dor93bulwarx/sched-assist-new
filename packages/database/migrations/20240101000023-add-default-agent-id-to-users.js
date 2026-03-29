"use strict";

/**
 * Add default_agent_id column to users table.
 * Points to the agent automatically created on first login.
 * Populate existing rows from single_chats (first chat's agent).
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Add the column (nullable UUID, FK → agents.id)
    await queryInterface.addColumn("users", "default_agent_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "agents", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    // 2. Populate from single_chats for existing users.
    //    For each user, pick the earliest single chat's agent_id as the default.
    await queryInterface.sequelize.query(`
      UPDATE users u
      SET default_agent_id = sub.agent_id
      FROM (
        SELECT DISTINCT ON (user_id) user_id, agent_id
        FROM single_chats
        ORDER BY user_id, created_at ASC
      ) sub
      WHERE u.id = sub.user_id
    `);
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.removeColumn("users", "default_agent_id");
  },
};
