"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("agent_sessions", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      thread_id: {
        type: Sequelize.STRING,
        unique: true,
        allowNull: false,
      },
      emp_id: {
        type: Sequelize.STRING,
        allowNull: false,
        references: { model: "employees", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      title: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
      archived_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      last_activity_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      ttl_expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      summarized_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      summary: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      checkpoint_size_bytes: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },
    });

    await queryInterface.addIndex("agent_sessions", ["emp_id"], {
      name: "agent_sessions_emp_id",
    });
    await queryInterface.addIndex(
      "agent_sessions",
      ["emp_id", "summarized_at"],
      { name: "agent_sessions_emp_id_summarized_at" }
    );
    await queryInterface.addIndex(
      "agent_sessions",
      ["emp_id", "updated_at"],
      { name: "agent_sessions_emp_id_updated_at" }
    );
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.dropTable("agent_sessions");
  },
};
