import { pgTable, text, varchar, integer, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  username: text("username").notNull().unique(),
  nickname: text("nickname").unique(),
  password: text("password").notNull(),
  balance: integer("balance").notNull().default(0),
  role: text("role").notNull().default("user"),
  notes: text("notes").default(""),
  banned: boolean("banned").notNull().default(false),
  isShill: boolean("is_shill").notNull().default(false),
  registrationIp: text("registration_ip").default(""),
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const botSettings = pgTable("bot_settings", {
  id: varchar("id", { length: 36 }).primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  minAmount: integer("min_amount").notNull().default(100),
  maxAmount: integer("max_amount").notNull().default(500),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const rooms = pgTable("rooms", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdBy: varchar("created_by", { length: 36 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  gameUrl: text("game_url").default(""),
  password: text("password").default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const betRounds = pgTable("bet_rounds", {
  id: varchar("id", { length: 36 }).primaryKey(),
  roomId: varchar("room_id", { length: 36 }).notNull(),
  options: jsonb("options").notNull(),
  status: text("status").notNull().default("open"),
  winnerOption: text("winner_option"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
});

export const bets = pgTable("bets", {
  id: varchar("id", { length: 36 }).primaryKey(),
  roundId: varchar("round_id", { length: 36 }).notNull(),
  roomId: varchar("room_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  username: text("username").notNull(),
  option: text("option").notNull(),
  amount: integer("amount").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: varchar("id", { length: 36 }).primaryKey(),
  roomId: varchar("room_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }),
  username: text("username"),
  content: text("content").notNull(),
  type: text("type").notNull().default("user"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const privateMessages = pgTable("private_messages", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  userUsername: text("user_username").notNull(),
  userNickname: text("user_nickname"),
  adminId: varchar("admin_id", { length: 36 }),
  adminUsername: text("admin_username"),
  content: text("content").notNull(),
  isFromAdmin: boolean("is_from_admin").notNull().default(false),
  readByAdmin: boolean("read_by_admin").notNull().default(false),
  readByUser: boolean("read_by_user").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("pm_user_idx").on(t.userId)]);

export const insertPrivateMessageSchema = createInsertSchema(privateMessages).pick({ content: true });
export type InsertPrivateMessage = z.infer<typeof insertPrivateMessageSchema>;
export type PrivateMessage = typeof privateMessages.$inferSelect;

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  nickname: true,
  password: true,
});

export const insertRoomSchema = createInsertSchema(rooms).pick({
  name: true,
  description: true,
});

export const insertBetSchema = createInsertSchema(bets).pick({
  option: true,
  amount: true,
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  content: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Room = typeof rooms.$inferSelect;
export type BetRound = typeof betRounds.$inferSelect;
export type Bet = typeof bets.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type BotSettings = typeof botSettings.$inferSelect;

export type BetOption = {
  key: string;
  label: string;
  color: string;
};
