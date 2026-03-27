import { DataTypes, Model, Optional, Sequelize } from "sequelize";
import { sequelize } from "../connection";
import type { EmployeeAttributes, EmployeeIdentity } from "@scheduling-agent/types";

type EmployeeCreationAttributes = Optional<
  EmployeeAttributes,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "externalRef"
  | "displayName"
  | "employeeIdentity"
  | "password"
>;

class Employee
  extends Model<EmployeeAttributes, EmployeeCreationAttributes>
  implements EmployeeAttributes
{
  declare id: string;
  declare externalRef: string | null;
  declare displayName: string | null;
  declare employeeIdentity: EmployeeIdentity | null;
  declare password: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

Employee.init(
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      defaultValue: Sequelize.literal(`('EMP' || gen_random_uuid()::text)`),
    },
    externalRef: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: true,
      field: "external_ref",
    },
    displayName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "display_name",
    },
    employeeIdentity: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: "employee_identity",
    },
    password: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "created_at",
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "updated_at",
    },
  },
  {
    sequelize,
    tableName: "employees",
    underscored: true,
    timestamps: true,
  },
);

export { Employee };
