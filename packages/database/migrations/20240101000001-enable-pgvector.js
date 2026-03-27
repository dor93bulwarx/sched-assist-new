"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, _Sequelize) {
    await queryInterface.sequelize.query(
      "CREATE EXTENSION IF NOT EXISTS vector;"
    );
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.sequelize.query(
      "DROP EXTENSION IF EXISTS vector;"
    );
  },
};
