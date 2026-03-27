"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Create single_chats table
    await queryInterface.createTable("single_chats", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.STRING,
        allowNull: false,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      agent_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "agents", key: "id" },
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
    });

    await queryInterface.addIndex("single_chats", ["user_id"], {
      name: "single_chats_user_id",
    });
    await queryInterface.addIndex("single_chats", ["agent_id"], {
      name: "single_chats_agent_id",
    });
    await queryInterface.addIndex("single_chats", ["user_id", "agent_id"], {
      unique: true,
      name: "single_chats_user_id_agent_id_unique",
    });

    // 2. Add FK on threads.single_chat_id → single_chats.id
    // Column already exists from migration 0007; add the FK constraint.
    await queryInterface.sequelize.query(`
      ALTER TABLE threads
      ADD CONSTRAINT threads_single_chat_id_fk
      FOREIGN KEY (single_chat_id) REFERENCES single_chats(id)
      ON UPDATE CASCADE ON DELETE SET NULL;
    `);

    // 3. Add agent_id to groups
    await queryInterface.addColumn("groups", "agent_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "agents", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    await queryInterface.addIndex("groups", ["agent_id"], {
      name: "groups_agent_id",
    });
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.removeIndex("groups", "groups_agent_id");
    await queryInterface.removeColumn("groups", "agent_id");

    await queryInterface.sequelize.query(`
      ALTER TABLE threads DROP CONSTRAINT IF EXISTS threads_single_chat_id_fk;
    `);

    await queryInterface.dropTable("single_chats");
  },
};
