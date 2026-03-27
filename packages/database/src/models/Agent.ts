import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../connection";
import type { AgentAttributes } from "@scheduling-agent/types";

type AgentCreationAttributes = Optional<
  AgentAttributes,
  "id" | "createdAt" | "updatedAt" | "definition" | "coreInstructions" | "singleChatId" | "groupId"
>;

class Agent extends Model<AgentAttributes, AgentCreationAttributes> implements AgentAttributes {
  declare id: string;
  declare definition: string | null;
  declare coreInstructions: string | null;
  declare singleChatId: string | null;
  declare groupId: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

Agent.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    definition: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    coreInstructions: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "core_instructions",
    },
    singleChatId: {
      type: DataTypes.UUID,
      allowNull: true,
      unique: true,
      field: "single_chat_id",
      references: { model: "single_chats", key: "id" },
    },
    groupId: {
      type: DataTypes.UUID,
      allowNull: true,
      unique: true,
      field: "group_id",
      references: { model: "groups", key: "id" },
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
    tableName: "agents",
    underscored: true,
    timestamps: true,
  },
);

export { Agent };
