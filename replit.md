# 梦幻舞台 - 游戏下注聊天平台

A WeChat-like gaming chat platform with live betting rooms. Dark-themed, real-time, and fully featured.

## Overview

梦幻舞台 is a Chinese-language web application where administrators can create game rooms with live betting rounds. Users register, join rooms, chat in real-time, and place bets on customizable options (A/B/C or any custom labels).

## Architecture

- **Frontend**: React + TypeScript + TailwindCSS + shadcn/ui (dark theme by default)
- **Backend**: Express.js + WebSocket (ws library)
- **Database**: PostgreSQL via Drizzle ORM
- **Real-time**: WebSocket for live chat messages and bet updates
- **Auth**: Session-based (express-session)
- **Security**: helmet (CSP disabled), cors, express-rate-limit (60/min production only)

## Default Credentials

- **Admin**: @aoe166 / aoe16666 (nickname: 66总, balance: 9,999,999)
- **Admin**: @DONG798 / Thongsheng@02 (nickname: 阿东（管理）)
- **User**: qwe / 123123 (nickname: 骚鸡, balance: 999,734)
- **User**: DONG798 / Aaaa1111 (nickname: 小东, TOTP enabled)

## Shill Accounts (托)

Shill accounts auto-bet when a bet round starts. Login is blocked (403) for shills. Password for most shills: `el-G4V17'_#c`

Shills: FlappyBird(蓝思嫒), QuirkyFawn(战囡), QuirkyPrawn(酒初南), Pounce#9(星星), Claw$Hawk(月亮), HydroGarnet(零如冬), Hitatami(地球), Angrybird(太阳)

## Rooms (6 active)

初梦, 幻彩, 星耀, 璀璨, 辉煌, 梦境

## Routes

- `/auth` - Login/Register page
- `/` - Lobby (room list)
- `/room/:id` - Chat room with betting panel
- `/admin` - Admin management panel (admin only)

## API Endpoints

```
POST /api/auth/login
POST /api/auth/register
POST /api/auth/logout
GET  /api/auth/me

GET  /api/rooms
GET  /api/rooms/:id
POST /api/rooms (admin)
PATCH /api/rooms/:id (admin)
DELETE /api/rooms/:id (admin)

GET  /api/rooms/:id/messages
POST /api/rooms/:id/messages
DELETE /api/rooms/:id/messages/:msgId (admin)

GET  /api/rooms/:id/bet-round
POST /api/rooms/:id/bet-round (admin - start round, banker required)
PATCH /api/rooms/:id/bet-round/options (admin - update labels)
POST /api/rooms/:id/bet-round/close (admin - declare winner)
POST /api/rooms/:id/bet-round/pause (admin)
POST /api/rooms/:id/bet-round/resume (admin)
POST /api/rooms/:id/bet-round/cancel (admin - cancel & refund all)

POST /api/rooms/:id/bets
GET  /api/rooms/:id/bets
DELETE /api/rooms/:id/bets (user - cancel own bets)

GET  /api/admin/users (admin)
POST /api/admin/users (admin - create new user)
PATCH /api/admin/users/:id/balance (admin)
PATCH /api/admin/users/:id/notes (admin)
PATCH /api/admin/users/:id/ban (admin)
PATCH /api/admin/users/:id/mute (admin)
PATCH /api/admin/users/:id/shill (admin)
PATCH /api/admin/users/:id/shill-room (admin - assign shill to specific room)
PATCH /api/admin/users/:id/nickname (admin)
PATCH /api/admin/users/:id/role (admin - promote/demote, DONG798 protected)

GET  /api/admin/bot-settings (admin)
PATCH /api/admin/bot-settings (admin)

GET  /api/admin/private-messages (admin)
GET  /api/admin/private-messages/:userId (admin)
POST /api/admin/private-messages/:userId/reply (admin)
DELETE /api/admin/private-messages/:userId (admin)

POST /api/admin/migrate-data (admin) -- ONE-TIME DB SYNC
```

## WebSocket

Connected at `/ws?roomId=&userId=&username=`
Events:
- `MESSAGE` - new chat message
- `NEW_BET` - new bet placed
- `BET_ROUND_STARTED` - admin started a round
- `BET_ROUND_CLOSED` - admin declared winner
- `BET_OPTIONS_UPDATED` - admin updated option labels
- `ROOM_CREATED` / `ROOM_UPDATED` / `ROOM_DELETED`
- `NEW_PRIVATE_MESSAGE` - private message notification

## Banker (主厨/庄) System — REQUIRED

When starting a round, admin MUST configure a banker (主厨):
- 主厨 (banker): required — round cannot start without a banker and max bet
- 主厨属性: which option the banker "owns" (B体力/C法力/A力量/D耐力, in that order)
- 主厨上限: maximum total bets (banker deposits this from their balance)
- 续庄携带 (carryOver): if same banker continues, fill in their last round's remaining balance — only the NEW portion is deducted

Rules:
- **bankerOption is now REQUIRED** to start a round (along with bankerUserId and bankerMaxBet)
- Non-banker users cannot bet on the banker's option (disabled with "桩" badge)
- Total bets are capped at bankerMaxBet (enforced server-side)
- Only the (bankerMaxBet - carryOver) portion is deducted from banker's balance
- Pump rate (厨房服务费) only applies to the new deposited portion, not the carryOver
- DONG798 and @DONG798 accounts are super-admin protected (cannot be banned/muted/demoted)

Banker data stored in betRounds: `bankerUserId`, `bankerNickname`, `bankerOption`, `bankerMaxBet`, `carryOver`

## Payout Rules (Banker vs Player Scoring)

Each option gets a score (0-9) at round close. Each player's option score is compared against the banker's option score:

- **Player wins**: player_score > banker_score (strict greater-than; tie = banker wins)
  - If player_score == 9: payout = 3× bet (net 2× bet) — "九点三倍"
  - Otherwise: payout = 2× bet (net 1× bet, i.e., 1-to-1 odds)
- **Player loses**: player_score <= banker_score → stake is lost
- **playerPumpRate**: NOT applied — players receive their full payout with no deduction
- **Banker return**: remaining fund (effectiveBankerFund - total net wins paid) + all losing bets
- **doubleMultiplier**: if admin toggles 庄翻倍, payout ratios are doubled (9-point becomes 6×, normal win becomes 4×)

effectiveBankerFund = floor(newAmount × (1 - pumpRate/100)) + carryOver

## Cancel Round

Admin can cancel a round mid-game (during open or paused state):
- Endpoint: POST /api/rooms/:id/bet-round/cancel
- Refunds all bets to players
- Returns the new-portion banker deposit (not carryOver) to banker
- Broadcasts BET_ROUND_CANCELLED event
- UI: red "取消本轮" button in admin panel with confirmation inline dialog

## Bet History

Each room stores accumulated bet history (last results) in `rooms.bet_history` (TEXT, newline-separated).
- Appended after each round closes
- Format: `{timestamp} 结果:{winner label}({points}分) 出餐:{count}人`
- Displayed in the close-round summary message (last 10 entries)

## New Summary Format

After closing a round, the system posts a structured summary:
```
——————————————
{timestamp}
点餐结果: 体X 法X 力X 耐X
厨师: {banker name}（{banker option}X点）
厨师余: {banker return amount}
————
{player} [{option}X(胜/负) ...]: ±{net} 余: {balance}
...
————
历史出餐记录:
{recent 10 history entries}
————
本餐厨师（name）抽水: X | 本轮净 ±X
```

History entry format: `{timestamp} 厨师:{bankerOption}{score} 点餐:{count}人 厨余:{bankerReturn}`

## Option Display Order

Fixed display order for options: 体力(B, #22c55e), 法力(C, #a855f7), 力量(A, #ef4444), 耐力(D, #3b82f6)

## Multiple Bets per Round

Users can bet on multiple different options in one round:
- One bet per option per round (e.g., can bet on A and C, but not A twice)
- Options already bet on show ✓ mark and are disabled
- Clicking a new bet replaces selectedOption for next submission

## Excel Export

Admin page has a green "导出Excel" download button (GET /api/admin/export/excel):
- Sheet 1 (轮次汇总): one row per round with winner, total pool, banker info, profit
- Sheet 2 (下注明细): all individual bets across all rounds
- Uses `xlsx` package, streamed as binary attachment

## TOTP / 2FA

- Uses `speakeasy` with `window: 1`
- All users including admins require TOTP if enabled
- DONG798 / Aaaa1111 has TOTP enabled with secret `O5VXITD5JZQX2ZTUO5JSCVKWH5XXI3SE`

## Key Technical Notes

- Rate limiter: production-only (60 req/min), dev has no rate limit
- Trust proxy: 1 (required for rate limiter accuracy)
- Shill auto-bet uses bot_settings (minAmount/maxAmount range, enabled toggle)
- Insufficient shill balance generates system chat @mention warning
- Dev and production databases are separate instances

## Production Database Sync

The admin panel "托管系统" tab has a "一键同步数据库" button (POST /api/admin/migrate-data) that:
1. Deletes old seed rooms/users from production
2. Inserts all 12 dev users with correct IDs/passwords/nicknames
3. Inserts 6 new rooms (初梦/幻彩/星耀/璀璨/辉煌/梦境)
4. Sets bot_settings defaults
Run once after deployment to sync production DB.

## Project Structure

```
shared/schema.ts     - Drizzle schema (users, rooms, betRounds, bets, messages)
server/
  index.ts           - Express server entry + security middleware
  routes.ts          - API routes + WebSocket + migration endpoint
  storage.ts         - Database storage interface (PostgreSQL via Drizzle)
client/src/
  App.tsx            - Router with auth protection
  hooks/use-auth.ts  - Auth hook
  components/header.tsx
  pages/auth.tsx     - Login/Register
  pages/lobby.tsx    - Room lobby
  pages/room.tsx     - Chat room + betting
  pages/admin.tsx    - Admin panel (rooms/users/bot/inbox tabs)
attached_assets/
  梦幻舞台.png        - Logo image
```
