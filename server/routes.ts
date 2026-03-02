import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import session from "express-session";
import { storage } from "./storage";
import { z } from "zod";

declare module "express-session" {
  interface SessionData {
    userId: string;
    username: string;
    role: string;
  }
}

type WsClient = {
  ws: WebSocket;
  userId: string;
  username: string;
  roomId: string;
};

const wsClients: WsClient[] = [];

function broadcast(roomId: string, data: object) {
  const msg = JSON.stringify(data);
  wsClients.forEach((c) => {
    if (c.roomId === roomId && c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(msg);
    }
  });
}

function broadcastAll(data: object) {
  const msg = JSON.stringify(data);
  wsClients.forEach((c) => {
    if (c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(msg);
    }
  });
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "gaming-chat-secret",
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 },
    })
  );

  const requireAuth = (req: Request, res: Response, next: Function) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
    next();
  };

  const requireAdmin = (req: Request, res: Response, next: Function) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
    if (req.session.role !== "admin") return res.status(403).json({ error: "Forbidden" });
    next();
  };

  const getClientIp = (req: Request): string => {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return ips.split(",")[0].trim();
    }
    return req.socket?.remoteAddress || req.ip || "";
  };

  // AUTH
  app.post("/api/auth/register", async (req, res) => {
    const schema = z.object({ username: z.string().min(3).max(20), password: z.string().min(4) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const existing = await storage.getUserByUsername(parsed.data.username);
    if (existing) return res.status(400).json({ error: "用户名已存在" });

    const clientIp = getClientIp(req);
    if (clientIp) {
      const ipUser = await storage.getUserByIp(clientIp);
      if (ipUser) return res.status(400).json({ error: "该网络已注册过账号，每个IP只能注册一个账号" });
    }

    const user = await storage.createUser({ ...parsed.data, registrationIp: clientIp });
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    res.json({ id: user.id, username: user.username, balance: user.balance, role: user.role });
  });

  app.post("/api/auth/login", async (req, res) => {
    const schema = z.object({ username: z.string(), password: z.string() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

    const user = await storage.getUserByUsername(parsed.data.username);
    if (!user || user.password !== parsed.data.password) {
      return res.status(401).json({ error: "用户名或密码错误" });
    }
    if (user.banned) {
      return res.status(403).json({ error: "该账号已被封禁，请联系管理员" });
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    res.json({ id: user.id, username: user.username, balance: user.balance, role: user.role });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) return res.json(null);
    const user = await storage.getUser(req.session.userId);
    if (!user) return res.json(null);
    res.json({ id: user.id, username: user.username, balance: user.balance, role: user.role });
  });

  // ROOMS
  app.get("/api/rooms", requireAuth, async (req, res) => {
    const roomList = await storage.getRooms();
    const enriched = await Promise.all(
      roomList.map(async (room) => {
        const round = await storage.getActiveBetRound(room.id);
        return { ...room, hasActiveBet: !!round };
      })
    );
    res.json(enriched);
  });

  app.get("/api/rooms/:id", requireAuth, async (req, res) => {
    const room = await storage.getRoom(req.params.id);
    if (!room) return res.status(404).json({ error: "Room not found" });
    res.json(room);
  });

  app.post("/api/rooms", requireAdmin, async (req, res) => {
    const schema = z.object({ name: z.string().min(1), description: z.string().default("") });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const room = await storage.createRoom({ ...parsed.data, createdBy: req.session.userId! });
    await storage.createMessage({ roomId: room.id, content: `欢迎来到 ${room.name}！`, type: "system" });
    await storage.createMessage({ roomId: room.id, content: "开始下注吧！", type: "system" });
    broadcastAll({ type: "ROOM_CREATED", room });
    res.json(room);
  });

  app.patch("/api/rooms/:id", requireAdmin, async (req, res) => {
    const schema = z.object({
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      isActive: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const room = await storage.updateRoom(req.params.id, parsed.data);
    if (!room) return res.status(404).json({ error: "Room not found" });
    broadcastAll({ type: "ROOM_UPDATED", room });
    res.json(room);
  });

  app.delete("/api/rooms/:id", requireAdmin, async (req, res) => {
    await storage.deleteRoom(req.params.id);
    broadcastAll({ type: "ROOM_DELETED", roomId: req.params.id });
    res.json({ ok: true });
  });

  app.patch("/api/admin/rooms/:id/game-url", requireAdmin, async (req, res) => {
    const schema = z.object({ gameUrl: z.string().max(2000) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid URL" });
    const room = await storage.updateRoom(req.params.id, { gameUrl: parsed.data.gameUrl });
    if (!room) return res.status(404).json({ error: "Room not found" });
    broadcastAll({ type: "ROOM_UPDATED", room });
    res.json(room);
  });

  // MESSAGES
  app.get("/api/rooms/:id/messages", requireAuth, async (req, res) => {
    const msgs = await storage.getMessages(req.params.id, 100);
    res.json(msgs);
  });

  app.post("/api/rooms/:id/messages", requireAuth, async (req, res) => {
    const schema = z.object({ content: z.string().min(1).max(500) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const sender = await storage.getUser(req.session.userId!);
    if (!sender) return res.status(401).json({ error: "用户不存在" });
    if (sender.banned) return res.status(403).json({ error: "账号已被封禁" });
    if (sender.role !== "admin" && sender.balance < 1) {
      return res.status(403).json({ error: "积分不足，余额需至少 1 分才能发言" });
    }

    const msg = await storage.createMessage({
      roomId: req.params.id,
      userId: req.session.userId,
      username: req.session.username,
      content: parsed.data.content,
      type: "user",
    });
    broadcast(req.params.id, { type: "MESSAGE", message: msg });
    res.json(msg);
  });

  app.delete("/api/rooms/:roomId/messages/:messageId", requireAdmin, async (req, res) => {
    await storage.deleteMessage(req.params.messageId);
    broadcast(req.params.roomId, { type: "MESSAGE_DELETED", messageId: req.params.messageId });
    res.json({ ok: true });
  });

  // BET ROUNDS
  app.get("/api/rooms/:id/bet-round", requireAuth, async (req, res) => {
    const round = await storage.getActiveBetRound(req.params.id);
    if (!round) return res.json(null);
    const betsForRound = await storage.getBetsForRound(round.id);
    res.json({ ...round, bets: betsForRound });
  });

  app.post("/api/rooms/:id/bet-round", requireAdmin, async (req, res) => {
    const existing = await storage.getActiveBetRound(req.params.id);
    if (existing) return res.status(400).json({ error: "已有进行中的投注轮" });

    const defaultOptions = [
      { key: "A", label: "A", color: "#f97316" },
      { key: "B", label: "B", color: "#6366f1" },
      { key: "C", label: "C", color: "#10b981" },
    ];

    const options = req.body.options || defaultOptions;
    const round = await storage.createBetRound({ roomId: req.params.id, options });

    const msg = await storage.createMessage({
      roomId: req.params.id,
      content: "🎯 投注已开始！请选择您的选项进行下注。",
      type: "system",
    });
    broadcast(req.params.id, { type: "BET_ROUND_STARTED", round, message: msg });

    // Auto-bet: trigger shill accounts if bot is enabled
    try {
      const botCfg = await storage.getBotSettings();
      if (botCfg.enabled) {
        const shills = await storage.getShillUsers();
        for (const shill of shills) {
          const amount = Math.floor(Math.random() * (botCfg.maxAmount - botCfg.minAmount + 1)) + botCfg.minAmount;
          if (shill.balance < amount) {
            const warnMsg = await storage.createMessage({
              roomId: req.params.id,
              content: `⚠️ @${shill.username} 积分不足（${shill.balance}），此条无效`,
              type: "system",
            });
            broadcast(req.params.id, { type: "MESSAGE", message: warnMsg });
            continue;
          }
          const randomOption = (options as Array<{ key: string }>)[Math.floor(Math.random() * options.length)].key;
          const bet = await storage.placeBet({
            roundId: round.id,
            roomId: req.params.id,
            userId: shill.id,
            username: shill.username,
            option: randomOption,
            amount,
          });
          broadcast(req.params.id, { type: "NEW_BET", bet });
        }
      }
    } catch (e) {
      console.error("Auto-bet error:", e);
    }

    res.json(round);
  });

  app.patch("/api/rooms/:id/bet-round/options", requireAdmin, async (req, res) => {
    const round = await storage.getActiveBetRound(req.params.id);
    if (!round) return res.status(404).json({ error: "No active round" });

    const updated = await storage.updateBetRoundOptions(round.id, req.body.options);
    broadcast(req.params.id, { type: "BET_OPTIONS_UPDATED", round: updated });
    res.json(updated);
  });

  app.post("/api/rooms/:id/bet-round/close", requireAdmin, async (req, res) => {
    const round = await storage.getActiveBetRound(req.params.id);
    if (!round) return res.status(404).json({ error: "No active round" });

    const schema = z.object({ winnerOption: z.string() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid winner" });

    const closed = await storage.closeBetRound(round.id, parsed.data.winnerOption);
    const roundBets = await storage.getBetsForRound(round.id);

    const winners = roundBets.filter((b) => b.option === parsed.data.winnerOption);
    const totalPool = roundBets.reduce((s, b) => s + b.amount, 0);
    const winnerPool = winners.reduce((s, b) => s + b.amount, 0);

    for (const bet of winners) {
      const user = await storage.getUser(bet.userId);
      if (user) {
        const payout = winnerPool > 0 ? Math.floor((bet.amount / winnerPool) * totalPool * 0.9) : 0;
        await storage.updateUserBalance(bet.userId, user.balance + payout);
      }
    }

    const options = round.options as Array<{ key: string; label: string }>;
    const winnerOpt = options.find((o) => o.key === parsed.data.winnerOption);
    const msg = await storage.createMessage({
      roomId: req.params.id,
      content: `🏆 投注结束！获胜选项：${winnerOpt?.label || parsed.data.winnerOption}。奖池共 ${totalPool} 金币，已分配给胜者。`,
      type: "system",
    });

    broadcast(req.params.id, { type: "BET_ROUND_CLOSED", round: closed, winnerOption: parsed.data.winnerOption, message: msg });
    res.json(closed);
  });

  // BETS
  app.post("/api/rooms/:id/bets", requireAuth, async (req, res) => {
    const round = await storage.getActiveBetRound(req.params.id);
    if (!round) return res.status(400).json({ error: "当前没有开放的投注" });

    const schema = z.object({ option: z.string(), amount: z.number().int().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const existing = await storage.getUserBetInRound(req.session.userId!, round.id);
    if (existing) return res.status(400).json({ error: "您在本轮已下注" });

    const user = await storage.getUser(req.session.userId!);
    if (!user || user.balance < parsed.data.amount) {
      return res.status(400).json({ error: "余额不足" });
    }

    await storage.updateUserBalance(user.id, user.balance - parsed.data.amount);

    const bet = await storage.placeBet({
      roundId: round.id,
      roomId: req.params.id,
      userId: req.session.userId!,
      username: req.session.username!,
      option: parsed.data.option,
      amount: parsed.data.amount,
    });

    broadcast(req.params.id, { type: "NEW_BET", bet });
    res.json(bet);
  });

  app.get("/api/rooms/:id/bets", requireAuth, async (req, res) => {
    const betsForRoom = await storage.getBetsForRoom(req.params.id);
    res.json(betsForRoom);
  });

  // ADMIN
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    const allUsers = await storage.getAllUsers();
    res.json(allUsers.map((u) => ({ id: u.id, username: u.username, balance: u.balance, role: u.role, notes: u.notes || "", banned: u.banned })));
  });

  app.patch("/api/admin/users/:id/balance", requireAdmin, async (req, res) => {
    const schema = z.object({ balance: z.number().int().min(0) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid balance" });

    const user = await storage.updateUserBalance(req.params.id, parsed.data.balance);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ id: user.id, username: user.username, balance: user.balance });
  });

  app.patch("/api/admin/users/:id/notes", requireAdmin, async (req, res) => {
    const schema = z.object({ notes: z.string().max(500) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid notes" });

    const user = await storage.updateUserNotes(req.params.id, parsed.data.notes);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ id: user.id, username: user.username, notes: user.notes });
  });

  app.patch("/api/admin/users/:id/ban", requireAdmin, async (req, res) => {
    const schema = z.object({ banned: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

    const target = await storage.getUser(req.params.id);
    if (!target) return res.status(404).json({ error: "User not found" });
    if (target.role === "admin") return res.status(400).json({ error: "不能封禁管理员账号" });

    const user = await storage.banUser(req.params.id, parsed.data.banned);
    res.json({ id: user!.id, username: user!.username, banned: user!.banned });
  });

  app.patch("/api/admin/users/:id/shill", requireAdmin, async (req, res) => {
    const schema = z.object({ isShill: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

    const target = await storage.getUser(req.params.id);
    if (!target) return res.status(404).json({ error: "User not found" });
    if (target.role === "admin") return res.status(400).json({ error: "不能将管理员设为托" });

    const user = await storage.setUserShill(req.params.id, parsed.data.isShill);
    res.json({ id: user!.id, username: user!.username, isShill: user!.isShill });
  });

  // BOT SETTINGS
  app.get("/api/admin/bot-settings", requireAdmin, async (req, res) => {
    const settings = await storage.getBotSettings();
    res.json(settings);
  });

  app.patch("/api/admin/bot-settings", requireAdmin, async (req, res) => {
    const schema = z.object({
      enabled: z.boolean(),
      minAmount: z.number().int().min(1),
      maxAmount: z.number().int().min(1),
    }).refine(d => d.maxAmount >= d.minAmount, { message: "最大值不能小于最小值" });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const settings = await storage.updateBotSettings(parsed.data);
    res.json(settings);
  });

  // WEBSOCKET
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "", `http://localhost`);
    const roomId = url.searchParams.get("roomId") || "";
    const userId = url.searchParams.get("userId") || "";
    const username = url.searchParams.get("username") || "";

    const client: WsClient = { ws, userId, username, roomId };
    wsClients.push(client);

    ws.on("close", () => {
      const idx = wsClients.indexOf(client);
      if (idx !== -1) wsClients.splice(idx, 1);
    });
  });

  // SEED
  await seedData();

  return httpServer;
}

async function seedData() {
  try {
    const admin = await storage.getUserByUsername("admin");
    if (admin) return;

    const adminUser = await storage.createUser({ username: "admin", password: "admin123", role: "admin", balance: 99999 } as any);
    await storage.createUser({ username: "player1", password: "pass1234", role: "user", balance: 2000 } as any);
    await storage.createUser({ username: "player2", password: "pass1234", role: "user", balance: 1500 } as any);

    const room1 = await storage.createRoom({ name: "百家乐大厅", description: "经典百家乐，押注庄闲", createdBy: adminUser.id });
    const room2 = await storage.createRoom({ name: "竞技预测厅", description: "预测比赛结果，赢取丰厚奖励", createdBy: adminUser.id });
    const room3 = await storage.createRoom({ name: "幸运色子间", description: "猜猜骰子点数，运气决定一切", createdBy: adminUser.id });

    await storage.createMessage({ roomId: room1.id, content: "欢迎来到百家乐大厅！", type: "system" });
    await storage.createMessage({ roomId: room1.id, content: "请理性投注，享受游戏乐趣。", type: "system" });
    await storage.createMessage({ roomId: room2.id, content: "欢迎来到竞技预测厅！", type: "system" });
    await storage.createMessage({ roomId: room3.id, content: "欢迎来到幸运色子间！", type: "system" });
  } catch (e) {
    console.error("Seed error:", e);
  }
}
