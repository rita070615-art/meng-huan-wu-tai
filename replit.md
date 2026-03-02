# Dream Stage - 游戏下注聊天平台

A WeChat-like gaming chat platform with live betting rooms. Dark-themed, real-time, and fully featured.

## Overview

Dream Stage is a Chinese-language web application where administrators can create game rooms with live betting rounds. Users register, join rooms, chat in real-time, and place bets on customizable options (A/B/C or any custom labels).

## Architecture

- **Frontend**: React + TypeScript + TailwindCSS + shadcn/ui (dark theme by default)
- **Backend**: Express.js + WebSocket (ws library)
- **Database**: PostgreSQL via Drizzle ORM
- **Real-time**: WebSocket for live chat messages and bet updates
- **Auth**: Session-based (express-session)

## Key Features

### User Features
- User registration and login
- Game room lobby with real-time status badges
- Live chat in rooms (WeChat-style bubbles)
- Betting panel with A/B/C options (configurable labels)
- Live action feed showing recent bets
- Balance tracking (coins)

### Admin Features
- Create/delete game rooms
- Start and close bet rounds
- Customize bet option labels (A, B, C can be renamed to anything)
- Declare winners (90% of pool distributed proportionally to winners)
- Manage user balances

## Default Credentials

- **Admin**: admin / admin123 (balance: 99999)
- **Test users**: player1 / pass1234, player2 / pass1234

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

GET  /api/rooms/:id/bet-round
POST /api/rooms/:id/bet-round (admin - start round)
PATCH /api/rooms/:id/bet-round/options (admin - update labels)
POST /api/rooms/:id/bet-round/close (admin - declare winner)

POST /api/rooms/:id/bets
GET  /api/rooms/:id/bets

GET  /api/admin/users (admin)
PATCH /api/admin/users/:id/balance (admin)
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

## Project Structure

```
shared/schema.ts     - Drizzle schema (users, rooms, betRounds, bets, messages)
server/
  index.ts           - Express server entry
  routes.ts          - API routes + WebSocket + seed data
  storage.ts         - Database storage interface (PostgreSQL via Drizzle)
client/src/
  App.tsx            - Router with auth protection
  hooks/use-auth.ts  - Auth hook
  components/header.tsx
  pages/auth.tsx     - Login/Register
  pages/lobby.tsx    - Room lobby
  pages/room.tsx     - Chat room + betting
  pages/admin.tsx    - Admin panel
```
