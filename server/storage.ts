import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, desc, and, or, isNull } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  users, rooms, betRounds, bets, messages, botSettings, privateMessages, balanceLogs, roomSessions,
  type User, type InsertUser, type Room, type BetRound, type Bet, type Message, type BotSettings, type PrivateMessage, type BalanceLog, type RoomSession,
} from "@shared/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByNickname(nickname: string): Promise<User | undefined>;
  createUser(user: InsertUser & { role?: string; balance?: number; nickname?: string }): Promise<User>;
  updateUserBalance(id: string, balance: number): Promise<User | undefined>;
  updateUserNotes(id: string, notes: string): Promise<User | undefined>;
  updateUserNickname(id: string, nickname: string): Promise<User | undefined>;
  banUser(id: string, banned: boolean): Promise<User | undefined>;
  muteUser(id: string, muted: boolean): Promise<User | undefined>;
  setUserRole(id: string, role: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;

  // Rooms
  createRoom(data: { name: string; description: string; createdBy: string }): Promise<Room>;
  getRooms(): Promise<Room[]>;
  getRoom(id: string): Promise<Room | undefined>;
  updateRoom(id: string, data: Partial<Pick<Room, "name" | "description" | "isActive" | "gameUrl" | "password" | "chatMuted">>): Promise<Room | undefined>;
  deleteRoom(id: string): Promise<void>;
  appendBetHistory(roomId: string, entry: string): Promise<void>;
  getBetHistory(roomId: string): Promise<string[]>;

  // Bet Rounds
  createBetRound(data: { roomId: string; options: object; bankerUserId?: string; bankerNickname?: string; bankerOption?: string; bankerMaxBet?: number; pumpRate?: number; playerPumpRate?: number; carryOver?: number }): Promise<BetRound>;
  cancelBetRound(id: string): Promise<BetRound | undefined>;
  getActiveBetRound(roomId: string): Promise<BetRound | undefined>;
  getBetRound(id: string): Promise<BetRound | undefined>;
  closeBetRound(id: string, winnerOption: string): Promise<BetRound | undefined>;
  pauseBetRound(id: string): Promise<BetRound | undefined>;
  resumeBetRound(id: string): Promise<BetRound | undefined>;
  updateBetRoundOptions(id: string, options: object): Promise<BetRound | undefined>;

  // Bets
  placeBet(data: { roundId: string; roomId: string; userId: string; username: string; nickname?: string | null; option: string; amount: number }): Promise<Bet>;
  getBetsForRound(roundId: string): Promise<Bet[]>;
  getBetsForRoom(roomId: string): Promise<Bet[]>;
  getUserBetForOption(userId: string, roundId: string, option: string): Promise<Bet | undefined>;
  getUserBetsInRound(userId: string, roundId: string): Promise<Bet[]>;
  cancelUserBetsInRound(userId: string, roundId: string): Promise<number>;
  cancelSingleBet(betId: string, userId: string, roundId: string): Promise<{ amount: number; option: string } | null>;
  getTotalBetsForRound(roundId: string): Promise<number>;
  getAllBetRoundsWithBets(): Promise<Array<BetRound & { bets: Bet[]; roomName: string }>>;


  // Messages
  createMessage(data: { roomId: string; userId?: string; username?: string; content: string; type?: string }): Promise<Message>;
  getMessages(roomId: string, limit?: number): Promise<Message[]>;
  deleteMessage(id: string): Promise<void>;
  clearMessages(roomId: string): Promise<void>;
  deleteBetMessages(userId: string, roomId: string): Promise<string[]>;

  // Bot Settings
  getBotSettings(): Promise<BotSettings>;
  updateBotSettings(data: { enabled: boolean; minAmount: number; maxAmount: number; webhookUrl1?: string; webhookUrl2?: string; webhookUrl3?: string }): Promise<BotSettings>;
  getShillUsers(): Promise<User[]>;
  setUserShill(id: string, isShill: boolean): Promise<User | undefined>;
  setUserShillRoom(id: string, shillRoomId: string | null): Promise<User | undefined>;
  updateUserPassword(id: string, password: string): Promise<User | undefined>;
  enableTotp(id: string, secret: string): Promise<User | undefined>;
  adminAdjustBalance(id: string, newBalance: number): Promise<User | undefined>;

  // Private Messages
  createPrivateMessage(data: { userId: string; userUsername: string; userNickname?: string | null; adminId?: string; adminUsername?: string; content: string; isFromAdmin: boolean }): Promise<PrivateMessage>;
  getPrivateMessagesForUser(userId: string): Promise<PrivateMessage[]>;
  getAllPrivateMessageThreads(): Promise<{ userId: string; userUsername: string; userNickname: string | null; unread: number; lastMessage: string; lastAt: Date }[]>;
  getPrivateMessagesForAdmin(userId: string): Promise<PrivateMessage[]>;
  markReadByAdmin(userId: string): Promise<void>;
  markReadByUser(userId: string): Promise<void>;
  deletePrivateThread(userId: string): Promise<void>;
  deleteUser(id: string): Promise<void>;
  nukeAllData(): Promise<void>;

  // Balance Logs
  createBalanceLog(data: { targetUserId: string; targetUsername: string; targetNickname?: string | null; adminUsername: string; delta: number; previousBalance: number; newBalance: number }): Promise<BalanceLog>;
  getBalanceLogs(limit?: number): Promise<BalanceLog[]>;

  // Room Sessions
  createRoomSession(roomId: string, roomName: string): Promise<RoomSession>;
  closeRoomSession(roomId: string): Promise<void>;
  getOpenRoomSession(roomId: string): Promise<RoomSession | undefined>;
  getRoomSessions(limit?: number): Promise<RoomSession[]>;
}

export class DbStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async getUserByNickname(nickname: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.nickname, nickname)).limit(1);
    return result[0];
  }

  async createUser(user: InsertUser & { role?: string; balance?: number; nickname?: string }): Promise<User> {
    const id = randomUUID();
    const initialBalance = user.balance ?? 0;
    const result = await db.insert(users).values({
      id,
      username: user.username,
      nickname: user.nickname || null,
      password: user.password,
      role: user.role || "user",
      balance: initialBalance,
      totalDeposits: initialBalance,
    }).returning();
    return result[0];
  }

  async updateUserNickname(id: string, nickname: string): Promise<User | undefined> {
    const result = await db.update(users).set({ nickname: nickname || null }).where(eq(users.id, id)).returning();
    return result[0];
  }

  async updateUserBalance(id: string, balance: number): Promise<User | undefined> {
    const result = await db.update(users).set({ balance }).where(eq(users.id, id)).returning();
    return result[0];
  }

  async updateUserNotes(id: string, notes: string): Promise<User | undefined> {
    const result = await db.update(users).set({ notes }).where(eq(users.id, id)).returning();
    return result[0];
  }

  async banUser(id: string, banned: boolean): Promise<User | undefined> {
    const result = await db.update(users).set({ banned }).where(eq(users.id, id)).returning();
    return result[0];
  }

  async muteUser(id: string, muted: boolean): Promise<User | undefined> {
    const result = await db.update(users).set({ muted }).where(eq(users.id, id)).returning();
    return result[0];
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async createRoom(data: { name: string; description: string; createdBy: string }): Promise<Room> {
    const id = randomUUID();
    const result = await db.insert(rooms).values({ id, ...data }).returning();
    return result[0];
  }

  async getRooms(): Promise<Room[]> {
    return db.select().from(rooms).where(eq(rooms.isActive, true)).orderBy(desc(rooms.createdAt));
  }

  async getRoom(id: string): Promise<Room | undefined> {
    const result = await db.select().from(rooms).where(eq(rooms.id, id)).limit(1);
    return result[0];
  }

  async updateRoom(id: string, data: Partial<Pick<Room, "name" | "description" | "isActive" | "gameUrl" | "password">>): Promise<Room | undefined> {
    const result = await db.update(rooms).set(data).where(eq(rooms.id, id)).returning();
    return result[0];
  }

  async setPendingBanker(roomId: string, banker: object | null): Promise<void> {
    await db.update(rooms).set({ pendingBanker: banker } as any).where(eq(rooms.id, roomId));
  }

  async appendBetHistory(roomId: string, entry: string): Promise<void> {
    const room = await this.getRoom(roomId);
    if (!room) return;
    const current = room.betHistory || "";
    const updated = current ? current + "\n" + entry : entry;
    await db.update(rooms).set({ betHistory: updated } as any).where(eq(rooms.id, roomId));
  }

  async getBetHistory(roomId: string): Promise<string[]> {
    const room = await this.getRoom(roomId);
    if (!room || !(room as any).betHistory) return [];
    return ((room as any).betHistory as string).split("\n").filter(Boolean);
  }

  async deleteRoom(id: string): Promise<void> {
    await db.update(rooms).set({ isActive: false }).where(eq(rooms.id, id));
  }

  async createBetRound(data: { roomId: string; options: object; bankerUserId?: string; bankerNickname?: string; bankerOption?: string; bankerMaxBet?: number; pumpRate?: number; playerPumpRate?: number; carryOver?: number }): Promise<BetRound> {
    const id = randomUUID();
    const result = await db.insert(betRounds).values({ id, ...data, carryOver: data.carryOver ?? 0, status: "open" }).returning();
    return result[0];
  }

  async cancelBetRound(id: string): Promise<BetRound | undefined> {
    const result = await db.update(betRounds)
      .set({ status: "cancelled", closedAt: new Date() })
      .where(eq(betRounds.id, id))
      .returning();
    return result[0];
  }

  async getActiveBetRound(roomId: string): Promise<BetRound | undefined> {
    const result = await db.select().from(betRounds)
      .where(and(eq(betRounds.roomId, roomId), or(eq(betRounds.status, "open"), eq(betRounds.status, "paused"))))
      .orderBy(desc(betRounds.createdAt))
      .limit(1);
    return result[0];
  }

  async pauseBetRound(id: string): Promise<BetRound | undefined> {
    const result = await db.update(betRounds).set({ status: "paused" }).where(eq(betRounds.id, id)).returning();
    return result[0];
  }

  async resumeBetRound(id: string): Promise<BetRound | undefined> {
    const result = await db.update(betRounds).set({ status: "open" }).where(eq(betRounds.id, id)).returning();
    return result[0];
  }

  async getBetRound(id: string): Promise<BetRound | undefined> {
    const result = await db.select().from(betRounds).where(eq(betRounds.id, id)).limit(1);
    return result[0];
  }

  async closeBetRound(id: string, winnerOption: string): Promise<BetRound | undefined> {
    const result = await db.update(betRounds)
      .set({ status: "closed", winnerOption, closedAt: new Date() })
      .where(eq(betRounds.id, id))
      .returning();
    return result[0];
  }

  async updateBetRoundOptions(id: string, options: object): Promise<BetRound | undefined> {
    const result = await db.update(betRounds).set({ options }).where(eq(betRounds.id, id)).returning();
    return result[0];
  }

  async placeBet(data: { roundId: string; roomId: string; userId: string; username: string; nickname?: string | null; option: string; amount: number }): Promise<Bet> {
    const id = randomUUID();
    const result = await db.insert(bets).values({ id, ...data }).returning();
    return result[0];
  }

  async getBetsForRound(roundId: string): Promise<Bet[]> {
    return db.select().from(bets).where(eq(bets.roundId, roundId)).orderBy(desc(bets.createdAt));
  }

  async getBetsForRoom(roomId: string): Promise<Bet[]> {
    return db.select().from(bets).where(eq(bets.roomId, roomId)).orderBy(desc(bets.createdAt)).limit(50);
  }

  async getUserBetForOption(userId: string, roundId: string, option: string): Promise<Bet | undefined> {
    const result = await db.select().from(bets)
      .where(and(eq(bets.userId, userId), eq(bets.roundId, roundId), eq(bets.option, option)))
      .limit(1);
    return result[0];
  }

  async getUserBetsInRound(userId: string, roundId: string): Promise<Bet[]> {
    return db.select().from(bets)
      .where(and(eq(bets.userId, userId), eq(bets.roundId, roundId)));
  }

  async cancelUserBetsInRound(userId: string, roundId: string): Promise<number> {
    const userBets = await db.select().from(bets)
      .where(and(eq(bets.userId, userId), eq(bets.roundId, roundId)));
    const total = userBets.reduce((s, b) => s + b.amount, 0);
    await db.delete(bets).where(and(eq(bets.userId, userId), eq(bets.roundId, roundId)));
    return total;
  }

  async cancelSingleBet(betId: string, userId: string, roundId: string): Promise<{ amount: number; option: string } | null> {
    const rows = await db.select().from(bets)
      .where(and(eq(bets.id, betId), eq(bets.userId, userId), eq(bets.roundId, roundId)));
    if (rows.length === 0) return null;
    const bet = rows[0];
    await db.delete(bets).where(eq(bets.id, betId));
    return { amount: bet.amount, option: bet.option };
  }

  async getTotalBetsForRound(roundId: string): Promise<number> {
    const result = await db.select().from(bets).where(eq(bets.roundId, roundId));
    return result.reduce((s, b) => s + b.amount, 0);
  }

  async getAllBetRoundsWithBets(): Promise<Array<BetRound & { bets: Bet[]; roomName: string }>> {
    const allRooms = await db.select().from(rooms);
    const allRounds = await db.select().from(betRounds).orderBy(desc(betRounds.createdAt)).limit(500);
    const allBets = await db.select().from(bets);
    const roomMap = new Map(allRooms.map(r => [r.id, r.name]));
    return allRounds.map(round => ({
      ...round,
      roomName: roomMap.get(round.roomId) || round.roomId,
      bets: allBets.filter(b => b.roundId === round.id),
    }));
  }

  async createMessage(data: { roomId: string; userId?: string; username?: string; content: string; type?: string }): Promise<Message> {
    const id = randomUUID();
    const result = await db.insert(messages).values({
      id,
      roomId: data.roomId,
      userId: data.userId || null,
      username: data.username || null,
      content: data.content,
      type: data.type || "user",
    }).returning();
    return result[0];
  }

  async getMessages(roomId: string, limit = 100): Promise<Message[]> {
    const result = await db.select().from(messages)
      .where(eq(messages.roomId, roomId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);
    return result.reverse();
  }

  async deleteMessage(id: string): Promise<void> {
    await db.delete(messages).where(eq(messages.id, id));
  }

  async clearMessages(roomId: string): Promise<void> {
    await db.delete(messages).where(eq(messages.roomId, roomId));
  }

  async deleteBetMessages(userId: string, roomId: string): Promise<string[]> {
    const toDelete = await db.select({ id: messages.id }).from(messages)
      .where(and(eq(messages.userId, userId), eq(messages.roomId, roomId), eq(messages.type, "bet")));
    if (toDelete.length === 0) return [];
    await db.delete(messages).where(and(eq(messages.userId, userId), eq(messages.roomId, roomId), eq(messages.type, "bet")));
    return toDelete.map(m => m.id);
  }

  async getBotSettings(): Promise<BotSettings> {
    const rows = await db.select().from(botSettings).limit(1);
    if (rows.length > 0) return rows[0];
    const inserted = await db.insert(botSettings).values({
      id: "default",
      enabled: false,
      minAmount: 100,
      maxAmount: 500,
    }).returning();
    return inserted[0];
  }

  async updateBotSettings(data: { enabled: boolean; minAmount: number; maxAmount: number; shillMinDelaySec?: number; shillMaxDelaySec?: number; webhookUrl1?: string; webhookUrl2?: string; webhookUrl3?: string }): Promise<BotSettings> {
    const existing = await db.select().from(botSettings).limit(1);
    if (existing.length === 0) {
      const inserted = await db.insert(botSettings).values({ id: "default", ...data }).returning();
      return inserted[0];
    }
    const updated = await db.update(botSettings).set({ ...data, updatedAt: new Date() }).where(eq(botSettings.id, existing[0].id)).returning();
    return updated[0];
  }

  async getShillUsers(): Promise<User[]> {
    return db.select().from(users).where(eq(users.isShill, true));
  }

  async setUserShill(id: string, isShill: boolean): Promise<User | undefined> {
    const result = await db.update(users).set({ isShill }).where(eq(users.id, id)).returning();
    return result[0];
  }

  async setUserShillRoom(id: string, shillRoomId: string | null): Promise<User | undefined> {
    const result = await db.update(users).set({ shillRoomId } as any).where(eq(users.id, id)).returning();
    return result[0];
  }

  async setUserRole(id: string, role: string): Promise<User | undefined> {
    const result = await db.update(users).set({ role }).where(eq(users.id, id)).returning();
    return result[0];
  }

  async updateUserPassword(id: string, password: string): Promise<User | undefined> {
    const result = await db.update(users).set({ password }).where(eq(users.id, id)).returning();
    return result[0];
  }

  async enableTotp(id: string, secret: string): Promise<User | undefined> {
    const result = await db.update(users).set({ totpSecret: secret, totpEnabled: true }).where(eq(users.id, id)).returning();
    return result[0];
  }

  async adminAdjustBalance(id: string, newBalance: number): Promise<User | undefined> {
    const current = await this.getUser(id);
    if (!current) return undefined;
    const delta = newBalance - current.balance;
    const updates: Record<string, unknown> = { balance: newBalance };
    if (delta > 0) {
      updates.totalDeposits = (current.totalDeposits ?? 0) + delta;
    } else if (delta < 0) {
      updates.totalWithdrawals = (current.totalWithdrawals ?? 0) + Math.abs(delta);
    }
    const result = await db.update(users).set(updates as any).where(eq(users.id, id)).returning();
    return result[0];
  }

  async createPrivateMessage(data: { userId: string; userUsername: string; userNickname?: string | null; adminId?: string; adminUsername?: string; content: string; isFromAdmin: boolean }): Promise<PrivateMessage> {
    const [row] = await db.insert(privateMessages).values({ id: randomUUID(), ...data }).returning();
    return row;
  }

  async getPrivateMessagesForUser(userId: string): Promise<PrivateMessage[]> {
    return db.select().from(privateMessages).where(eq(privateMessages.userId, userId)).orderBy(privateMessages.createdAt);
  }

  async getPrivateMessagesForAdmin(userId: string): Promise<PrivateMessage[]> {
    return db.select().from(privateMessages).where(eq(privateMessages.userId, userId)).orderBy(privateMessages.createdAt);
  }

  async getAllPrivateMessageThreads(): Promise<{ userId: string; userUsername: string; userNickname: string | null; unread: number; lastMessage: string; lastAt: Date }[]> {
    const all = await db.select().from(privateMessages).orderBy(desc(privateMessages.createdAt));
    const threads = new Map<string, { userId: string; userUsername: string; userNickname: string | null; unread: number; lastMessage: string; lastAt: Date }>();
    for (const pm of all) {
      if (!threads.has(pm.userId)) {
        threads.set(pm.userId, { userId: pm.userId, userUsername: pm.userUsername, userNickname: pm.userNickname ?? null, unread: 0, lastMessage: pm.content, lastAt: pm.createdAt });
      }
      if (!pm.isFromAdmin && !pm.readByAdmin) {
        threads.get(pm.userId)!.unread++;
      }
    }
    return Array.from(threads.values()).sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
  }

  async markReadByAdmin(userId: string): Promise<void> {
    await db.update(privateMessages).set({ readByAdmin: true }).where(and(eq(privateMessages.userId, userId), eq(privateMessages.isFromAdmin, false)));
  }

  async markReadByUser(userId: string): Promise<void> {
    await db.update(privateMessages).set({ readByUser: true }).where(and(eq(privateMessages.userId, userId), eq(privateMessages.isFromAdmin, true)));
  }

  async deletePrivateThread(userId: string): Promise<void> {
    await db.delete(privateMessages).where(eq(privateMessages.userId, userId));
  }

  async deleteUser(id: string): Promise<void> {
    // Delete all data tied to this user, preserving bets/balance logs for records
    await db.delete(privateMessages).where(eq(privateMessages.userId, id));
    await db.delete(messages).where(eq(messages.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }

  async nukeAllData(): Promise<void> {
    await db.delete(messages);
    await db.delete(privateMessages);
    await db.delete(bets);
    await db.delete(betRounds);
    await db.delete(balanceLogs);
    await db.delete(roomSessions);
    await db.update(users).set({ balance: 0, totalDeposits: 0, totalWithdrawals: 0 } as any);
    await db.update(rooms).set({ betHistory: "", pendingBanker: null } as any);
  }

  async createBalanceLog(data: { targetUserId: string; targetUsername: string; targetNickname?: string | null; adminUsername: string; delta: number; previousBalance: number; newBalance: number }): Promise<BalanceLog> {
    const [row] = await db.insert(balanceLogs).values({ id: randomUUID(), ...data }).returning();
    return row;
  }

  async getBalanceLogs(limit = 500): Promise<BalanceLog[]> {
    return db.select().from(balanceLogs).orderBy(desc(balanceLogs.createdAt)).limit(limit);
  }

  async createRoomSession(roomId: string, roomName: string): Promise<RoomSession> {
    const rows = await db.insert(roomSessions).values({ roomId, roomName }).returning();
    return rows[0];
  }

  async closeRoomSession(roomId: string): Promise<void> {
    await db.update(roomSessions)
      .set({ closedAt: new Date() })
      .where(and(eq(roomSessions.roomId, roomId), isNull(roomSessions.closedAt)));
  }

  async getOpenRoomSession(roomId: string): Promise<RoomSession | undefined> {
    const rows = await db.select().from(roomSessions)
      .where(and(eq(roomSessions.roomId, roomId), isNull(roomSessions.closedAt)))
      .limit(1);
    return rows[0];
  }

  async getRoomSessions(limit = 200): Promise<RoomSession[]> {
    return db.select().from(roomSessions).orderBy(desc(roomSessions.openedAt)).limit(limit);
  }
}

export const storage = new DbStorage();
