"use strict";

/**
 * Create the `conversation_messages` table — the canonical, conversation-scoped
 * store for every user / assistant message visible in the UI.
 *
 * Keyed by (group_id XOR single_chat_id) so history survives thread rotation.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, _Sequelize) {
    await queryInterface.sequelize.query(`
      CREATE TABLE conversation_messages (
        id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id      UUID          REFERENCES groups(id)        ON DELETE CASCADE,
        single_chat_id UUID         REFERENCES single_chats(id)  ON DELETE CASCADE,
        thread_id     VARCHAR(255)  NOT NULL,
        role          VARCHAR(16)   NOT NULL CHECK (role IN ('user', 'assistant')),
        content       TEXT          NOT NULL,
        sender_name   VARCHAR(255),
        request_id    UUID,
        model_slug    VARCHAR(128),
        vendor_slug   VARCHAR(128),
        model_name    VARCHAR(128),
        created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

        CONSTRAINT conversation_messages_scope_xor
          CHECK (
            (group_id IS NOT NULL AND single_chat_id IS NULL) OR
            (group_id IS NULL     AND single_chat_id IS NOT NULL)
          )
      );

      CREATE INDEX idx_conv_msgs_group      ON conversation_messages (group_id, created_at)       WHERE group_id IS NOT NULL;
      CREATE INDEX idx_conv_msgs_single_chat ON conversation_messages (single_chat_id, created_at) WHERE single_chat_id IS NOT NULL;
      CREATE INDEX idx_conv_msgs_thread      ON conversation_messages (thread_id);
    `);
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS conversation_messages`);
  },
};
