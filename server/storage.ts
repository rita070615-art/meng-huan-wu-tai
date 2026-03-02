import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, desc, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  users, rooms, betRounds, bets, messages,
  type User, type InsertUser, type Room, type BetRound, type Bet, type Message,
} from "@shared/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser & { role?: string; balance?: number }): Promise<User>;
  updateUserBalance(id: string, balance: number): Promise<User | undefined>;
  updateUserNotes(id: string, notes: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;

  // Rooms
  createRoom(data: { name: string; description: string; createdBy: string }): Promise<Room>;
  getRooms(): Promise<Room[]>;
  getRoom(id: string): Promise<Room | undefined>;
  updateRoom(id: string, data: Partial<Pick<Room, "name" | "description" | "isActive">>): Promise<Room | undefined>;
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

  async createUser(user: InsertUser & { role?: string; balance?: number }): Promise<User> {
    const id = randomUUID();
    const result = await db.insert(users).values({
      id,
      username: user.username,
      password: user.password,
      role: user.role || "user",
      balance: user.balance ?? 0,
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

  async updateRoom(id: string, data: Partial<Pick<Room, "name" | "description" | "isActive">>): Promise<Room | undefined> {
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
}

export const storage = new DbStorage();
