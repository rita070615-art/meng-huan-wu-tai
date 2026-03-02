import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import session from "express-session";
import { storage } from "./storage";
import { z } from "zod";
import speakeasy from "speakeasy";
import QRCode from "qrcode";

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
  if (content.length > 300) return "消息过长，请限制在300字以内";
  if (/https?:\/\/|www\./i.test(content)) return "不允许发送链接";
  if (/(.)\1{5,}/.test(content)) return "请勿发送大量重复字符";
  const banned = ["微信", "QQ群", "加群", "代理", "兼职", "广告", "优惠", "刷单"];
  if (banned.some(k => content.includes(k))) return "消息含有违禁内容，请勿发送广告";
  // Rate limit: max 4 messages per 8 seconds
  const now = Date.now();
  const timestamps = (userMsgTimestamps.get(userId) || []).filter(t => now - t < 8000);
  if (timestamps.length >= 4) return "发送太快，请稍后再试";
  timestamps.push(now);
  userMsgTimestamps.set(userId, timestamps);
  return null;
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
    if (req.session.role !== "admin" && !req.session.totpVerified) {
      return res.status(403).json({ error: "TOTP_REQUIRED" });
    }
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

    const clientIp = getClientIp(req);
    if (clientIp) {
      const ipUser = await storage.getUserByIp(clientIp);
      if (ipUser) return res.status(400).json({ error: "该网络已注册过账号，每个IP只能注册一个账号" });
    }

    const user = await storage.createUser({ ...parsed.data, registrationIp: clientIp });
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

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.nickname = user.nickname || user.username;
    req.session.role = user.role;
    req.session.totpVerified = user.role === "admin" ? true : false;
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
    const schema = z.object({ content: z.string().min(1).max(500) });
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
      { key: "B", label: "体力", color: "#06b6d4" },
      { key: "C", label: "法力", color: "#a855f7" },
      { key: "D", label: "耐力", color: "#3b82f6" },
    ];

    const options = req.body.options || defaultOptions;
    const round = await storage.createBetRound({ roomId: req.params.id, options });

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

              const amount = Math.floor(Math.random() * (botCfg.maxAmount - botCfg.minAmount + 1)) + botCfg.minAmount;
              if (shillBalance < amount) {
                const warnMsg = await storage.createMessage({
                  roomId,
                  content: `⚠️ @${shillUsername} 积分不足（${shillBalance}），此条无效`,
                  type: "system",
                });
                broadcast(roomId, { type: "MESSAGE", message: warnMsg });
                return;
              }
              const randomOption = optionsList[Math.floor(Math.random() * optionsList.length)].key;
              const shillUser = await storage.getUser(shillId);
              const bet = await storage.placeBet({
                roundId,
                roomId,
                userId: shillId,
                username: shillUsername,
                nickname: shillUser?.nickname || null,
                option: randomOption,
                amount,
              });
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
      content: `本轮厨房已完成出餐。\n今日人气口味：${winnerOpt?.label || parsed.data.winnerOption}\n感谢参与点餐体验。`,
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
      nickname: user.nickname || null,
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
    await storage.createMessage({ roomId: room1.id, content: "请理性点餐，享受用餐乐趣。", type: "system" });
    await storage.createMessage({ roomId: room2.id, content: "欢迎来到竞技预测厅！", type: "system" });
    await storage.createMessage({ roomId: room3.id, content: "欢迎来到幸运色子间！", type: "system" });
  } catch (e) {
    console.error("Seed error:", e);
  }
}
