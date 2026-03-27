"use strict";

const DEFAULT_AGENT_ID = "00000000-0000-4000-a000-000000000001";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("agents", "definition", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    // Set default agent's definition
    await queryInterface.sequelize.query(
      `UPDATE agents SET definition = :def WHERE id = :id`,
      {
        replacements: {
          id: DEFAULT_AGENT_ID,
          def: "AI Default Agent",
        },
      },
    );
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.removeColumn("agents", "definition");
  },
};
