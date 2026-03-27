import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../connection";
import { Vendor } from "./Vendor";
import type { ModelAttributes } from "@scheduling-agent/types";

type LLMModelCreationAttributes = Optional<
  ModelAttributes,
  "id" | "createdAt" | "updatedAt"
>;

class LLMModel
  extends Model<ModelAttributes, LLMModelCreationAttributes>
  implements ModelAttributes
{
  declare id: string;
  declare vendorId: string;
  declare name: string;
  declare slug: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

LLMModel.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    vendorId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: "vendor_id",
      references: { model: "vendors", key: "id" },
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
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
    tableName: "models",
    underscored: true,
    timestamps: true,
    indexes: [{ fields: ["vendor_id"] }],
  },
);

LLMModel.belongsTo(Vendor, { foreignKey: "vendorId" });
Vendor.hasMany(LLMModel, { foreignKey: "vendorId" });

export { LLMModel };
