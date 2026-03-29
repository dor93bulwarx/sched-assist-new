"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_AGENT_ID = "00000000-0000-4000-a000-000000000001";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("agents", "definition", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    const corePath = path.join(__dirname, "../../../apps/coreInstructions.json");
    const { description, core_description } = JSON.parse(
      fs.readFileSync(corePath, "utf8"),
    );

    await queryInterface.sequelize.query(
      `UPDATE agents SET definition = :def, core_instructions = :core WHERE id = :id`,
      {
        replacements: {
          id: DEFAULT_AGENT_ID,
          def: description,
          core: core_description,
        },
      },
    );
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.removeColumn("agents", "definition");
  },
};
