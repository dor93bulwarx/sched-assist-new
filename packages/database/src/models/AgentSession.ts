import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../connection";
import type { AgentSessionAttributes, SessionSummary } from "@scheduling-agent/types";

type AgentSessionCreationAttributes = Optional<
  AgentSessionAttributes,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "title"
  | "archivedAt"
  | "lastActivityAt"
  | "ttlExpiresAt"
  | "summarizedAt"
  | "summary"
  | "checkpointSizeBytes"
>;

class AgentSession
  extends Model<AgentSessionAttributes, AgentSessionCreationAttributes>
  implements AgentSessionAttributes
{
  declare id: string;
  declare threadId: string;
  declare empId: string;
  declare title: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
  declare archivedAt: Date | null;
  declare lastActivityAt: Date | null;
  declare ttlExpiresAt: Date | null;
  declare summarizedAt: Date | null;
  declare summary: SessionSummary | null;
  declare checkpointSizeBytes: number | null;
}

AgentSession.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    threadId: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
      field: "thread_id",
    },
    empId: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "emp_id",
      references: { model: "employees", key: "id" },
    },
    title: {
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
    archivedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "archived_at",
    },
    lastActivityAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "last_activity_at",
    },
    ttlExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "ttl_expires_at",
    },
    summarizedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "summarized_at",
    },
    summary: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    checkpointSizeBytes: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: "checkpoint_size_bytes",
    },
  },
  {
    sequelize,
    tableName: "agent_sessions",
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ["emp_id"] },
      { fields: [{ name: "emp_id", order: "ASC" }, { name: "summarized_at", order: "DESC" }] },
      { fields: [{ name: "emp_id", order: "ASC" }, { name: "updated_at", order: "DESC" }] },
    ],
  },
);

export { AgentSession };
