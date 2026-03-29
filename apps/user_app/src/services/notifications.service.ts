import { Sequelize } from "sequelize";
import { MessageNotification } from "@scheduling-agent/database";

export class NotificationsService {
  async getUnreadCounts(userId: string): Promise<Record<string, number>> {
    const rows = (await MessageNotification.findAll({
      where: { recipientId: userId, status: "delivered" },
      attributes: [
        "conversationId",
        "conversationType",
        [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
      ],
      group: ["conversationId", "conversationType"],
      raw: true,
    })) as unknown as {
      conversationId: string;
      conversationType: string;
      count: string;
    }[];

    const unread: Record<string, number> = {};
    for (const row of rows) {
      unread[row.conversationId] = parseInt(row.count, 10);
    }
    return unread;
  }
}
