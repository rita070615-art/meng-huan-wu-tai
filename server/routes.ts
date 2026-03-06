import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import session from "express-session";
import { storage } from "./storage";
import { z } from "zod";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import * as XLSX from "xlsx";

declare module "express-session" {
  interface SessionData {
    userId: string;
    username: string;
    nickname: string;
    role: string;
    verifiedRooms: string[];
    totpVerified: boolean;
    contactAdminCount: number;
  }
}

// In-memory rate limiter: userId → last N message timestamps
const userMsgTimestamps = new Map<string, number[]>();
function checkSpam(userId: string, content: string): string | null {
  // Content checks
  if (content.length > 30) return "消息过长，请限制在30字以内";
  if (/https?:\/\/|www\./i.test(content)) return "不允许发送链接";
  if (/(.)\1{5,}/.test(content)) return "请勿发送大量重复字符";
  const banned = ["微信", "QQ群", "加群", "代理", "兼职", "广告", "优惠", "刷单"];
  if (banned.some(k => content.includes(k))) return "消息含有违禁内容，请勿发送广告";
  // Rate limit: max 5 messages per 60 seconds
  const now = Date.now();
  const timestamps = (userMsgTimestamps.get(userId) || []).filter(t => now - t < 60000);
  if (timestamps.length >= 5) return "发送太快，1分钟内最多发送5条消息";
  timestamps.push(now);
  userMsgTimestamps.set(userId, timestamps);
  return null;
}

type WsClient = {
  ws: WebSocket;
  userId: string;
  username: string;
  roomId: string;
  isAlive: boolean;
  lastActivity: number;
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

function broadcastToUser(userId: string, data: object) {
  const msg = JSON.stringify(data);
  wsClients.forEach((c) => {
    if (c.userId === userId && c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(msg);
    }
  });
}

function broadcastToAdmins(data: object) {
  broadcastAll(data);
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

  const requireSession = (req: Request, res: Response, next: Function) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
    next();
  };

  const requireAuth = (req: Request, res: Response, next: Function) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.session.totpVerified) {
      return res.status(403).json({ error: "TOTP_REQUIRED" });
    }
    next();
  };

  const requireAdmin = (req: Request, res: Response, next: Function) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
    if (req.session.role !== "admin") return res.status(403).json({ error: "Forbidden" });
    if (!req.session.totpVerified) return res.status(403).json({ error: "TOTP_REQUIRED" });
    next();
  };

  // AUTH
  app.post("/api/auth/register", async (req, res) => {
    const schema = z.object({
      username: z.string().min(3).max(20),
      nickname: z.string().min(1).max(20),
      password: z.string().min(4),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const existing = await storage.getUserByUsername(parsed.data.username);
    if (existing) return res.status(400).json({ error: "用户名已存在" });

    const existingNick = await storage.getUserByNickname(parsed.data.nickname);
    if (existingNick) return res.status(400).json({ error: "昵称已被使用，请换一个" });

    const user = await storage.createUser({ ...parsed.data });
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.nickname = user.nickname || user.username;
    req.session.role = user.role;
    req.session.totpVerified = false;
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: "注册失败，请重试" });
      res.json({ id: user.id, username: user.username, nickname: user.nickname, balance: user.balance, role: user.role, totpEnabled: false, totpVerified: false });
    });
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
    if (user.isShill) {
      return res.status(403).json({ error: "该账号为托管账户，无法登录" });
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.nickname = user.nickname || user.username;
    req.session.role = user.role;
    req.session.totpVerified = !user.totpEnabled;
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: "登录失败，请重试" });
      res.json({ id: user.id, username: user.username, nickname: user.nickname, balance: user.balance, role: user.role, totpEnabled: user.totpEnabled, totpVerified: req.session.totpVerified });
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) return res.json(null);
    const user = await storage.getUser(req.session.userId);
    if (!user) return res.json(null);
    res.json({ id: user.id, username: user.username, nickname: user.nickname, balance: user.balance, role: user.role, totpEnabled: user.totpEnabled, totpVerified: req.session.totpVerified ?? false });
  });

  // Forgot password (public — no session required)
  app.post("/api/auth/reset-password", async (req, res) => {
    const schema = z.object({
      username: z.string().min(1),
      totpCode: z.string().length(6),
      newPassword: z.string().min(4),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const user = await storage.getUserByUsername(parsed.data.username);
    if (!user) return res.status(404).json({ error: "用户名不存在" });
    if (!user.totpEnabled || !user.totpSecret) {
      return res.status(400).json({ error: "该账号未绑定双重认证，无法通过此方式重置密码" });
    }

    const isValid = speakeasy.totp.verify({
      secret: user.totpSecret,
      encoding: "base32",
      token: parsed.data.totpCode,
      window: 1,
    });
    if (!isValid) return res.status(400).json({ error: "验证码错误，请重试" });

    await storage.updateUserPassword(user.id, parsed.data.newPassword);
    res.json({ ok: true });
  });

  // TOTP
  app.get("/api/auth/totp/setup", requireSession, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(404).json({ error: "用户不存在" });
    if (user.totpEnabled) return res.status(400).json({ error: "TOTP已经绑定" });

    const secretObj = speakeasy.generateSecret({ length: 20, name: `梦幻舞台:${user.username}`, issuer: "梦幻舞台" });
    const secret = secretObj.base32;
    const otpauth = speakeasy.otpauthURL({ secret, label: encodeURIComponent(user.username), issuer: "梦幻舞台", encoding: "base32" });
    const qrDataUrl = await QRCode.toDataURL(otpauth);
    res.json({ secret, qrDataUrl });
  });

  app.post("/api/auth/totp/enable", requireSession, async (req, res) => {
    const schema = z.object({ secret: z.string(), code: z.string().length(6) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "参数错误" });

    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(404).json({ error: "用户不存在" });
    if (user.totpEnabled) return res.status(400).json({ error: "TOTP已经绑定" });

    const isValid = speakeasy.totp.verify({ secret: parsed.data.secret, encoding: "base32", token: parsed.data.code, window: 1 });
    if (!isValid) return res.status(400).json({ error: "验证码错误，请重试" });

    await storage.enableTotp(user.id, parsed.data.secret);
    req.session.totpVerified = true;
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: "绑定失败，请重试" });
      res.json({ ok: true });
    });
  });

  app.post("/api/auth/totp/verify", requireSession, async (req, res) => {
    const schema = z.object({ code: z.string().length(6) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "验证码格式错误" });

    const user = await storage.getUser(req.session.userId!);
    if (!user || !user.totpSecret || !user.totpEnabled) {
      return res.status(400).json({ error: "未绑定TOTP" });
    }

    const isValid = speakeasy.totp.verify({ secret: user.totpSecret, encoding: "base32", token: parsed.data.code, window: 1 });
    if (!isValid) return res.status(400).json({ error: "验证码错误，请重试" });

    req.session.totpVerified = true;
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: "验证失败，请重试" });
      res.json({ ok: true });
    });
  });

  app.post("/api/user/change-password", requireSession, async (req, res) => {
    const schema = z.object({
      totpCode: z.string().length(6),
      newPassword: z.string().min(4),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(404).json({ error: "用户不存在" });

    if (!user.totpSecret || !user.totpEnabled) {
      return res.status(400).json({ error: "请先绑定双重认证" });
    }

    const isValid = speakeasy.totp.verify({ secret: user.totpSecret, encoding: "base32", token: parsed.data.totpCode, window: 1 });
    if (!isValid) return res.status(400).json({ error: "验证码错误" });

    await storage.updateUserPassword(user.id, parsed.data.newPassword);
    res.json({ ok: true });
  });

  // ROOMS
  async function checkRoomAccess(req: any, res: any, roomId: string): Promise<boolean> {
    if (req.session.role === "admin") return true;
    const room = await storage.getRoom(roomId);
    if (!room) { res.status(404).json({ error: "Room not found" }); return false; }
    if (!room.password) return true;
    const verified = req.session.verifiedRooms || [];
    if (verified.includes(roomId)) return true;
    res.status(403).json({ error: "需要输入密码", requiresPassword: true });
    return false;
  }

  app.get("/api/rooms", requireAuth, async (req, res) => {
    const roomList = await storage.getRooms();
    const isAdmin = req.session.role === "admin";
    const enriched = await Promise.all(
      roomList.map(async (room) => {
        const round = await storage.getActiveBetRound(room.id);
        const base = { ...room, hasActiveBet: !!round, hasPassword: !!(room.password) };
        if (!isAdmin) { const { password: _pw, ...rest } = base; return rest; }
        return base;
      })
    );
    res.json(enriched);
  });

  app.get("/api/rooms/:id", requireAuth, async (req, res) => {
    const room = await storage.getRoom(req.params.id);
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (req.session.role === "admin") return res.json(room);
    const { password: _pw, ...rest } = room;
    res.json({ ...rest, hasPassword: !!(room.password) });
  });

  app.post("/api/rooms/:id/enter", requireAuth, async (req, res) => {
    const room = await storage.getRoom(req.params.id);
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (req.session.role === "admin") return res.json({ ok: true });
    if (room.password) {
      const schema = z.object({ password: z.string() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success || parsed.data.password !== room.password) {
        return res.status(403).json({ error: "密码错误" });
      }
    }
    if (!req.session.verifiedRooms) req.session.verifiedRooms = [];
    if (!req.session.verifiedRooms.includes(req.params.id)) {
      req.session.verifiedRooms.push(req.params.id);
    }
    req.session.save(() => res.json({ ok: true }));
  });

  app.patch("/api/admin/rooms/:id/password", requireAdmin, async (req, res) => {
    const schema = z.object({ password: z.string().max(100) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid password" });
    const room = await storage.updateRoom(req.params.id, { password: parsed.data.password });
    if (!room) return res.status(404).json({ error: "Room not found" });
    res.json({ ok: true, hasPassword: !!(room.password) });
  });

  app.post("/api/rooms", requireAdmin, async (req, res) => {
    const schema = z.object({ name: z.string().min(1), description: z.string().default("") });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const room = await storage.createRoom({ ...parsed.data, createdBy: req.session.userId! });
    await storage.createMessage({ roomId: room.id, content: `欢迎来到 ${room.name}！`, type: "system" });
    await storage.createMessage({ roomId: room.id, content: "开始点餐吧！", type: "system" });
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
    if (!await checkRoomAccess(req, res, req.params.id)) return;
    const msgs = await storage.getMessages(req.params.id, 100);
    res.json(msgs);
  });

  app.post("/api/rooms/:id/messages", requireAuth, async (req, res) => {
    const schema = z.object({ content: z.string().min(1).max(30) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const sender = await storage.getUser(req.session.userId!);
    if (!sender) return res.status(401).json({ error: "用户不存在" });
    if (sender.banned) return res.status(403).json({ error: "账号已被封禁" });
    if (sender.muted) return res.status(403).json({ error: "您已被禁言，无法发送消息" });
    if (sender.role !== "admin" && sender.balance < 1) {
      return res.status(403).json({ error: "积分不足，余额需至少 1 分才能发言" });
    }

    if (sender.role !== "admin") {
      const room = await storage.getRoom(req.params.id);
      if (room?.chatMuted) return res.status(403).json({ error: "当前聊天室已被管理员禁言" });
      const spamErr = checkSpam(sender.id, parsed.data.content);
      if (spamErr) return res.status(429).json({ error: spamErr });
    }

    const msg = await storage.createMessage({
      roomId: req.params.id,
      userId: req.session.userId,
      username: sender.nickname || sender.username,
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

  app.delete("/api/admin/rooms/:id/messages", requireAdmin, async (req, res) => {
    const schema = z.object({ confirmPassword: z.string() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "请提供确认密码" });

    const admin = await storage.getUser(req.session.userId!);
    if (!admin || admin.password !== parsed.data.confirmPassword) {
      return res.status(403).json({ error: "密码错误，操作取消" });
    }

    await storage.clearMessages(req.params.id);
    broadcast(req.params.id, { type: "MESSAGES_CLEARED" });
    res.json({ ok: true });
  });

  app.patch("/api/admin/rooms/:id/chat-mute", requireAdmin, async (req, res) => {
    const schema = z.object({ chatMuted: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
    const room = await storage.updateRoom(req.params.id, { chatMuted: parsed.data.chatMuted });
    if (!room) return res.status(404).json({ error: "房间不存在" });
    broadcast(req.params.id, { type: "ROOM_CHAT_MUTED", chatMuted: parsed.data.chatMuted });
    res.json({ id: room.id, chatMuted: room.chatMuted });
  });

  // Contact admin (public — for unauthenticated or banned users)
  app.post("/api/contact-admin", async (req, res) => {
    const schema = z.object({ content: z.string().min(1).max(500), nickname: z.string().max(20).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "消息内容无效" });

    const count = req.session.contactAdminCount || 0;
    if (count >= 3) return res.status(429).json({ error: "您已发送3条消息，请等待管理员回复" });

    let visitorId = "00000000-0000-0000-0000-000000000000";
    let visitorUsername = "访客";
    let visitorNickname: string | null = parsed.data.nickname || null;

    if (req.session.userId) {
      const user = await storage.getUser(req.session.userId);
      if (user) {
        visitorId = user.id;
        visitorUsername = user.username;
        visitorNickname = user.nickname ?? null;
      }
    }

    await storage.createPrivateMessage({
      userId: visitorId,
      userUsername: visitorUsername,
      userNickname: visitorNickname ?? `访客${count + 1}`,
      content: parsed.data.content,
      isFromAdmin: false,
    });
    broadcastToAdmins({ type: "NEW_PRIVATE_MESSAGE" });

    req.session.contactAdminCount = count + 1;
    req.session.save(() => res.json({ ok: true, remaining: 2 - count }));
  });

  // BET ROUNDS
  app.get("/api/rooms/:id/bet-round", requireAuth, async (req, res) => {
    if (!await checkRoomAccess(req, res, req.params.id)) return;
    const round = await storage.getActiveBetRound(req.params.id);
    if (!round) return res.json(null);
    const betsForRound = await storage.getBetsForRound(round.id);
    res.json({ ...round, bets: betsForRound });
  });

  app.post("/api/rooms/:id/bet-round", requireAdmin, async (req, res) => {
    const existing = await storage.getActiveBetRound(req.params.id);
    if (existing) return res.status(400).json({ error: "已有进行中的投注轮" });

    const defaultOptions = [
      { key: "A", label: "力量", color: "#ef4444" },
      { key: "B", label: "体力", color: "#22c55e" },
      { key: "C", label: "法力", color: "#a855f7" },
      { key: "D", label: "耐力", color: "#3b82f6" },
    ];

    const options = req.body.options || defaultOptions;
    const { bankerUserId, bankerNickname, bankerOption, bankerMaxBet } = req.body;

    // Validate banker has enough balance to cover the cap
    if (bankerUserId && bankerMaxBet) {
      const banker = await storage.getUser(bankerUserId);
      if (!banker || banker.balance < Number(bankerMaxBet)) {
        const name = banker?.nickname || banker?.username || "该用户";
        return res.status(400).json({ error: `${name}积分不足（当前：${(banker?.balance || 0).toLocaleString()}，需要：${Number(bankerMaxBet).toLocaleString()}）` });
      }
    }

    const pumpRate = req.body.pumpRate != null ? Math.max(0, Math.min(50, Number(req.body.pumpRate))) : 0;
    const playerPumpRate = req.body.playerPumpRate != null ? Math.max(0, Math.min(50, Number(req.body.playerPumpRate))) : 0;
    const round = await storage.createBetRound({
      roomId: req.params.id,
      options,
      bankerUserId: bankerUserId || undefined,
      bankerNickname: bankerNickname || undefined,
      bankerOption: bankerOption || undefined,
      bankerMaxBet: bankerMaxBet ? Number(bankerMaxBet) : undefined,
      pumpRate,
      playerPumpRate,
    });

    // Deduct banker's pool from their balance
    if (bankerUserId && bankerMaxBet) {
      const banker = await storage.getUser(bankerUserId);
      if (banker) {
        await storage.updateUserBalance(bankerUserId, banker.balance - Number(bankerMaxBet));
      }
    }

    const msg = await storage.createMessage({
      roomId: req.params.id,
      content: "今日菜单已开放，请选择您的口味。",
      type: "system",
    });
    broadcast(req.params.id, { type: "BET_ROUND_STARTED", round, message: msg });

    // Auto-bet: trigger shill accounts with staggered random delays to mimic real users
    try {
      const botCfg = await storage.getBotSettings();
      if (botCfg.enabled) {
        const shills = await storage.getShillUsers();
        // Shuffle shills so order is random each round
        const shuffled = [...shills].sort(() => Math.random() - 0.5);
        // Assign each shill a unique random delay (5s–90s), spread out so they don't overlap
        let usedDelays: number[] = [];
        for (const shill of shuffled) {
          // Pick a delay not too close to any already used
          let delay: number;
          let attempts = 0;
          do {
            delay = Math.floor(Math.random() * 85000) + 5000; // 5s–90s in ms
            attempts++;
          } while (usedDelays.some(d => Math.abs(d - delay) < 3000) && attempts < 20);
          usedDelays.push(delay);

          const shillId = shill.id;
          const shillUsername = shill.username;
          const shillBalance = shill.balance;
          const roomId = req.params.id;
          const roundId = round.id;
          const optionsList = options as Array<{ key: string }>;

          setTimeout(async () => {
            try {
              // Verify the round is still active before placing bet
              const activeRound = await storage.getActiveBetRound(roomId);
              if (!activeRound || activeRound.id !== roundId) return;

              const minStep = Math.max(1, Math.ceil(botCfg.minAmount / 50));
              const maxStep = Math.max(minStep, Math.floor(botCfg.maxAmount / 50));
              const amount = (minStep + Math.floor(Math.random() * (maxStep - minStep + 1))) * 50;
              if (shillBalance < amount) {
                const warnMsg = await storage.createMessage({
                  roomId,
                  content: `⚠️ @${shillUsername} 积分不足（${shillBalance}），此条无效`,
                  type: "system",
                });
                broadcast(roomId, { type: "MESSAGE", message: warnMsg });
                return;
              }
              const availableOptions = optionsList.filter(o => !activeRound.bankerOption || o.key !== activeRound.bankerOption);
              const randomOption = availableOptions[Math.floor(Math.random() * availableOptions.length)].key;
              const shillUser = await storage.getUser(shillId);
              await storage.updateUserBalance(shillId, shillBalance - amount);
              const bet = await storage.placeBet({
                roundId,
                roomId,
                userId: shillId,
                username: shillUsername,
                nickname: shillUser?.nickname || null,
                option: randomOption,
                amount,
              });
              const shillOptLabel = (activeRound.options as Array<{ key: string; label: string }>).find(o => o.key === randomOption)?.label || randomOption;
              const shillDisplayName = shillUser?.nickname || shillUsername;
              const shillBetMsg = await storage.createMessage({
                roomId,
                userId: shillId,
                username: shillDisplayName,
                content: `${shillDisplayName}:${shillOptLabel}${amount.toLocaleString()}`,
                type: "bet",
              });
              broadcast(roomId, { type: "MESSAGE", message: shillBetMsg });
              broadcast(roomId, { type: "NEW_BET", bet });
            } catch (e) {
              console.error(`Shill auto-bet error (${shillUsername}):`, e);
            }
          }, delay);
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

    const options = round.options as Array<{ key: string; label: string; color: string; ratio?: number }>;
    const winnerOpt = options.find((o) => o.key === parsed.data.winnerOption);
    // roundBets comes desc(createdAt), reverse for chronological (oldest = highest priority)
    const roundBetsChron = [...roundBets].reverse();
    const winners = roundBetsChron.filter((b) => b.option === parsed.data.winnerOption);
    const totalPool = roundBets.reduce((s, b) => s + b.amount, 0);
    const pumpRate = (round as any).pumpRate ?? 0;           // 上庄抽水率
    const playerPumpRate = (round as any).playerPumpRate ?? 0; // 下庄抽水率
    const useFixedOdds = options.some(o => o.ratio != null && o.ratio > 0);
    const hasbanker = !!(round.bankerUserId && round.bankerMaxBet);

    // 上庄抽水：开局时已扣 bankerMaxBet，实际可用于赔付的资金 = floor(bankerMaxBet × (1 - pumpRate%))
    const effectiveBankerFund = (hasbanker && round.bankerMaxBet)
      ? Math.floor((round.bankerMaxBet as number) * (1 - pumpRate / 100))
      : Infinity;
    // Track remaining banker funds (only relevant in fixed-odds with banker)
    let bankerFund = (useFixedOdds && hasbanker) ? effectiveBankerFund : Infinity;

    let totalPayout = 0;
    // Track per-bet actual payout for summary (betId -> payout)
    const betPayouts = new Map<string, number>();

    if (useFixedOdds) {
      const ratio = winnerOpt?.ratio ?? 1;
      for (const bet of winners) {
        const user = await storage.getUser(bet.userId);
        if (!user) { betPayouts.set(bet.id, 0); continue; }
        const gross = Math.floor(bet.amount * ratio);
        // 下庄抽水：只抽盈利部分
        const profit = gross - bet.amount;
        const pump = profit > 0 ? Math.floor(profit * playerPumpRate / 100) : 0;
        const fullPayout = gross - pump;
        // Cap payout by remaining banker fund
        const payout = Math.min(fullPayout, bankerFund);
        betPayouts.set(bet.id, payout);
        if (payout > 0) {
          totalPayout += payout;
          bankerFund -= payout;
          await storage.updateUserBalance(bet.userId, user.balance + payout);
        }
      }
    } else {
      // Parimutuel: share pool proportionally among winners; 下庄抽水只抽盈利
      const winnerPool = winners.reduce((s, b) => s + b.amount, 0);
      for (const bet of winners) {
        const user = await storage.getUser(bet.userId);
        if (!user) { betPayouts.set(bet.id, 0); continue; }
        const gross = winnerPool > 0 ? Math.floor((bet.amount / winnerPool) * totalPool) : 0;
        const profit = gross - bet.amount;
        const pump = profit > 0 ? Math.floor(profit * playerPumpRate / 100) : 0;
        const payout = Math.max(0, gross - pump);
        betPayouts.set(bet.id, payout);
        totalPayout += payout;
        await storage.updateUserBalance(bet.userId, user.balance + payout);
      }
    }

    // Return remainder to banker after paying winners (commission already taken upfront)
    let bankerReturnMsg = "";
    if (hasbanker) {
      const banker = await storage.getUser(round.bankerUserId);
      if (banker) {
        // Remaining effective fund goes back; no additional deduction (already taken at start)
        const bankerReturn = useFixedOdds
          ? (bankerFund === Infinity ? 0 : Math.max(0, bankerFund))
          : effectiveBankerFund; // parimutuel: return the after-commission deposit
        if (bankerReturn > 0) {
          await storage.updateUserBalance(round.bankerUserId, banker.balance + bankerReturn);
        }
        const bankerName = round.bankerNickname || banker.nickname || banker.username;
        bankerReturnMsg = `\n庄家 ${bankerName} 返还：${bankerReturn.toLocaleString()}`;
      }
    }

    const msg = await storage.createMessage({
      roomId: req.params.id,
      content: `本轮厨房已完成出餐。\n今日人气口味：${winnerOpt?.label || parsed.data.winnerOption}\n感谢参与点餐体验。`,
      type: "system",
    });

    // Build bet summary in chronological order (oldest first = highest priority)
    if (roundBetsChron.length > 0) {
      const lines = roundBetsChron.map((b) => {
        const optLabel = options.find(o => o.key === b.option)?.label || b.option;
        const name = b.nickname || b.username;
        const isWinner = b.option === parsed.data.winnerOption;
        const ratio = winnerOpt?.ratio;
        let suffix: string;
        if (!isWinner) {
          suffix = " ✗";
        } else {
          const actualPayout = betPayouts.get(b.id);
          if (actualPayout != null && actualPayout === 0) {
            // Winner but banker ran out of funds
            suffix = " ✓ 庄家不足";
          } else if (useFixedOdds && ratio) {
            suffix = ` ✓ × ${ratio}赔`;
          } else {
            suffix = " ✓ 赢";
          }
        }
        return `${name}  ${optLabel}  ${b.amount.toLocaleString()}${suffix}`;
      });
      const pumpParts = [];
      if (pumpRate > 0) pumpParts.push(`上庄抽水 ${pumpRate}%`);
      if (playerPumpRate > 0) pumpParts.push(`下庄抽水 ${playerPumpRate}%`);
      const pump = pumpParts.length > 0
        ? `\n${pumpParts.join("  ")}  总派彩 ${totalPayout.toLocaleString()}`
        : `\n总派彩 ${totalPayout.toLocaleString()}`;
      const summaryContent = `【本轮点餐统计】\n` + lines.join("\n") + pump + bankerReturnMsg;
      const summaryMsg = await storage.createMessage({
        roomId: req.params.id,
        content: summaryContent,
        type: "system",
      });
      broadcast(req.params.id, { type: "MESSAGE", message: summaryMsg });
    }

    broadcast(req.params.id, { type: "BET_ROUND_CLOSED", round: closed, winnerOption: parsed.data.winnerOption, message: msg });
    res.json(closed);
  });

  // Pause / Resume round
  app.post("/api/rooms/:id/bet-round/pause", requireAdmin, async (req, res) => {
    const round = await storage.getActiveBetRound(req.params.id);
    if (!round) return res.status(404).json({ error: "No active round" });
    if (round.status === "paused") return res.status(400).json({ error: "Round already paused" });
    const updated = await storage.pauseBetRound(round.id);
    broadcast(req.params.id, { type: "BET_ROUND_PAUSED", round: updated });
    res.json(updated);
  });

  app.post("/api/rooms/:id/bet-round/resume", requireAdmin, async (req, res) => {
    const round = await storage.getActiveBetRound(req.params.id);
    if (!round) return res.status(404).json({ error: "No active round" });
    if (round.status !== "paused") return res.status(400).json({ error: "Round not paused" });
    const updated = await storage.resumeBetRound(round.id);
    broadcast(req.params.id, { type: "BET_ROUND_RESUMED", round: updated });
    res.json(updated);
  });

  // BETS
  app.post("/api/rooms/:id/bets", requireAuth, async (req, res) => {
    const round = await storage.getActiveBetRound(req.params.id);
    if (!round) return res.status(400).json({ error: "当前没有开放的投注" });
    if (round.status === "paused") return res.status(400).json({ error: "点餐已暂停，请等待恢复" });

    const schema = z.object({ option: z.string(), amount: z.number().int().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    // Banker's option is blocked for other players
    if (round.bankerOption && round.bankerOption === parsed.data.option && req.session.userId !== round.bankerUserId) {
      return res.status(400).json({ error: "该选项为庄家属性，闲家不可下注" });
    }

    // Check total bet cap (bankerMaxBet)
    if (round.bankerMaxBet) {
      const totalBets = await storage.getTotalBetsForRound(round.id);
      if (totalBets + parsed.data.amount > round.bankerMaxBet) {
        const remaining = round.bankerMaxBet - totalBets;
        return res.status(400).json({ error: `本轮总下注已达上限，最多还可下注 ${remaining.toLocaleString()} 积分` });
      }
    }

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
      nickname: user.nickname || null,
      option: parsed.data.option,
      amount: parsed.data.amount,
    });

    const optLabel = (round.options as Array<{ key: string; label: string }>).find(o => o.key === parsed.data.option)?.label || parsed.data.option;
    const displayName = user.nickname || user.username;
    const betMsg = await storage.createMessage({
      roomId: req.params.id,
      userId: user.id,
      username: displayName,
      content: `${displayName}:${optLabel}${parsed.data.amount.toLocaleString()}`,
      type: "bet",
    });
    broadcast(req.params.id, { type: "MESSAGE", message: betMsg });
    broadcast(req.params.id, { type: "NEW_BET", bet });
    res.json(bet);
  });

  app.get("/api/rooms/:id/bets", requireAuth, async (req, res) => {
    const betsForRoom = await storage.getBetsForRoom(req.params.id);
    res.json(betsForRoom);
  });

  app.delete("/api/rooms/:id/bets", requireAuth, async (req, res) => {
    const round = await storage.getActiveBetRound(req.params.id);
    if (!round || round.status !== "open") {
      return res.status(400).json({ error: "当前没有进行中的点餐，无法取消" });
    }
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const refund = await storage.cancelUserBetsInRound(user.id, round.id);
    if (refund === 0) return res.status(400).json({ error: "您没有可取消的点餐" });

    await storage.updateUserBalance(user.id, user.balance + refund);

    const updatedBets = await storage.getBetsForRound(round.id);
    broadcast(req.params.id, { type: "BETS_UPDATED", bets: updatedBets });

    const deletedIds = await storage.deleteBetMessages(user.id, req.params.id);
    for (const msgId of deletedIds) {
      broadcast(req.params.id, { type: "MESSAGE_DELETED", messageId: msgId });
    }

    res.json({ refund });
  });

  // Online users in a room (based on WebSocket connections)
  app.get("/api/rooms/:id/online-users", requireAdmin, async (req, res) => {
    const ACTIVE_WINDOW = 45 * 1000;
    const now = Date.now();
    const online = wsClients.filter(c =>
      c.roomId === req.params.id &&
      c.ws.readyState === 1 &&
      (now - c.lastActivity) < ACTIVE_WINDOW
    );
    const uniqueIds = [...new Set(online.map(c => c.userId))];
    const users = await Promise.all(uniqueIds.map(id => storage.getUser(id)));
    const result = users
      .filter((u): u is NonNullable<typeof u> => !!u && !u.isShill && !u.banned)
      .map(u => ({ id: u.id, username: u.username, nickname: u.nickname, balance: u.balance }));
    res.json(result);
  });

  // ADMIN
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    const allUsers = await storage.getAllUsers();
    res.json(allUsers.map((u) => ({ id: u.id, username: u.username, nickname: u.nickname, balance: u.balance, role: u.role, notes: u.notes || "", banned: u.banned, muted: u.muted, isShill: u.isShill })));
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

  app.patch("/api/admin/users/:id/nickname", requireAdmin, async (req, res) => {
    const schema = z.object({ nickname: z.string().max(20) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

    if (parsed.data.nickname) {
      const existing = await storage.getUserByNickname(parsed.data.nickname);
      if (existing && existing.id !== req.params.id) return res.status(400).json({ error: "昵称已被使用" });
    }

    const user = await storage.updateUserNickname(req.params.id, parsed.data.nickname);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ id: user.id, username: user.username, nickname: user.nickname });
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

  app.patch("/api/admin/users/:id/mute", requireAdmin, async (req, res) => {
    const schema = z.object({ muted: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

    const target = await storage.getUser(req.params.id);
    if (!target) return res.status(404).json({ error: "User not found" });
    if (target.role === "admin") return res.status(400).json({ error: "不能禁言管理员账号" });

    const user = await storage.muteUser(req.params.id, parsed.data.muted);
    res.json({ id: user!.id, username: user!.username, muted: user!.muted });
  });

  app.patch("/api/admin/users/:id/role", requireAdmin, async (req, res) => {
    const schema = z.object({ role: z.enum(["admin", "user"]) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

    const target = await storage.getUser(req.params.id);
    if (!target) return res.status(404).json({ error: "User not found" });
    if (target.id === req.session.userId) return res.status(400).json({ error: "不能修改自己的权限" });

    const user = await storage.setUserRole(req.params.id, parsed.data.role);
    res.json({ id: user!.id, username: user!.username, role: user!.role });
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

  // PRIVATE MESSAGES
  app.get("/api/private-messages", requireAuth, async (req, res) => {
    const msgs = await storage.getPrivateMessagesForUser(req.session.userId!);
    await storage.markReadByUser(req.session.userId!);
    res.json(msgs);
  });

  app.post("/api/private-messages", requireAuth, async (req, res) => {
    const schema = z.object({ content: z.string().min(1).max(1000) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "消息内容无效" });

    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const pm = await storage.createPrivateMessage({
      userId: user.id,
      userUsername: user.username,
      userNickname: user.nickname ?? null,
      content: parsed.data.content,
      isFromAdmin: false,
    });
    broadcastToAdmins({ type: "NEW_PRIVATE_MESSAGE", pm });
    res.json(pm);
  });

  app.get("/api/admin/private-messages", requireAdmin, async (req, res) => {
    const threads = await storage.getAllPrivateMessageThreads();
    res.json(threads);
  });

  app.delete("/api/admin/private-messages/:userId", requireAdmin, async (req, res) => {
    await storage.deletePrivateThread(req.params.userId);
    res.json({ ok: true });
  });

  app.get("/api/admin/export/excel", requireAdmin, async (req, res) => {
    const rounds = await storage.getAllBetRoundsWithBets();

    // Sheet 1: Round summary
    const summaryRows = rounds.map(r => {
      const opts = (r.options as Array<{ key: string; label: string }>) || [];
      const totalPool = r.bets.reduce((s, b) => s + b.amount, 0);
      const winnerBets = r.winnerOption ? r.bets.filter(b => b.option === r.winnerOption) : [];
      const winnerPool = winnerBets.reduce((s, b) => s + b.amount, 0);
      const platformFee = r.winnerOption && winnerPool > 0 ? Math.floor(totalPool * 0.1) : 0;
      const winnerLabel = r.winnerOption ? (opts.find(o => o.key === r.winnerOption)?.label || r.winnerOption) : "未开奖";
      return {
        "房间": r.roomName,
        "轮次ID": r.id,
        "开始时间": r.createdAt ? new Date(r.createdAt).toLocaleString("zh-CN") : "",
        "结束时间": r.closedAt ? new Date(r.closedAt).toLocaleString("zh-CN") : "",
        "状态": r.status === "open" ? "进行中" : "已结束",
        "庄家": r.bankerNickname || "",
        "庄家属性": r.bankerOption ? (opts.find(o => o.key === r.bankerOption)?.label || r.bankerOption) : "",
        "庄家上限": r.bankerMaxBet || "",
        "获胜属性": winnerLabel,
        "总下注池": totalPool,
        "平台抽成(10%)": platformFee,
        "参与人数": new Set(r.bets.map(b => b.userId)).size,
        "下注笔数": r.bets.length,
      };
    });

    // Sheet 2: Bet details
    const betRows = rounds.flatMap(r => {
      const opts = (r.options as Array<{ key: string; label: string }>) || [];
      const totalPool = r.bets.reduce((s, b) => s + b.amount, 0);
      const winnerPool = r.winnerOption ? r.bets.filter(b => b.option === r.winnerOption).reduce((s, b) => s + b.amount, 0) : 0;
      return r.bets.map(b => {
        const isWinner = b.option === r.winnerOption;
        const payout = isWinner && winnerPool > 0 ? Math.floor((b.amount / winnerPool) * totalPool * 0.9) : 0;
        const profit = isWinner ? payout - b.amount : -b.amount;
        const optLabel = opts.find(o => o.key === b.option)?.label || b.option;
        return {
          "房间": r.roomName,
          "轮次ID": r.id,
          "时间": b.createdAt ? new Date(b.createdAt).toLocaleString("zh-CN") : "",
          "用户昵称": b.nickname || b.username,
          "账号": b.username,
          "下注属性": optLabel,
          "下注金额": b.amount,
          "是否获胜": isWinner ? "✓" : "",
          "返还积分": payout,
          "盈亏": profit,
          "庄家": r.bankerNickname || "",
        };
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "轮次汇总");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(betRows), "下注明细");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", `attachment; filename="report_${Date.now()}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  });

  app.get("/api/admin/private-messages/:userId", requireAdmin, async (req, res) => {
    const msgs = await storage.getPrivateMessagesForAdmin(req.params.userId);
    await storage.markReadByAdmin(req.params.userId);
    res.json(msgs);
  });

  app.post("/api/admin/private-messages/:userId/reply", requireAdmin, async (req, res) => {
    const schema = z.object({ content: z.string().min(1).max(1000) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "消息内容无效" });

    const targetUser = await storage.getUser(req.params.userId);
    if (!targetUser) return res.status(404).json({ error: "用户不存在" });

    const pm = await storage.createPrivateMessage({
      userId: targetUser.id,
      userUsername: targetUser.username,
      userNickname: targetUser.nickname ?? null,
      adminId: req.session.userId!,
      adminUsername: req.session.username!,
      content: parsed.data.content,
      isFromAdmin: true,
    });
    broadcastToUser(targetUser.id, { type: "NEW_PRIVATE_MESSAGE", pm });
    res.json(pm);
  });

  // One-time data migration: sync dev data to production
  app.post("/api/admin/migrate-data", requireAdmin, async (req, res) => {
    try {
      const { Pool } = await import("pg");
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });

      // 1. Remove old seed rooms first (before removing their creator users)
      await pool.query(`DELETE FROM rooms WHERE name IN ('百家乐大厅','竞技预测厅','幸运色子间','梦幻房间')`);

      // 2. Remove old seed/conflicting users from production by username (different IDs)
      await pool.query(`
        DELETE FROM users WHERE username IN ('@DONG798','@aoe166','FlappyBird','QuirkyFawn','QuirkyPrawn','qwe','DONG798','HydroGarnet','Pounce#9','Claw$Hawk','Hitatami','Angrybird')
          AND id NOT IN ('b3ed8fb0-3f88-4293-ad2f-03a4d0839961','f9325bf2-4ed3-4a9d-9165-aa798c0731bd','e988ef68-7365-4ad3-a364-93e15e781c83','c31b447b-011c-4d0b-87e9-0c02941947bf','9ed0fd5f-4508-47e3-9b58-98a7bbef7c97','33f7c433-e6af-46d8-9639-d768c218b9fe','782153ca-fab1-4f24-8cdb-09d59fbdbf29','02ab2ea3-9c63-48e6-b35e-de6914508eb9','a597b4a0-8147-4517-84bd-ba1a43fd8ff1','a3210b6e-6c62-4118-b0e6-f57f7ff659f0','bb62b18f-8abc-47d0-98b8-c5c738d38d01','8ffe147b-8700-4d1d-b327-f5fe8b9f3cca')
      `);
      // Also remove old seed admin accounts with old string IDs (admin/player1/player2)
      await pool.query(`DELETE FROM users WHERE id IN ('@aoe166', 'DONG798', '8550b3b4-cd6e-445e-a0bf-71795d85549e')`);

      // 3. Upsert users (preserves any new production registrations too)
      await pool.query(`
        INSERT INTO users (id, username, password, balance, role, created_at, notes, banned, registration_ip, is_shill, nickname, totp_secret, totp_enabled, muted) VALUES
          ('b3ed8fb0-3f88-4293-ad2f-03a4d0839961','@DONG798','Thongsheng@02',9900437,'admin','2026-03-02 17:36:26.80687','管理员',false,NULL,false,'阿东（管理）',NULL,false,false),
          ('f9325bf2-4ed3-4a9d-9165-aa798c0731bd','@aoe166','aoe16666',9999999,'admin','2026-03-02 18:55:50.516149','老总',false,NULL,false,'66总',NULL,false,false),
          ('e988ef68-7365-4ad3-a364-93e15e781c83','FlappyBird','@NU-7L5n5t65',10245,'user','2026-03-02 17:36:26.811121','托',false,NULL,true,'蓝思嫒',NULL,false,false),
          ('c31b447b-011c-4d0b-87e9-0c02941947bf','QuirkyFawn','el-G4V17''_#c',11080,'user','2026-03-02 17:36:26.814028','托',false,NULL,true,'战囡',NULL,false,false),
          ('9ed0fd5f-4508-47e3-9b58-98a7bbef7c97','QuirkyPrawn','i1u[K14''K[Jx',12165,'user','2026-03-02 17:39:46.842436','托',false,NULL,true,'酒初南',NULL,false,false),
          ('33f7c433-e6af-46d8-9639-d768c218b9fe','qwe','123123',999734,'user','2026-03-02 18:04:11.037404',NULL,false,NULL,false,'骚鸡',NULL,false,false),
          ('782153ca-fab1-4f24-8cdb-09d59fbdbf29','DONG798','Aaaa1111',9944,'admin','2026-03-02 18:43:34.634933',NULL,false,'60.54.15.13',false,'小东','O5VXITD5JZQX2ZTUO5JSCVKWH5XXI3SE',true,false),
          ('02ab2ea3-9c63-48e6-b35e-de6914508eb9','HydroGarnet','MRV>4Ilu2&8n',12313,'user','2026-03-02 18:44:21.359458',NULL,false,'34.67.233.138',true,'零如冬',NULL,false,false),
          ('a597b4a0-8147-4517-84bd-ba1a43fd8ff1','Pounce#9','el-G4V17''_#c',20676,'user','2026-03-02 20:40:26.027012','托',false,NULL,true,'星星','KFNVEOLRI5OTKYKAIRWWI533IVBGCQSL',true,false),
          ('a3210b6e-6c62-4118-b0e6-f57f7ff659f0','Claw$Hawk','el-G4V17''_#c',15000,'user','2026-03-02 20:40:26.031487','托',false,NULL,true,'月亮',NULL,false,false),
          ('bb62b18f-8abc-47d0-98b8-c5c738d38d01','Hitatami','el-G4V17''_#c',2000,'user','2026-03-02 22:07:27.971925',NULL,false,NULL,false,'地球',NULL,false,false),
          ('8ffe147b-8700-4d1d-b327-f5fe8b9f3cca','Angrybird','el-G4V17''_#c',1500,'user','2026-03-02 22:07:27.976226',NULL,false,NULL,false,'太阳',NULL,false,false)
        ON CONFLICT (id) DO UPDATE SET
          username=EXCLUDED.username, password=EXCLUDED.password, balance=EXCLUDED.balance,
          role=EXCLUDED.role, notes=EXCLUDED.notes, banned=EXCLUDED.banned,
          is_shill=EXCLUDED.is_shill, nickname=EXCLUDED.nickname,
          totp_secret=EXCLUDED.totp_secret, totp_enabled=EXCLUDED.totp_enabled, muted=EXCLUDED.muted
      `);

      // 4. Insert new rooms (old ones already deleted above)
      await pool.query(`
        INSERT INTO rooms (id, name, description, created_by, is_active, created_at, game_url, password, chat_muted) VALUES
          ('ba0aebef-2c75-44cf-95c0-121e3a09904d','初梦','刚刚踏入梦幻世界，带着一点点光与想象。','b3ed8fb0-3f88-4293-ad2f-03a4d0839961',true,'2026-03-02 18:42:15.128034','','',false),
          ('c6d5a549-e0ce-4c5a-b22d-1dbc86840c2f','幻彩','开始绽放色彩，舞台光效初现，氛围感增强。','b3ed8fb0-3f88-4293-ad2f-03a4d0839961',true,'2026-03-02 18:48:12.581803','','',false),
          ('93a9721e-ef5e-4afc-bdcb-3d42ed815047','星耀','如繁星闪耀，具有吸引目光的亮点与表现力。','b3ed8fb0-3f88-4293-ad2f-03a4d0839961',true,'2026-03-02 18:48:21.833709','','',false),
          ('e110f158-d093-4d80-a24e-bd8691d6b191','璀璨','光芒明显增强，华丽感与视觉冲击力提升。','b3ed8fb0-3f88-4293-ad2f-03a4d0839961',true,'2026-03-02 18:48:32.528245','','',false),
          ('afcf964c-b0f1-4aeb-a0fe-7acb1d2195b2','辉煌','气势宏大，舞台效果震撼，达到高级水准。','b3ed8fb0-3f88-4293-ad2f-03a4d0839961',true,'2026-03-02 18:48:39.864804','','',false),
          ('924f3fd4-fbc9-479b-87eb-0303ee053242','梦境','极致梦幻，宛如神级舞台，震撼全场的最高等级。','b3ed8fb0-3f88-4293-ad2f-03a4d0839961',true,'2026-03-02 18:48:49.181175','','',false)
        ON CONFLICT (id) DO NOTHING
      `);

      // Sync bot settings
      await pool.query(`
        INSERT INTO bot_settings (id, enabled, min_amount, max_amount) VALUES ('default', true, 100, 500)
        ON CONFLICT (id) DO UPDATE SET enabled=EXCLUDED.enabled, min_amount=EXCLUDED.min_amount, max_amount=EXCLUDED.max_amount
      `);

      await pool.end();
      res.json({ ok: true, message: "数据迁移成功" });
    } catch (e: any) {
      console.error("Migration error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // Heartbeat: ping every 15s, terminate dead connections
  const heartbeat = setInterval(() => {
    wsClients.forEach((c) => {
      if (!c.isAlive) {
        c.ws.terminate();
        return;
      }
      c.isAlive = false;
      c.ws.ping();
    });
  }, 15000);

  wss.on("close", () => clearInterval(heartbeat));

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "", `http://localhost`);
    const roomId = url.searchParams.get("roomId") || "";
    const userId = url.searchParams.get("userId") || "";
    const username = url.searchParams.get("username") || "";

    const client: WsClient = { ws, userId, username, roomId, isAlive: true, lastActivity: Date.now() };
    wsClients.push(client);

    ws.on("pong", () => { client.isAlive = true; client.lastActivity = Date.now(); });

    ws.on("error", () => {
      const idx = wsClients.indexOf(client);
      if (idx !== -1) wsClients.splice(idx, 1);
    });

    ws.on("close", () => {
      const idx = wsClients.indexOf(client);
      if (idx !== -1) wsClients.splice(idx, 1);
    });
  });

  return httpServer;
}
