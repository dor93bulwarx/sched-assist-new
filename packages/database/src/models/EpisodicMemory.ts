import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../connection";
import type { EpisodicMemoryAttributes, EpisodicChunkMetadata } from "@scheduling-agent/types";

/**
 * Embedding dimension — must match the model used in the embedding pipeline.
 * OpenAI text-embedding-3-small = 1536; adjust if using a different model.
 */
export const EMBEDDING_DIMENSION = 1536;

type EpisodicMemoryCreationAttributes = Optional<
  EpisodicMemoryAttributes,
  "id" | "createdAt" | "metadata"
>;

class EpisodicMemory
  extends Model<EpisodicMemoryAttributes, EpisodicMemoryCreationAttributes>
  implements EpisodicMemoryAttributes
{
  declare id: string;
  declare empId: string;
  declare content: string;
  declare embedding: number[];
  declare metadata: EpisodicChunkMetadata | null;
  declare createdAt: Date;
}

EpisodicMemory.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    empId: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "emp_id",
      references: { model: "employees", key: "id" },
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    embedding: {
      // pgvector column — Sequelize does not have a built-in vector type.
      // The migration creates the column as `vector(1536)`; here we store as
      // an array and let the raw-query retrieval path handle casting.
      type: DataTypes.ARRAY(DataTypes.FLOAT),
      allowNull: false,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "created_at",
    },
  },
  {
    sequelize,
    tableName: "episodic_memory",
    underscored: true,
    timestamps: true,
    updatedAt: false,
    indexes: [{ fields: ["emp_id"] }],
  },
);

export { EpisodicMemory };
