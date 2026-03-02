import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, desc, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  users, rooms, betRounds, bets, messages, botSettings,
  type User, type InsertUser, type Room, type BetRound, type Bet, type Message, type BotSettings,
} from "@shared/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByIp(ip: string): Promise<User | undefined>;
  createUser(user: InsertUser & { role?: string; balance?: number; registrationIp?: string }): Promise<User>;
  updateUserBalance(id: string, balance: number): Promise<User | undefined>;
  updateUserNotes(id: string, notes: string): Promise<User | undefined>;
  banUser(id: string, banned: boolean): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;

  // Rooms
  createRoom(data: { name: string; description: string; createdBy: string }): Promise<Room>;
  getRooms(): Promise<Room[]>;
  getRoom(id: string): Promise<Room | undefined>;
  updateRoom(id: string, data: Partial<Pick<Room, "name" | "description" | "isActive" | "gameUrl">>): Promise<Room | undefined>;
  deleteRoom(id: string): Promise<void>;

  // Bet Rounds
  createBetRound(data: { roomId: string; options: object }): Promise<BetRound>;
  getActiveBetRound(roomId: string): Promise<BetRound | undefined>;
  getBetRound(id: string): Promise<BetRound | undefined>;
  closeBetRound(id: string, winnerOption: string): Promise<BetRound | undefined>;
  updateBetRoundOptions(id: string, options: object): Promise<BetRound | undefined>;

  // Bets
  placeBet(data: { roundId: string; roomId: string; userId: string; username: string; option: string; amount: number }): Promise<Bet>;
  getBetsForRound(roundId: string): Promise<Bet[]>;
  getBetsForRoom(roomId: string): Promise<Bet[]>;
  getUserBetInRound(userId: string, roundId: string): Promise<Bet | undefined>;

  // Messages
  createMessage(data: { roomId: string; userId?: string; username?: string; content: string; type?: string }): Promise<Message>;
  getMessages(roomId: string, limit?: number): Promise<Message[]>;
  deleteMessage(id: string): Promise<void>;

  // Bot Settings
  getBotSettings(): Promise<BotSettings>;
  updateBotSettings(data: { enabled: boolean; minAmount: number; maxAmount: number }): Promise<BotSettings>;
  getShillUsers(): Promise<User[]>;
  setUserShill(id: string, isShill: boolean): Promise<User | undefined>;
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

  async getUserByIp(ip: string): Promise<User | undefined> {
    if (!ip) return undefined;
    const result = await db.select().from(users)
      .where(eq(users.registrationIp, ip))
      .limit(1);
    return result[0];
  }

  async createUser(user: InsertUser & { role?: string; balance?: number; registrationIp?: string }): Promise<User> {
    const id = randomUUID();
    const result = await db.insert(users).values({
      id,
      username: user.username,
      password: user.password,
      role: user.role || "user",
      balance: user.balance ?? 0,
      registrationIp: user.registrationIp || "",
    }).returning();
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

  async updateRoom(id: string, data: Partial<Pick<Room, "name" | "description" | "isActive" | "gameUrl">>): Promise<Room | undefined> {
    const result = await db.update(rooms).set(data).where(eq(rooms.id, id)).returning();
    return result[0];
  }

  async deleteRoom(id: string): Promise<void> {
    await db.update(rooms).set({ isActive: false }).where(eq(rooms.id, id));
  }

  async createBetRound(data: { roomId: string; options: object }): Promise<BetRound> {
    const id = randomUUID();
    const result = await db.insert(betRounds).values({ id, ...data, status: "open" }).returning();
    return result[0];
  }

  async getActiveBetRound(roomId: string): Promise<BetRound | undefined> {
    const result = await db.select().from(betRounds)
      .where(and(eq(betRounds.roomId, roomId), eq(betRounds.status, "open")))
      .orderBy(desc(betRounds.createdAt))
      .limit(1);
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

  async placeBet(data: { roundId: string; roomId: string; userId: string; username: string; option: string; amount: number }): Promise<Bet> {
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

  async getUserBetInRound(userId: string, roundId: string): Promise<Bet | undefined> {
    const result = await db.select().from(bets)
      .where(and(eq(bets.userId, userId), eq(bets.roundId, roundId)))
      .limit(1);
    return result[0];
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

  async updateBotSettings(data: { enabled: boolean; minAmount: number; maxAmount: number }): Promise<BotSettings> {
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
}

export const storage = new DbStorage();
