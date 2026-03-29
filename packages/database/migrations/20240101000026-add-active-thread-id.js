"use strict";

/**
 * Add `active_thread_id` to `groups` and `single_chats`.
 *
 * Points to the current LangGraph checkpoint thread.  After thread rotation
 * (post-summarization), this column is updated to the new thread so the worker
 * always resolves the canonical thread for a conversation.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, _Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE groups
        ADD COLUMN active_thread_id VARCHAR(255) REFERENCES threads(id);

      ALTER TABLE single_chats
        ADD COLUMN active_thread_id VARCHAR(255) REFERENCES threads(id);
    `);
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE single_chats DROP COLUMN IF EXISTS active_thread_id;
      ALTER TABLE groups       DROP COLUMN IF EXISTS active_thread_id;
    `);
  },
};
