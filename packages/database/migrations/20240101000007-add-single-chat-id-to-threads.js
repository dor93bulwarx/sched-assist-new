"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("threads", "single_chat_id", {
      type: Sequelize.UUID,
      allowNull: true,
    });

    await queryInterface.addIndex("threads", ["single_chat_id"], {
      name: "threads_single_chat_id",
    });
    await queryInterface.addIndex(
      "threads",
      ["single_chat_id", "summarized_at"],
      { name: "threads_single_chat_id_summarized_at" },
    );
    await queryInterface.addIndex(
      "threads",
      ["single_chat_id", "updated_at"],
      { name: "threads_single_chat_id_updated_at" },
    );
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.removeIndex(
      "threads",
      "threads_single_chat_id_updated_at",
    );
    await queryInterface.removeIndex(
      "threads",
      "threads_single_chat_id_summarized_at",
    );
    await queryInterface.removeIndex(
      "threads",
      "threads_single_chat_id",
    );
    await queryInterface.removeColumn("threads", "single_chat_id");
  },
};
