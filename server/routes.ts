import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import session from "express-session";
import { storage } from "./storage";
import { z } from "zod";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import * as XLSX from "xlsx";
import multer from "multer";
import path from "path";
import fs from "fs";
import express from "express";

function formatWebhookContent(payload: Record<string, unknown>): string {
  const type = payload.type as string;
  const ts = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Kuala_Lumpur" });
  const fmt = (n: number) => n.toLocaleString("en-US");
  if (type === "上庄抽水") {
    const newPortion = (payload.bankerMaxBet as number) - (payload.carryOver as number);
    const pumpAmt = payload.pumpAmount as number;
    return [
      `🎰 **上庄抽水**`,
      `时间：${ts}`,
      `庄家：${payload.player}`,
      `本局标庄：${fmt(newPortion)}`,
      `上庄抽水率：${payload.pumpRate}%`,
      `平台盈利：**RMB ${fmt(pumpAmt)}**`,
    ].join("\n");
  }
  if (type === "续庄抽水") {
    const newPortion = (payload.bankerMaxBet as number) - (payload.carryOver as number);
    const pumpAmt = payload.pumpAmount as number;
    return [
      `🎰 **续庄抽水**`,
      `时间：${ts}`,
      `庄家：${payload.player}`,
      `追加资金：${fmt(newPortion)}`,
      `上庄抽水率：${payload.pumpRate}%`,
      `平台盈利：**RMB ${fmt(pumpAmt)}**`,
    ].join("\n");
  }
  if (type === "下庄抽水") {
    const grossProfit = payload.grossProfit as number;
    const exitPumpRate = payload.exitPumpRate as number;
    const exitPumpAmount = payload.exitPumpAmount as number;
    return [
      `💰 **下庄抽水**`,
      `时间：${ts}`,
      `庄家：${payload.player}`,
      `庄家总盈利：${fmt(grossProfit)}`,
      `下庄抽水率：${exitPumpRate}%`,
      `平台盈利：**RMB ${fmt(exitPumpAmount)}**`,
    ].join("\n");
  }
  if (type === "充值") {
    return [
      `✅ **充值** \`${ts}\``,
      `操作人：${payload.admin}`,
      `玩家：${payload.player}`,
      `金额：+${payload.amount}　（${payload.balanceBefore} → ${payload.balanceAfter}）`,
    ].join("\n");
  }
  if (type === "提现") {
    return [
      `🔴 **提现** \`${ts}\``,
      `操作人：${payload.admin}`,
      `玩家：${payload.player}`,
      `金额：-${payload.amount}　（${payload.balanceBefore} → ${payload.balanceAfter}）`,
    ].join("\n");
  }
  return `**${type}** \`${ts}\`\n${JSON.stringify(payload, null, 2)}`;
}

async function fireWebhooks(urls: (string | null | undefined)[], payload: Record<string, unknown>): Promise<void> {
  const content = formatWebhookContent(payload);
  for (const url of urls) {
    if (!url || !url.startsWith("http")) continue;
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (_) {}
  }
}

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
  role: string;
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

function broadcastToRoomAdmins(roomId: string, data: object) {
  const msg = JSON.stringify(data);
  wsClients.forEach((c) => {
    if (c.roomId === roomId && c.role === "admin" && c.ws.readyState === WebSocket.OPEN) {
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

  const requireSession = (req: Request, res: Response, next: Function) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
    next();
  };

  const requireAuth = (req: Request, res: Response, next: Function) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.session.totpVerified) return res.status(403).json({ error: "TOTP_REQUIRED" });
    next();
  };

  // Serve uploaded media files statically
  const uploadsDir = path.resolve(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  app.use("/uploads", express.static(uploadsDir));

  // Multer setup — disk storage, no size limit
  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadsDir),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
      },
    }),
  });

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
    req.session.totpVerified = true;
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: "注册失败，请重试" });
      res.json({ id: user.id, username: user.username, nickname: user.nickname, balance: user.balance, role: user.role, totpEnabled: false, totpVerified: true });
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

  // Forgot password via TOTP
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
    const isValid = speakeasy.totp.verify({ secret: user.totpSecret, encoding: "base32", token: parsed.data.totpCode, window: 1 });
    if (!isValid) return res.status(400).json({ error: "验证码错误，请重试" });
    await storage.updateUserPassword(user.id, parsed.data.newPassword);
    res.json({ ok: true });
  });

  // TOTP setup — get QR code + secret
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

  // TOTP enable — verify code and save secret
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

  // TOTP verify — called after login when TOTP is enabled
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
    const schema = z.object({ newPassword: z.string().min(4) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(404).json({ error: "用户不存在" });

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
    const sender = await storage.getUser(req.session.userId!);
    const maxLen = sender?.role === "admin" ? 5000 : 30;
    const schema = z.object({ content: z.string().min(1).max(maxLen) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
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

  // MEDIA UPLOAD — admin only, images and videos, no size limit
  app.post("/api/rooms/:id/upload-media", requireAdmin, upload.single("file"), async (req: any, res) => {
    if (!req.file) return res.status(400).json({ error: "未收到文件" });
    const mime = req.file.mimetype || "";
    const isImage = mime.startsWith("image/");
    const isVideo = mime.startsWith("video/");
    if (!isImage && !isVideo) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "只支持图片或视频文件" });
    }
    const mediaType = isImage ? "image" : "video";
    const mediaUrl = `/uploads/${req.file.filename}`;
    const sender = await storage.getUser(req.session.userId!);
    const msg = await storage.createMessage({
      roomId: req.params.id,
      userId: req.session.userId,
      username: sender?.nickname || sender?.username || "管理员",
      content: mediaUrl,
      type: mediaType,
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

    // New order: 体力, 法力, 力量, 耐力
    const defaultOptions = [
      { key: "B", label: "体力", color: "#22c55e" },
      { key: "C", label: "法力", color: "#a855f7" },
      { key: "A", label: "力量", color: "#ef4444" },
      { key: "D", label: "耐力", color: "#3b82f6" },
    ];

    const options = req.body.options || defaultOptions;
    const { bankerUserId, bankerNickname, bankerOption, bankerMaxBet } = req.body;

    // Banker + banker attribute are required
    if (!bankerUserId || !bankerMaxBet || !bankerOption) {
      return res.status(400).json({ error: "必须选择主厨、主厨属性并设置上限才能开启点餐" });
    }

    const carryOver = req.body.carryOver != null ? Math.max(0, Number(req.body.carryOver)) : 0;
    const newAmount = Math.max(0, Number(bankerMaxBet) - carryOver);

    // Validate banker has enough NEW balance (carryOver is already in their account)
    const banker = await storage.getUser(bankerUserId);
    if (!banker || banker.balance < newAmount) {
      const name = banker?.nickname || banker?.username || "该用户";
      return res.status(400).json({ error: `${name}积分不足（当前：${(banker?.balance || 0).toLocaleString()}，需要新追加：${newAmount.toLocaleString()}）` });
    }

    const pumpRate = req.body.pumpRate != null ? Math.max(0, Math.min(50, Number(req.body.pumpRate))) : 0;
    const playerPumpRate = req.body.playerPumpRate != null ? Math.max(0, Math.min(50, Number(req.body.playerPumpRate))) : 0;
    const exitPumpRate = req.body.exitPumpRate != null ? Math.max(0, Math.min(50, Number(req.body.exitPumpRate))) : 0;
    const round = await storage.createBetRound({
      roomId: req.params.id,
      options,
      bankerUserId: bankerUserId || undefined,
      bankerNickname: bankerNickname || undefined,
      bankerOption: bankerOption || undefined,
      bankerMaxBet: bankerMaxBet ? Number(bankerMaxBet) : undefined,
      pumpRate,
      playerPumpRate,
      exitPumpRate,
      carryOver,
    });

    // Deduct only the NEW portion (not carryOver) from banker's balance
    if (newAmount > 0) {
      await storage.updateUserBalance(bankerUserId, banker.balance - newAmount);
    }

    // Fire webhook: 上庄抽水 or 续庄抽水 → URL1
    const pumpDeductedStart = Math.floor(newAmount * pumpRate / 100);
    if (pumpDeductedStart > 0 || exitPumpRate > 0) {
      const wsCfg = await storage.getBotSettings();
      const whUrls = [(wsCfg as any).webhookUrl1];
      const playerName = bankerNickname || banker.nickname || banker.username;
      // 续庄 (has carry-over) → 续庄抽水; first-time banker → 上庄抽水
      const webhookType = carryOver > 0 ? "续庄抽水" : "上庄抽水";
      fireWebhooks(whUrls, {
        type: webhookType,
        player: playerName,
        bankerOption: bankerOption,
        bankerMaxBet: Number(bankerMaxBet),
        carryOver,
        pumpRate,
        pumpAmount: pumpDeductedStart,
        exitPumpRate,
      }).catch(() => {});
    }

    // Build start-round system message with banker info
    const optLabelMap: Record<string, string> = { A: "力量", B: "体力", C: "法力", D: "耐力" };
    const bankerNickStr = bankerNickname || banker.nickname || banker.username;
    const bankerOptLabel = optLabelMap[bankerOption] || bankerOption;
    // Options players can choose = everything except the banker's option
    const playableOpts = (options as Array<{ key: string; label?: string }>)
      .filter(o => o.key !== bankerOption)
      .map(o => o.label || optLabelMap[o.key] || o.key)
      .join(" · ");
    // Effective fund = after deducting 上庄抽水 from new portion only
    const effectiveFundDisplay = (Math.floor(newAmount * (1 - pumpRate / 100)) + carryOver).toLocaleString();
    const startContent = [
      `👨‍🍳 当前厨师：${bankerNickStr}（${bankerOptLabel}）`,
      ``,
      `📋 本轮可点属性`,
      playableOpts,
      ``,
      `💰 本轮厨房预算：${effectiveFundDisplay}`,
    ].join("\n");
    const msg = await storage.createMessage({
      roomId: req.params.id,
      content: startContent,
      type: "system",
    });
    // Only clear pendingBanker if this is a brand-new banker (not a 续庄 by the same banker).
    // Preserving it during a 续庄 round ensures that if the round is cancelled, the
    // accumulated cumulativeGrossProfit from previous rounds is not lost — so exit pump
    // can still be correctly applied when the banker eventually steps down (下庄).
    {
      const existingRoom = await storage.getRoom(req.params.id);
      const prevPending = (existingRoom as any)?.pendingBanker;
      const isContinuingSameBanker = carryOver > 0 && prevPending?.userId === bankerUserId;
      if (!isContinuingSameBanker) {
        await storage.setPendingBanker(req.params.id, null);
      }
    }
    broadcast(req.params.id, { type: "BET_ROUND_STARTED", round, message: msg });

    // Auto-bet: trigger shill accounts with staggered random delays to mimic real users
    try {
      const botCfg = await storage.getBotSettings();
      if (botCfg.enabled) {
        const allShills = await storage.getShillUsers();
        // Filter: only shills assigned to this room OR with no room assignment
        const shills = allShills.filter(s => !(s as any).shillRoomId || (s as any).shillRoomId === req.params.id);
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
                broadcastToRoomAdmins(roomId, {
                  type: "BOT_LOW_BALANCE",
                  username: shillUsername,
                  balance: shillBalance,
                  required: amount,
                });
                return;
              }
              // Check effective cap before shill bet (pump only on new portion)
              if (activeRound.bankerMaxBet) {
                const sCarryOver = (activeRound as any).carryOver ?? 0;
                const sNew = Math.max(0, (activeRound.bankerMaxBet as number) - sCarryOver);
                const sPump = (activeRound as any).pumpRate ?? 0;
                const sEffCap = Math.floor(sNew * (1 - sPump / 100)) + sCarryOver;
                const currentTotal = await storage.getTotalBetsForRound(roundId);
                if (currentTotal >= sEffCap) return; // Already full
                if (amount > sEffCap - currentTotal) return; // Would exceed cap
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

              // Auto-pause when shill bet fills the effective cap
              if (activeRound.bankerMaxBet) {
                const sCarryOver2 = (activeRound as any).carryOver ?? 0;
                const sNew2 = Math.max(0, (activeRound.bankerMaxBet as number) - sCarryOver2);
                const sPump2 = (activeRound as any).pumpRate ?? 0;
                const sEffCap2 = Math.floor(sNew2 * (1 - sPump2 / 100)) + sCarryOver2;
                const newTotal = await storage.getTotalBetsForRound(roundId);
                if (newTotal >= sEffCap2) {
                  const stillActive = await storage.getActiveBetRound(roomId);
                  if (stillActive && stillActive.id === roundId && stillActive.status === "open") {
                    const paused = await storage.pauseBetRound(roundId);
                    const capMsg = await storage.createMessage({
                      roomId,
                      content: `📢 点餐订单已满（${sEffCap2.toLocaleString()} 积分）。等待厨房出餐。`,
                      type: "system",
                    });
                    broadcast(roomId, { type: "BET_ROUND_PAUSED", round: paused, reason: "cap_reached" });
                    broadcast(roomId, { type: "MESSAGE", message: capMsg });
                  }
                }
              }
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

    const schema = z.object({
      winnerOption: z.string().optional(),
      optionPoints: z.record(z.string(), z.number()).optional(),
      double: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request" });

    const doubleMultiplier = parsed.data.double ? 2 : 1;

    const options = round.options as Array<{ key: string; label: string; color: string; ratio?: number }>;

    // Determine winnerOptionKey for DB storage:
    // With banker-vs-player scoring, the banker's option is the reference point.
    // winnerOptionKey stores whichever option had the highest score (for history display).
    const optionPoints = parsed.data.optionPoints;
    let winnerOptionKey: string;
    if (optionPoints && Object.keys(optionPoints).length > 0) {
      // Use the highest-scoring option for record display; payouts are per-bet vs banker's score
      const sorted = options
        .filter(o => optionPoints[o.key] != null)
        .sort((a, b) => (optionPoints[b.key] ?? 0) - (optionPoints[a.key] ?? 0));
      winnerOptionKey = sorted.length > 0 ? sorted[0].key : (round.bankerOption || options[0]?.key || "A");
    } else if (parsed.data.winnerOption) {
      winnerOptionKey = parsed.data.winnerOption;
    } else if (round.bankerOption) {
      winnerOptionKey = round.bankerOption;
    } else {
      return res.status(400).json({ error: "Must provide optionPoints or winnerOption" });
    }

    const closed = await storage.closeBetRound(round.id, winnerOptionKey);
    const roundBets = await storage.getBetsForRound(round.id);

    // roundBets comes desc(createdAt), reverse for chronological (oldest = highest priority)
    const roundBetsChron = [...roundBets].reverse();
    const pumpRate = (round as any).pumpRate ?? 0;           // 厨房服务费率
    const playerPumpRate = (round as any).playerPumpRate ?? 0; // 平台服务费率
    const hasbanker = !!(round.bankerUserId && round.bankerMaxBet);
    const carryOverAmt = (round as any).carryOver ?? 0;
    const newAmount = round.bankerMaxBet ? Math.max(0, (round.bankerMaxBet as number) - carryOverAmt) : 0;

    // Effective banker fund: pump only on the new (non-carryOver) portion
    const pumpDeducted = Math.floor(newAmount * pumpRate / 100);
    const effectiveBankerFund = hasbanker
      ? Math.floor(newAmount * (1 - pumpRate / 100)) + carryOverAmt
      : Infinity;

    // ——— New banker-vs-player scoring payout logic ———
    // Banker's option score is the reference. Each player option's score is compared against it.
    // Strict greater-than wins; tie or lower = player loses.
    // Win with 9 points → 3× payout (net 2×); other wins → 2× payout (net 1×).
    // doubleMultiplier (庄翻倍) multiplies the ratio.
    // Losing bets go to banker; banker returns remaining fund + losing bets.

    const bankerOptionKey = round.bankerOption || "";
    const bankerScore = optionPoints ? (optionPoints[bankerOptionKey] ?? null) : null;

    let totalPayout = 0;
    const betPayouts = new Map<string, number>();
    let totalNetWinsPaid = 0; // Sum of net-win amounts paid from banker's fund
    let totalLosingBets = 0;  // Sum of all losing bets (goes to banker)

    for (const bet of roundBetsChron) {
      if (bet.option === bankerOptionKey) {
        // Banker's own option bets shouldn't exist (blocked), but skip if present
        betPayouts.set(bet.id, 0);
        continue;
      }

      const playerScore = optionPoints ? (optionPoints[bet.option] ?? 0) : 0;
      const effectiveBankerScore = bankerScore ?? 0;
      const playerWins = playerScore > effectiveBankerScore; // Strict greater-than; tie = banker wins

      if (playerWins) {
        const baseRatio = playerScore === 9 ? 3 : 2;
        const effectiveRatio = baseRatio * doubleMultiplier;
        const gross = bet.amount * effectiveRatio; // Total player receives (including stake)
        const netWin = gross - bet.amount;          // Pure profit above stake (no player-side pump)
        // Cap by remaining available banker fund
        const availableFund = Math.max(0, effectiveBankerFund - totalNetWinsPaid);
        const actualNetWin = Math.min(netWin, availableFund);
        const payout = bet.amount + actualNetWin; // Player gets stake back + full net win

        betPayouts.set(bet.id, payout);
        totalPayout += payout;
        totalNetWinsPaid += actualNetWin;

        const user = await storage.getUser(bet.userId);
        if (user && payout > 0) {
          await storage.updateUserBalance(bet.userId, user.balance + payout);
        }
      } else {
        betPayouts.set(bet.id, 0);
        totalLosingBets += bet.amount;
      }
    }

    // Build timestamp in Malaysia time (UTC+8)
    const mytParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kuala_Lumpur",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(new Date());
    const get = (type: string) => mytParts.find(p => p.type === type)?.value ?? "00";
    const timeStr = `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;

    // Build points display: 体力 8 · 法力 5 · 力量 6 · 耐力 2 in B,C,A,D order
    const displayOrder = ["B","C","A","D"];
    const pointsDisplay = optionPoints && Object.keys(optionPoints).length > 0
      ? displayOrder.map(k => {
          const o = options.find(x => x.key === k);
          if (!o) return null;
          return `${o.label} ${optionPoints[k] ?? "?"}`;
        }).filter(Boolean).join(" · ")
      : options.map(o => o.label).join(" · ");

    // Banker info and return
    let bankerNameDisplay = "";
    let bankerOptionDisplay = "";
    let bankerReturn = 0;
    if (hasbanker && round.bankerUserId) {
      const banker = await storage.getUser(round.bankerUserId);
      bankerNameDisplay = round.bankerNickname || banker?.nickname || banker?.username || "未知";
      if (round.bankerOption) {
        const bankerOpt = options.find(o => o.key === round.bankerOption);
        bankerOptionDisplay = bankerOpt?.label || round.bankerOption;
      }
      if (banker) {
        // Banker gets back: remaining fund (after paying winners) + all losing bets
        const remainingFund = Math.max(0, effectiveBankerFund - totalNetWinsPaid);
        const grossBankerReturn = remainingFund + totalLosingBets;
        // Return full grossBankerReturn — exit pump is NOT deducted here.
        // It will be deducted when the admin explicitly clicks 下庄.
        bankerReturn = grossBankerReturn;
        if (bankerReturn > 0) {
          await storage.updateUserBalance(round.bankerUserId, banker.balance + bankerReturn);
        }
      }
    }

    // Per-player net P&L for summary
    // Group bets by userId, compute net win/loss and final balance
    const playerIds = [...new Set(roundBetsChron.map(b => b.userId))];
    const playerLines: string[] = [];
    for (const uid of playerIds) {
      const playerBets = roundBetsChron.filter(b => b.userId === uid);
      const totalStake = playerBets.reduce((s, b) => s + b.amount, 0);
      // payout includes stake returned; net = payout - stake (0 if lost)
      const totalReceived = playerBets.reduce((s, b) => s + (betPayouts.get(b.id) ?? 0), 0);
      const net = totalReceived - totalStake;
      const user = await storage.getUser(uid);
      const finalBalance = user?.balance ?? 0;
      const name = playerBets[0].nickname || playerBets[0].username;
      // Show each player's bet option + score vs banker score
      const betDetails = playerBets.map(b => {
        const opt = options.find(o => o.key === b.option);
        const pScore = optionPoints ? (optionPoints[b.option] ?? "?") : "?";
        const didWin = (betPayouts.get(b.id) ?? 0) > b.amount;
        const is9Win = didWin && pScore === 9;
        const tag = didWin ? (is9Win ? "九点胜" : "胜") : "负";
        return `${opt?.label || b.option}${pScore}(${tag})`;
      }).join(" ");
      const sign = net >= 0 ? "+" : "";
      playerLines.push(`${name} [${betDetails}]: ${sign}${net.toLocaleString()} 余: ${finalBalance.toLocaleString()}`);
    }

    // Retrieve existing history entries for this room
    const historyEntries = await storage.getBetHistory(req.params.id);

    // Banker score display (bankerScore already declared above)
    const bankerScoreStr = bankerScore != null ? `当前${bankerOptionDisplay} ${bankerScore} 点` : bankerOptionDisplay;

    // Banker P&L
    const bankerNet = hasbanker ? bankerReturn - (round.bankerMaxBet as number) : 0;

    // Compact history entry: digit per option in displayOrder, e.g. "5213@体力·法力·力量·耐力"
    const trendDisplayOrder = ["B","C","A","D"];
    const bankerScoreTag = bankerScore != null ? `${bankerOptionDisplay} ${bankerScore}` : bankerOptionDisplay;
    let historyEntry: string;
    if (optionPoints && Object.keys(optionPoints).length > 0) {
      const digits = trendDisplayOrder
        .map(k => {
          const o = options.find(x => x.key === k);
          if (!o) return null;
          const score = optionPoints[k];
          return score != null ? String(score) : null;
        })
        .filter((d): d is string => d !== null)
        .join("");
      const labels = trendDisplayOrder
        .map(k => options.find(x => x.key === k)?.label)
        .filter(Boolean)
        .join("·");
      historyEntry = `${digits}@${labels}`;
    } else {
      historyEntry = `${timeStr} · ${bankerScoreTag} · 点餐 ${roundBetsChron.length} 人 · 厨余 ${bankerReturn.toLocaleString()}`;
    }
    await storage.appendBetHistory(req.params.id, historyEntry);

    // Consolidated report message
    const reportLines: string[] = [];
    reportLines.push(`⏰ ${timeStr}`);
    reportLines.push("");
    reportLines.push("🧑‍🍳 本局出餐");
    reportLines.push(pointsDisplay);
    if (bankerNameDisplay) {
      reportLines.push(`👨‍🍳 厨师：${bankerNameDisplay}（${bankerScoreStr}）`);
      reportLines.push(`🍳 厨师剩余${bankerOptionDisplay}：${bankerReturn.toLocaleString()}`);
    }
    if (playerLines.length > 0) {
      reportLines.push("");
      reportLines.push("📉 本局餐费");
      reportLines.push(...playerLines);
    }
    if (hasbanker) {
      reportLines.push("");
      reportLines.push(`🏆 本餐厨师（${bankerNameDisplay}）本轮净收益：${bankerNet >= 0 ? "+" : ""}${bankerNet.toLocaleString()}`);
    }
    if (historyEntries.length > 0) {
      reportLines.push("");
      const compactEntries = historyEntries.filter(h => /^\d+@/.test(h));
      if (compactEntries.length > 0) {
        const lastCompact = compactEntries[compactEntries.length - 1];
        const labelPart = lastCompact.split("@")[1] || "";
        const abbrev = labelPart.split("·").map((l: string) => l.charAt(0)).join("");
        const trendDigits = compactEntries.slice(-20).map(h => h.split("@")[0]).join("  ");
        reportLines.push(`📜 历史走势（${abbrev}）`);
        reportLines.push(trendDigits);
      }
    }
    const reportContent = reportLines.join("\n");

    const summaryMsg = await storage.createMessage({
      roomId: req.params.id,
      content: reportContent,
      type: "system",
    });
    broadcast(req.params.id, { type: "MESSAGE", message: summaryMsg });

    // Lightweight close notification (used for BET_ROUND_CLOSED broadcast)
    const msg = await storage.createMessage({
      roomId: req.params.id,
      content: `本轮厨房已完成出餐。`,
      type: "system",
    });

    const exitPumpRateBcast = (round as any).exitPumpRate ?? 0;
    // Persist banker decision state so admin can navigate away and return without losing context.
    // Accumulate cumulativeGrossProfit across 续庄 rounds; exit pump is deducted only on 下庄.
    if (closed.bankerUserId && closed.bankerOption) {
      const existingRoom = await storage.getRoom(req.params.id);
      const prevPending = (existingRoom as any)?.pendingBanker;
      const prevCumulative = (prevPending?.userId === closed.bankerUserId && typeof prevPending?.cumulativeGrossProfit === "number")
        ? prevPending.cumulativeGrossProfit
        : 0;
      const thisRoundGrossProfit = bankerReturn - ((round.bankerMaxBet as number) ?? 0);
      const cumulativeGrossProfit = prevCumulative + thisRoundGrossProfit;
      await storage.setPendingBanker(req.params.id, {
        userId: closed.bankerUserId,
        nickname: (closed as any).bankerNickname || closed.bankerUserId,
        option: closed.bankerOption,
        bankerReturn,
        pumpRate,
        playerPumpRate,
        exitPumpRate: exitPumpRateBcast,
        cumulativeGrossProfit,
      });
    }
    broadcast(req.params.id, { type: "BET_ROUND_CLOSED", round: closed, winnerOption: winnerOptionKey, message: msg, bankerReturn, pumpRate, playerPumpRate, exitPumpRate: exitPumpRateBcast });

    res.json(closed);
  });

  // Admin explicitly dismisses the banker (下庄) — deducts exit pump based on accumulated profit
  app.delete("/api/rooms/:id/pending-banker", requireAdmin, async (req, res) => {
    const room = await storage.getRoom(req.params.id);
    const pb = (room as any)?.pendingBanker;
    if (pb?.userId && typeof pb.cumulativeGrossProfit === "number" && pb.cumulativeGrossProfit > 0) {
      const exitPumpRate: number = pb.exitPumpRate ?? 0;
      const exitPumpDeducted = exitPumpRate > 0 ? Math.floor(pb.cumulativeGrossProfit * exitPumpRate / 100) : 0;
      if (exitPumpDeducted > 0) {
        const banker = await storage.getUser(pb.userId);
        if (banker) {
          const deduction = Math.min(exitPumpDeducted, banker.balance);
          await storage.updateUserBalance(pb.userId, banker.balance - deduction);
          // Fire 下庄抽水 webhook
          storage.getBotSettings().then(cfg => {
            fireWebhooks([(cfg as any).webhookUrl1], {
              type: "下庄抽水",
              timestamp: new Date().toISOString(),
              player: pb.nickname || pb.userId,
              grossProfit: pb.cumulativeGrossProfit,
              exitPumpRate,
              exitPumpAmount: deduction,
              netBankerReturn: pb.cumulativeGrossProfit - deduction,
            });
          }).catch(() => {});
        }
      }
    }
    await storage.setPendingBanker(req.params.id, null);
    broadcast(req.params.id, { type: "PENDING_BANKER_CLEARED" });
    res.json({ ok: true });
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

  // Cancel round: refund all bets, return banker fund
  app.post("/api/rooms/:id/bet-round/cancel", requireAdmin, async (req, res) => {
    const round = await storage.getActiveBetRound(req.params.id);
    if (!round) return res.status(404).json({ error: "没有进行中的点餐轮" });

    // Refund all bets
    const roundBets = await storage.getBetsForRound(round.id);
    for (const bet of roundBets) {
      const betUser = await storage.getUser(bet.userId);
      if (betUser) {
        await storage.updateUserBalance(bet.userId, betUser.balance + bet.amount);
      }
    }

    // Return banker's deposited fund (the new portion: bankerMaxBet - carryOver)
    if (round.bankerUserId && round.bankerMaxBet) {
      const banker = await storage.getUser(round.bankerUserId);
      if (banker) {
        const carryOver = (round as any).carryOver ?? 0;
        const newPortion = Math.max(0, (round.bankerMaxBet as number) - carryOver);
        if (newPortion > 0) {
          await storage.updateUserBalance(round.bankerUserId, banker.balance + newPortion);
        }
      }
    }

    const cancelled = await storage.cancelBetRound(round.id);

    // Only clear pendingBanker if this was NOT a 续庄 continuation.
    // If it was a 续庄 round, the pendingBanker still holds the accumulated
    // cumulativeGrossProfit from previous rounds — we must preserve it so that
    // exit pump is correctly applied when the banker eventually steps down (下庄).
    {
      const existingRoom = await storage.getRoom(req.params.id);
      const prevPending = (existingRoom as any)?.pendingBanker;
      const wasCarryOver = ((round as any).carryOver ?? 0) > 0;
      const isSameBanker = wasCarryOver && prevPending?.userId === round.bankerUserId;
      if (!isSameBanker) {
        await storage.setPendingBanker(req.params.id, null);
      }
    }

    const msg = await storage.createMessage({
      roomId: req.params.id,
      content: "本轮点餐已取消，所有餐费已退还。",
      type: "system",
    });
    broadcast(req.params.id, { type: "BET_ROUND_CANCELLED", round: cancelled, message: msg });
    res.json(cancelled);
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

    // Check total bet cap using effective banker fund (pump deducted from new portion only)
    if (round.bankerMaxBet) {
      const carryOverR = (round as any).carryOver ?? 0;
      const newAmountR = Math.max(0, (round.bankerMaxBet as number) - carryOverR);
      const pumpRateR = (round as any).pumpRate ?? 0;
      const effectiveCap = Math.floor(newAmountR * (1 - pumpRateR / 100)) + carryOverR;
      const totalBets = await storage.getTotalBetsForRound(round.id);
      if (totalBets + parsed.data.amount > effectiveCap) {
        const remaining = Math.max(0, effectiveCap - totalBets);
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

    // Auto-pause when total bets reach the effective banker cap
    if (round.bankerMaxBet) {
      const carryOverR2 = (round as any).carryOver ?? 0;
      const newAmountR2 = Math.max(0, (round.bankerMaxBet as number) - carryOverR2);
      const pumpRateR2 = (round as any).pumpRate ?? 0;
      const effectiveCap2 = Math.floor(newAmountR2 * (1 - pumpRateR2 / 100)) + carryOverR2;
      const newTotal = await storage.getTotalBetsForRound(round.id);
      if (newTotal >= effectiveCap2) {
        const paused = await storage.pauseBetRound(round.id);
        const capMsg = await storage.createMessage({
          roomId: req.params.id,
          content: `📢 点餐订单已满（${effectiveCap2.toLocaleString()} 积分）。等待厨房出餐。`,
          type: "system",
        });
        broadcast(req.params.id, { type: "BET_ROUND_PAUSED", round: paused, reason: "cap_reached" });
        broadcast(req.params.id, { type: "MESSAGE", message: capMsg });
      }
    }

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

    const displayName = user.nickname || user.username;
    const cancelMsg = await storage.createMessage({
      roomId: req.params.id,
      userId: user.id,
      username: displayName,
      content: `${displayName}:撤回了点餐`,
      type: "bet",
    });
    broadcast(req.params.id, { type: "MESSAGE", message: cancelMsg });

    res.json({ refund });
  });

  // Online users in a room (based on WebSocket connections) + assigned shills
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
    const realUsers = users
      .filter((u): u is NonNullable<typeof u> => !!u && !u.isShill && !u.banned)
      .map(u => ({ id: u.id, username: u.username, nickname: u.nickname, balance: u.balance, isShill: false }));

    const allShills = await storage.getShillUsers();
    const roomShills = allShills
      .filter(s => (s as any).shillRoomId === req.params.id)
      .map(s => ({ id: s.id, username: s.username, nickname: s.nickname, balance: s.balance, isShill: true }));

    res.json([...realUsers, ...roomShills]);
  });

  // ADMIN
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    const allUsers = await storage.getAllUsers();
    res.json(allUsers.map((u) => ({ id: u.id, username: u.username, nickname: u.nickname, balance: u.balance, role: u.role, notes: u.notes || "", banned: u.banned, muted: u.muted, isShill: u.isShill, shillRoomId: (u as any).shillRoomId ?? null })));
  });

  app.patch("/api/admin/users/:id/balance", requireAdmin, async (req, res) => {
    const schema = z.object({ balance: z.number().int().min(0) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid balance" });

    const before = await storage.getUser(req.params.id);
    const user = await storage.adminAdjustBalance(req.params.id, parsed.data.balance);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Fire webhook: 充值 or 提现 (skip for shill/bot accounts)
    const delta = parsed.data.balance - (before?.balance ?? 0);
    if (delta !== 0 && !before?.isShill) {
      const adminName = req.session.nickname || req.session.username || "管理员";
      const playerName = user.nickname || user.username;
      storage.getBotSettings().then(cfg => {
        const url = delta > 0 ? (cfg as any).webhookUrl2 : (cfg as any).webhookUrl3;
        fireWebhooks([url], {
          type: delta > 0 ? "充值" : "提现",
          timestamp: new Date().toISOString(),
          admin: adminName,
          player: playerName,
          amount: Math.abs(delta),
          balanceBefore: before?.balance ?? 0,
          balanceAfter: parsed.data.balance,
        });
      }).catch(() => {});
    }

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

  // Helper: check if a user is a protected super-admin (cannot be modified by others)
  const PROTECTED_USERNAMES = ["DONG798", "@DONG798"];
  const isProtectedAdmin = (u: { username: string }) => PROTECTED_USERNAMES.includes(u.username);

  app.post("/api/admin/users", requireAdmin, async (req, res) => {
    const schema = z.object({
      username: z.string().min(2).max(30),
      password: z.string().min(3).max(100),
      nickname: z.string().max(20).optional(),
      balance: z.number().int().min(0).optional(),
      role: z.enum(["admin", "user"]).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const existing = await storage.getUserByUsername(parsed.data.username);
    if (existing) return res.status(400).json({ error: "用户名已存在" });

    const user = await storage.createUser({
      username: parsed.data.username,
      password: parsed.data.password,
      nickname: parsed.data.nickname || undefined,
    });
    if (parsed.data.balance) {
      await storage.updateUserBalance(user.id, parsed.data.balance);
      // Fire 充值 webhook for initial balance on account creation
      const adminName = (req.session as any).nickname || (req.session as any).username || "管理员";
      const playerName = parsed.data.nickname || parsed.data.username;
      storage.getBotSettings().then(cfg => {
        fireWebhooks([(cfg as any).webhookUrl2], {
          type: "充值",
          timestamp: new Date().toISOString(),
          admin: adminName,
          player: playerName,
          amount: parsed.data.balance,
          balanceBefore: 0,
          balanceAfter: parsed.data.balance,
        });
      }).catch(() => {});
    }
    if (parsed.data.role === "admin") await storage.setUserRole(user.id, "admin");
    const updated = await storage.getUser(user.id);
    res.json({ id: updated!.id, username: updated!.username, nickname: updated!.nickname, balance: updated!.balance, role: updated!.role });
  });

  app.patch("/api/admin/users/:id/ban", requireAdmin, async (req, res) => {
    const schema = z.object({ banned: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

    const target = await storage.getUser(req.params.id);
    if (!target) return res.status(404).json({ error: "User not found" });
    if (target.role === "admin") return res.status(400).json({ error: "不能封禁管理员账号" });
    if (isProtectedAdmin(target)) return res.status(403).json({ error: "不能操作受保护账号" });

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
    if (isProtectedAdmin(target)) return res.status(403).json({ error: "不能操作受保护账号" });

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
    if (isProtectedAdmin(target)) return res.status(403).json({ error: "不能操作受保护账号" });

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

  app.patch("/api/admin/users/:id/shill-room", requireAdmin, async (req, res) => {
    const schema = z.object({ shillRoomId: z.string().nullable() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

    const target = await storage.getUser(req.params.id);
    if (!target) return res.status(404).json({ error: "User not found" });
    if (!target.isShill) return res.status(400).json({ error: "用户不是托，无需分配房间" });

    const user = await storage.setUserShillRoom(req.params.id, parsed.data.shillRoomId);
    res.json({ id: user!.id, username: user!.username });
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
      webhookUrl1: z.string().max(500).optional(),
      webhookUrl2: z.string().max(500).optional(),
      webhookUrl3: z.string().max(500).optional(),
    }).refine(d => d.maxAmount >= d.minAmount, { message: "最大值不能小于最小值" });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const settings = await storage.updateBotSettings(parsed.data);
    res.json(settings);
  });

  app.get("/api/admin/low-balance-bots", requireAdmin, async (req, res) => {
    const botCfg = await storage.getBotSettings();
    const allShills = await storage.getShillUsers();
    const minRequired = Math.max(50, Math.ceil(botCfg.minAmount / 50) * 50);
    const low = allShills
      .filter(s => s.balance < minRequired)
      .map(s => ({ id: s.id, username: s.username, balance: s.balance, required: minRequired }));
    res.json(low);
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
    const [rounds, allUsers] = await Promise.all([
      storage.getAllBetRoundsWithBets(),
      storage.getAllUsers(),
    ]);

    // ── Date range filter ─────────────────────────────────────────
    const fromParam = req.query.from as string | undefined;
    const toParam   = req.query.to   as string | undefined;
    const fromDate  = fromParam ? new Date(fromParam) : null;
    const toDate    = toParam   ? new Date(toParam + "T23:59:59.999Z") : null;

    const inRange = (r: typeof rounds[0]) => {
      if (!fromDate && !toDate) return true;
      const d = r.closedAt ? new Date(r.closedAt) : r.createdAt ? new Date(r.createdAt) : null;
      if (!d) return !fromDate; // open rounds only included when no from-filter
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    };

    const filteredRounds = rounds.filter(inRange);
    const dateLabel = (fromDate || toDate)
      ? `${fromParam ?? "起始"}~${toParam ?? "至今"}`
      : "全部";

    // ── Sheet 1: 玩家统计 ─────────────────────────────────────────
    const betStatsByUser = new Map<string, { count: number; turnover: number }>();
    for (const r of filteredRounds) {
      if (r.status !== "closed") continue;
      for (const b of r.bets) {
        const s = betStatsByUser.get(b.userId) || { count: 0, turnover: 0 };
        s.count += 1;
        s.turnover += b.amount;
        betStatsByUser.set(b.userId, s);
      }
    }

    // Active/paused rounds for banker locked amount (always current, not date-filtered)
    const activeBankerLocked = new Map<string, number>();
    for (const r of rounds) {
      if ((r.status === "open" || r.status === "paused") && r.bankerUserId && r.bankerMaxBet) {
        const carryOver = (r as any).carryOver ?? 0;
        const locked = Math.max(0, (r.bankerMaxBet as number) - carryOver);
        activeBankerLocked.set(r.bankerUserId, (activeBankerLocked.get(r.bankerUserId) || 0) + locked);
      }
    }

    const playerRows = allUsers
      .filter(u => !u.isShill)
      .map(u => {
        const stats = betStatsByUser.get(u.id) || { count: 0, turnover: 0 };
        const bankerLocked = activeBankerLocked.get(u.id) || 0;
        const totalDeposits = (u as any).totalDeposits ?? 0;
        const totalWithdrawals = (u as any).totalWithdrawals ?? 0;
        const totalAssets = u.balance + bankerLocked;
        const totalProfit = totalAssets + totalWithdrawals - totalDeposits;
        return {
          "玩家": u.nickname || u.username,
          "积分数": u.balance,
          "桌上分数": bankerLocked,
          "总盈利": totalProfit,
          "总充值": totalDeposits,
          "下注数": stats.count,
          "总提分数": totalWithdrawals,
          "总流水": stats.turnover,
        };
      })
      .sort((a, b) => b["积分数"] - a["积分数"]);

    // ── Sheet 2: 轮次汇总 ─────────────────────────────────────────
    const summaryRows = filteredRounds.map(r => {
      const opts = (r.options as Array<{ key: string; label: string }>) || [];
      const totalPool = r.bets.reduce((s, b) => s + b.amount, 0);
      const winnerLabel = r.winnerOption ? (opts.find(o => o.key === r.winnerOption)?.label || r.winnerOption) : "未开奖";
      return {
        "房间": r.roomName,
        "轮次ID": r.id,
        "开始时间": r.createdAt ? new Date(r.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Kuala_Lumpur" }) : "",
        "结束时间": r.closedAt ? new Date(r.closedAt).toLocaleString("zh-CN", { timeZone: "Asia/Kuala_Lumpur" }) : "",
        "状态": r.status === "open" ? "进行中" : "已结束",
        "庄家": r.bankerNickname || "",
        "庄家属性": r.bankerOption ? (opts.find(o => o.key === r.bankerOption)?.label || r.bankerOption) : "",
        "庄家上限": r.bankerMaxBet || "",
        "获胜属性": winnerLabel,
        "总下注池": totalPool,
        "参与人数": new Set(r.bets.map(b => b.userId)).size,
        "下注笔数": r.bets.length,
      };
    });

    // ── Sheet 3: 下注明细 ─────────────────────────────────────────
    const betRows = filteredRounds.flatMap(r => {
      const opts = (r.options as Array<{ key: string; label: string }>) || [];
      return r.bets.map(b => {
        const optLabel = opts.find(o => o.key === b.option)?.label || b.option;
        return {
          "房间": r.roomName,
          "时间": b.createdAt ? new Date(b.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Kuala_Lumpur" }) : "",
          "用户昵称": b.nickname || b.username,
          "账号": b.username,
          "下注属性": optLabel,
          "下注金额": b.amount,
          "庄家": r.bankerNickname || "",
        };
      });
    });

    const wb = XLSX.utils.book_new();

    const makeSheet = (data: object[], sheetName: string) => {
      const ws = XLSX.utils.json_to_sheet(data);
      if (data.length > 0) {
        ws["!cols"] = Object.keys(data[0]).map(() => ({ wch: 14 }));
      }
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    };

    makeSheet(playerRows, "玩家统计");
    makeSheet(summaryRows, "轮次汇总");
    makeSheet(betRows, "下注明细");

    // Build ASCII-safe filename (dates are YYYY-MM-DD, safe for headers)
    const filenamePart = (fromParam || toParam)
      ? `${fromParam ?? "start"}_${toParam ?? "end"}`
      : `all_${Date.now()}`;
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", `attachment; filename="report_${filenamePart}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  });

  // Platform financial stats — only accessible by @DONG798 / DONG798
  app.get("/api/admin/platform-stats", requireAdmin, async (req, res) => {
    if (!["DONG798", "@DONG798"].includes(req.session.username ?? "")) {
      return res.status(403).json({ error: "无权限" });
    }

    const fromParam = req.query.from as string | undefined;
    const toParam   = req.query.to   as string | undefined;
    const fromDate  = fromParam ? new Date(fromParam) : null;
    const toDate    = toParam ? new Date(toParam + "T23:59:59.999Z") : null;

    const [users, rounds] = await Promise.all([
      storage.getAllUsers(),
      storage.getAllBetRoundsWithBets(),
    ]);

    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let totalUserBalances = 0;
    for (const u of users) {
      totalDeposits += (u as any).totalDeposits ?? 0;
      totalWithdrawals += (u as any).totalWithdrawals ?? 0;
      totalUserBalances += u.balance ?? 0;
    }
    const platformNetCash = totalDeposits - totalWithdrawals;
    const pumpCollected   = platformNetCash - totalUserBalances;

    // Period pump from game rounds in selected date range
    let periodPump = 0;
    let periodRounds = 0;
    let periodBets = 0;
    for (const r of rounds) {
      if (r.status !== "closed") continue;
      const d = r.closedAt ? new Date(r.closedAt) : r.createdAt ? new Date(r.createdAt) : null;
      if (fromDate && d && d < fromDate) continue;
      if (toDate && d && d > toDate) continue;
      periodRounds += 1;
      periodBets += r.bets.length;
      const pumpRate = (r as any).pumpRate ?? 0;
      const carryOver = (r as any).carryOver ?? 0;
      const bankerMax = (r as any).bankerMaxBet ?? 0;
      const newPortion = Math.max(0, bankerMax - carryOver);
      periodPump += Math.floor(newPortion * pumpRate / 100);
    }

    return res.json({
      totalDeposits,
      totalWithdrawals,
      totalUserBalances,
      platformNetCash,
      pumpCollected,
      periodPump,
      periodRounds,
      periodBets,
      hasDateFilter: !!(fromDate || toDate),
    });
  });

  app.delete("/api/admin/nuke-all-data", requireAdmin, async (req, res) => {
    if (!["DONG798", "@DONG798"].includes(req.session.username ?? "")) {
      return res.status(403).json({ error: "无权限" });
    }
    const { confirmPhrase } = req.body as { confirmPhrase?: string };
    if (confirmPhrase !== "永久抹除") {
      return res.status(400).json({ error: "确认短语错误" });
    }

    await storage.nukeAllData();
    res.json({ ok: true });
  });

  app.get("/api/admin/finance-report", requireAdmin, async (req, res) => {
    if (!["DONG798", "@DONG798"].includes(req.session.username ?? "")) {
      return res.status(403).json({ error: "无权限" });
    }
    const [users, rounds] = await Promise.all([
      storage.getAllUsers(),
      storage.getAllBetRoundsWithBets(),
    ]);

    const deposits = users
      .filter(u => ((u as any).totalDeposits ?? 0) > 0)
      .map(u => ({ username: u.username, nickname: u.nickname ?? null, amount: (u as any).totalDeposits as number }))
      .sort((a, b) => b.amount - a.amount);

    const withdrawals = users
      .filter(u => ((u as any).totalWithdrawals ?? 0) > 0)
      .map(u => ({ username: u.username, nickname: u.nickname ?? null, amount: (u as any).totalWithdrawals as number }))
      .sort((a, b) => b.amount - a.amount);

    const roundPumps = rounds
      .filter(r => r.status === "closed" && r.bankerUserId)
      .map(r => {
        const pumpRate = (r as any).pumpRate ?? 0;
        const exitPumpRate = (r as any).exitPumpRate ?? 0;
        const bankerMaxBet = (r as any).bankerMaxBet ?? 0;
        const carryOver = (r as any).carryOver ?? 0;
        const newPortion = Math.max(0, bankerMaxBet - carryOver);
        const pumpAmount = Math.floor(newPortion * pumpRate / 100);
        return {
          id: r.id,
          roomName: r.roomName,
          bankerNickname: r.bankerNickname ?? r.bankerUserId ?? "—",
          date: (r.closedAt ?? r.createdAt)?.toISOString() ?? "",
          pumpRate,
          exitPumpRate,
          pumpAmount,
          betsCount: r.bets.length,
        };
      })
      .sort((a, b) => (b.date > a.date ? 1 : -1));

    res.json({ deposits, withdrawals, roundPumps });
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

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url || "", `http://localhost`);
    const roomId = url.searchParams.get("roomId") || "";
    const userId = url.searchParams.get("userId") || "";
    const username = url.searchParams.get("username") || "";

    const userRecord = userId ? await storage.getUser(userId) : null;
    const role = userRecord?.role || "user";

    const client: WsClient = { ws, userId, username, roomId, role, isAlive: true, lastActivity: Date.now() };
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
