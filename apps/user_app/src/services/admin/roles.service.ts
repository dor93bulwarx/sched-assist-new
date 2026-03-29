import { Role } from "@scheduling-agent/database";

export class RolesService {
  async getAll() {
    return Role.findAll({
      attributes: ["id", "name"],
      order: [["name", "ASC"]],
    });
  }
}
