"use strict";

const ANTHROPIC_VENDOR_ID = "00000000-0000-4000-b000-000000000002";
const GOOGLE_VENDOR_ID = "00000000-0000-4000-b000-000000000003";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, _Sequelize) {
    await queryInterface.sequelize.query(
      `INSERT INTO models (id, vendor_id, name, slug, created_at, updated_at) VALUES
        (gen_random_uuid(), :anthropic, 'Claude Opus 4.6', 'claude-opus-4-6', NOW(), NOW()),
        (gen_random_uuid(), :anthropic, 'Claude Sonnet 4.6', 'claude-sonnet-4-6', NOW(), NOW()),
        (gen_random_uuid(), :google, 'Gemini 3.1', 'gemini-3.1-pro-preview', NOW(), NOW())
       ON CONFLICT (slug) DO NOTHING`,
      {
        replacements: {
          anthropic: ANTHROPIC_VENDOR_ID,
          google: GOOGLE_VENDOR_ID,
        },
      },
    );
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.sequelize.query(
      `DELETE FROM models WHERE slug IN ('claude-opus-4-6', 'claude-sonnet-4-6', 'gemini-3.1-pro-preview')`,
    );
  },
};
