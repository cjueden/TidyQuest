# 🌐 TidyQuest API Documentation

Complete reference for all TidyQuest REST API endpoints.

**Base URL**: `http://localhost:3020/api`

**Authentication**: All endpoints (except `/auth/*`) require a JWT token in the `Authorization` header:

```http
Authorization: Bearer <your-jwt-token>
```

---

## 📑 Table of Contents

- [Authentication](#authentication)
- [Rooms](#rooms)
- [Tasks](#tasks)
- [Dashboard](#dashboard)
- [Leaderboard](#leaderboard)
- [History](#history)
- [Users](#users)
- [Rewards](#rewards)
- [Achievements](#achievements)
- [Data Export/Import](#data-exportimport)
- [Error Responses](#error-responses)

---

## 🔐 Authentication

### Register

Create a new user account.

**Endpoint**: `POST /api/auth/register`

**Request Body**:
```json
{
  "username": "john",
  "password": "securepass123",
  "displayName": "John Doe",
  "avatarColor": "#F97316",
  "language": "en"
}
```

**Response** (201):
```json
{
  "user": {
    "id": 1,
    "username": "john",
    "displayName": "John Doe",
    "role": "admin",
    "avatarColor": "#F97316",
    "avatarType": "letter",
    "coins": 0,
    "currentStreak": 0,
    "language": "en",
    "createdAt": "2026-02-17T10:30:00.000Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**cURL Example**:
```bash
curl -X POST http://localhost:3020/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john",
    "password": "securepass123",
    "displayName": "John Doe",
    "avatarColor": "#F97316",
    "language": "en"
  }'
```

---

### Login

Authenticate and receive a JWT token.

**Endpoint**: `POST /api/auth/login`

**Request Body**:
```json
{
  "username": "john",
  "password": "securepass123"
}
```

**Response** (200):
```json
{
  "user": { ... },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**cURL Example**:
```bash
curl -X POST http://localhost:3020/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "john", "password": "securepass123"}'
```

---

### Get Current User

Get authenticated user's profile.

**Endpoint**: `GET /api/auth/me`

**Headers**: `Authorization: Bearer <token>`

**Response** (200):
```json
{
  "id": 1,
  "username": "john",
  "displayName": "John Doe",
  "role": "admin",
  "avatarColor": "#F97316",
  "avatarType": "letter",
  "avatarPreset": null,
  "avatarPhotoUrl": null,
  "coins": 150,
  "currentStreak": 7,
  "goalCoins": 500,
  "goalStartAt": "2026-02-01T00:00:00.000Z",
  "goalEndAt": "2026-02-28T23:59:59.000Z",
  "isVacationMode": false,
  "language": "en",
  "createdAt": "2026-01-15T08:00:00.000Z"
}
```

**cURL Example**:
```bash
curl -X GET http://localhost:3020/api/auth/me \
  -H "Authorization: Bearer <your-token>"
```

---

## 🏠 Rooms

### List All Rooms

**Endpoint**: `GET /api/rooms`

**Response** (200):
```json
[
  {
    "id": 1,
    "name": "Kitchen",
    "roomType": "kitchen",
    "color": "#FFE4C4",
    "accentColor": "#FFA500",
    "photoUrl": null,
    "sortOrder": 1,
    "health": 75,
    "createdAt": "2026-02-10T12:00:00.000Z"
  }
]
```

**cURL Example**:
```bash
curl -X GET http://localhost:3020/api/rooms \
  -H "Authorization: Bearer <your-token>"
```

---

### Get Room by ID

**Endpoint**: `GET /api/rooms/:id`

**Response** (200):
```json
{
  "id": 1,
  "name": "Kitchen",
  "roomType": "kitchen",
  "color": "#FFE4C4",
  "accentColor": "#FFA500",
  "photoUrl": null,
  "sortOrder": 1,
  "createdAt": "2026-02-10T12:00:00.000Z"
}
```

---

### Create Room

**Endpoint**: `POST /api/rooms` (Admin only)

**Request Body**:
```json
{
  "name": "Master Bedroom",
  "roomType": "bedroom",
  "color": "#E6F3FF",
  "accentColor": "#4A90E2"
}
```

**Response** (201):
```json
{
  "id": 5,
  "name": "Master Bedroom",
  "roomType": "bedroom",
  ...
}
```

**cURL Example**:
```bash
curl -X POST http://localhost:3020/api/rooms \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Master Bedroom",
    "roomType": "bedroom",
    "color": "#E6F3FF",
    "accentColor": "#4A90E2"
  }'
```

---

### Update Room

**Endpoint**: `PUT /api/rooms/:id`

**Request Body**:
```json
{
  "name": "Main Kitchen",
  "sortOrder": 2
}
```

**Response** (200):
```json
{
  "id": 1,
  "name": "Main Kitchen",
  "sortOrder": 2,
  ...
}
```

---

### Delete Room

**Endpoint**: `DELETE /api/rooms/:id` (Admin only)

**Response** (200):
```json
{
  "success": true
}
```

---

### Get Default Tasks for Room Type

**Endpoint**: `GET /api/rooms/defaults/:roomType`

Available room types: `kitchen`, `bedroom`, `bathroom`, `living`, `office`, `garage`, `laundry`, `garden`

**Response** (200):
```json
[
  {
    "name": "Wash Dishes",
    "frequencyDays": 1,
    "effort": 2,
    "translationKey": "kitchen.wash_dishes",
    "iconKey": "wash_dishes"
  },
  {
    "name": "Clean Fridge",
    "frequencyDays": 14,
    "effort": 3,
    "translationKey": "kitchen.clean_fridge",
    "iconKey": "fridge"
  }
]
```

---

## ✅ Tasks

### List Tasks for a Room

**Endpoint**: `GET /api/rooms/:roomId/tasks`

**Response** (200):
```json
[
  {
    "id": 1,
    "roomId": 1,
    "name": "Wash Dishes",
    "notes": "Use dishwasher for big loads",
    "frequencyDays": 1,
    "effort": 2,
    "health": 85,
    "lastCompletedAt": "2026-02-17T08:00:00.000Z",
    "translationKey": "kitchen.wash_dishes",
    "iconKey": "wash_dishes",
    "createdAt": "2026-02-10T12:00:00.000Z"
  }
]
```

**cURL Example**:
```bash
curl -X GET http://localhost:3020/api/rooms/1/tasks \
  -H "Authorization: Bearer <your-token>"
```

---

### Create Task

**Endpoint**: `POST /api/rooms/:roomId/tasks` (Admin only)

**Request Body**:
```json
{
  "name": "Deep Clean Oven",
  "notes": "Use oven cleaner spray",
  "frequencyDays": 30,
  "effort": 5,
  "translationKey": "kitchen.deep_clean_oven",
  "iconKey": "oven"
}
```

**Response** (201):
```json
{
  "id": 15,
  "roomId": 1,
  "name": "Deep Clean Oven",
  ...
}
```

---

### Update Task

**Endpoint**: `PUT /api/tasks/:id` (Admin only)

**Request Body**:
```json
{
  "frequencyDays": 7,
  "effort": 3
}
```

**Response** (200):
```json
{
  "id": 15,
  "frequencyDays": 7,
  "effort": 3,
  ...
}
```

---

### Delete Task

**Endpoint**: `DELETE /api/tasks/:id` (Admin only)

**Response** (200):
```json
{
  "success": true
}
```

---

### Get Overdue Tasks

Returns all non-seasonal, non-on-demand tasks with health ≤ 0 (i.e. overdue), sorted from most overdue to least.

**Endpoint**: `GET /api/tasks/overdue`

**Response** (200):
```json
[
  {
    "id": 4,
    "name": "Vacuum Living Room",
    "roomId": 2,
    "roomName": "Living Room",
    "effort": 3,
    "frequencyDays": 7,
    "lastCompletedAt": "2026-05-01T10:00:00.000Z",
    "health": -20,
    "daysOverdue": 13,
    "assignedUsers": [
      {
        "userId": 1,
        "displayName": "John Doe",
        "avatarColor": "#F97316"
      }
    ]
  }
]
```

**cURL Example**:
```bash
curl -X GET http://localhost:3020/api/tasks/overdue \
  -H "Authorization: Bearer <your-token>"
```

---

### Complete Task

Mark a task as completed, earn coins, update streak.

**Endpoint**: `POST /api/tasks/:id/complete`

**Request Body** (all optional):
| Field | Description |
|---|---|
| `onBehalfOfUserId` | Admins and members can record the completion for someone else. |
| `requireApproval` | With `onBehalfOfUserId`, send `true` when the person named is the one acting (for example from Home Assistant). If they're a child and Strict Mode is on, the completion waits for a parent's approval instead of paying out immediately. |

**Response** (200):
```json
{
  "completion": {
    "id": 123,
    "taskId": 1,
    "userId": 1,
    "completedAt": "2026-02-17T14:30:00.000Z",
    "coinsEarned": 10
  },
  "user": {
    "id": 1,
    "coins": 160,
    "currentStreak": 8,
    "lastActiveDate": "2026-02-17",
    ...
  },
  "newAchievements": [
    {
      "id": "streak_7",
      "name": "On Fire",
      "description": "Complete tasks for 7 days in a row",
      "icon": "🔥"
    }
  ]
}
```

**cURL Example**:
```bash
curl -X POST http://localhost:3020/api/tasks/1/complete \
  -H "Authorization: Bearer <your-token>"
```

---

## 📊 Dashboard

Get aggregated view: house health, today's quests, upcoming tasks, recent activity, goals, pending rewards.

**Endpoint**: `GET /api/dashboard`

**Response** (200):
```json
{
  "houseHealth": 78,
  "todayQuests": {
    "completed": 5,
    "total": 12
  },
  "nextTasks": [
    {
      "id": 3,
      "name": "Vacuum Living Room",
      "roomName": "Living Room",
      "health": 45,
      "effort": 3,
      "dueIn": "2 hours"
    }
  ],
  "recentActivity": [
    {
      "id": 120,
      "taskName": "Wash Dishes",
      "userName": "John Doe",
      "completedAt": "2026-02-17T14:00:00.000Z",
      "coinsEarned": 10
    }
  ],
  "myGoals": [
    {
      "id": 1,
      "title": "February Goal",
      "goalCoins": 500,
      "currentCoins": 160,
      "progress": 32,
      "startAt": "2026-02-01T00:00:00.000Z",
      "endAt": "2026-02-28T23:59:59.000Z"
    }
  ],
  "pendingRewardRequests": 2
}
```

**cURL Example**:
```bash
curl -X GET http://localhost:3020/api/dashboard \
  -H "Authorization: Bearer <your-token>"
```

---

## 🏆 Leaderboard

Get family rankings by period.

**Endpoint**: `GET /api/leaderboard?period=<period>`

**Query Params**:
- `period`: `week`, `month`, `quarter`, or `year`

**Response** (200):
```json
{
  "period": "week",
  "leaderboard": [
    {
      "userId": 1,
      "displayName": "John Doe",
      "avatarColor": "#F97316",
      "avatarType": "letter",
      "avatarPreset": null,
      "avatarPhotoUrl": null,
      "coinsEarned": 150,
      "tasksCompleted": 25,
      "rank": 1
    },
    {
      "userId": 2,
      "displayName": "Jane Doe",
      "coinsEarned": 120,
      "tasksCompleted": 20,
      "rank": 2
    }
  ]
}
```

**cURL Example**:
```bash
curl -X GET "http://localhost:3020/api/leaderboard?period=week" \
  -H "Authorization: Bearer <your-token>"
```

---

## 📜 History

Get paginated activity log of all task completions.

**Endpoint**: `GET /api/history?limit=<limit>&offset=<offset>`

**Query Params**:
- `limit`: Number of records (default: 20)
- `offset`: Skip N records (default: 0)

**Response** (200):
```json
{
  "history": [
    {
      "id": 120,
      "taskName": "Wash Dishes",
      "roomName": "Kitchen",
      "userName": "John Doe",
      "completedAt": "2026-02-17T14:00:00.000Z",
      "coinsEarned": 10
    }
  ],
  "total": 500,
  "limit": 20,
  "offset": 0
}
```

**cURL Example**:
```bash
curl -X GET "http://localhost:3020/api/history?limit=50&offset=100" \
  -H "Authorization: Bearer <your-token>"
```

---

## 👥 Users

### List All Users

**Endpoint**: `GET /api/users` (Admin only)

**Response** (200):
```json
[
  {
    "id": 1,
    "username": "john",
    "displayName": "John Doe",
    "role": "admin",
    "coins": 160,
    "currentStreak": 8,
    ...
  }
]
```

---

### Create User

**Endpoint**: `POST /api/users` (Admin only)

**Request Body**:
```json
{
  "username": "alice",
  "password": "alicepass",
  "displayName": "Alice",
  "role": "child",
  "avatarColor": "#FFB6C1",
  "language": "en"
}
```

**Response** (201):
```json
{
  "id": 3,
  "username": "alice",
  "displayName": "Alice",
  "role": "child",
  ...
}
```

---

### Update User Profile

**Endpoint**: `PUT /api/users/:id/profile`

**Request Body**:
```json
{
  "displayName": "John Smith",
  "avatarType": "character",
  "avatarPreset": "cat",
  "language": "fr"
}
```

**Response** (200):
```json
{
  "id": 1,
  "displayName": "John Smith",
  "avatarType": "character",
  "avatarPreset": "cat",
  ...
}
```

---

### Upload Avatar Photo

**Endpoint**: `POST /api/users/:id/avatar-upload`

**Headers**:
- `Content-Type: multipart/form-data`

**Request Body**:
```
FormData:
  - avatar: <file> (image/*, max 2MB)
```

**Response** (200):
```json
{
  "id": 1,
  "avatarType": "photo",
  "avatarPhotoUrl": "/api/avatars/user-1-1708176000000.jpg",
  ...
}
```

**cURL Example**:
```bash
curl -X POST http://localhost:3020/api/users/1/avatar-upload \
  -H "Authorization: Bearer <your-token>" \
  -F "avatar=@/path/to/photo.jpg"
```

---

### Update User Settings

**Endpoint**: `PUT /api/users/:id/settings` (Admin only, self only)

**Request Body**:
```json
{
  "isVacationMode": true,
  "language": "es"
}
```

**Response** (200):
```json
{
  "id": 1,
  "isVacationMode": true,
  "vacationStartDate": "2026-02-17T15:00:00.000Z",
  "language": "es",
  ...
}
```

---

### Get Coins Configuration

**Endpoint**: `GET /api/users/coins-config`

**Response** (200):
```json
{
  "coinsByEffort": {
    "1": 5,
    "2": 10,
    "3": 15,
    "4": 20,
    "5": 25
  }
}
```

---

### Update Coins Configuration

**Endpoint**: `PUT /api/users/coins-config` (Admin only)

**Request Body**:
```json
{
  "coinsByEffort": {
    "1": 10,
    "2": 20,
    "3": 30,
    "4": 40,
    "5": 50
  }
}
```

Or reset to defaults:
```json
{
  "useDefault": true
}
```

**Response** (200):
```json
{
  "coinsByEffort": { ... }
}
```

---

## 🎁 Rewards

### List Rewards

**Endpoint**: `GET /api/rewards`

**Response** (200):
```json
{
  "rewards": [
    {
      "id": 1,
      "title": "Movie Night Pick",
      "description": "Choose the family movie",
      "costCoins": 40,
      "isActive": true,
      "isPreset": true,
      "createdBy": null,
      "createdAt": "2026-02-10T00:00:00.000Z"
    }
  ],
  "myRedemptions": [
    {
      "id": 10,
      "rewardId": 1,
      "rewardTitle": "Movie Night Pick",
      "costCoins": 40,
      "status": "requested",
      "redeemedAt": "2026-02-17T18:00:00.000Z"
    }
  ]
}
```

---

### Create Reward

**Endpoint**: `POST /api/rewards` (Admin only)

**Request Body**:
```json
{
  "title": "Extra Dessert",
  "description": "Second serving at dinner",
  "costCoins": 25
}
```

**Response** (201):
```json
{
  "id": 8,
  "title": "Extra Dessert",
  "costCoins": 25,
  "isActive": true,
  "createdBy": 1,
  ...
}
```

---

### Redeem Reward

**Endpoint**: `POST /api/rewards/:id/redeem`

**Response** (200):
```json
{
  "redemption": {
    "id": 12,
    "rewardId": 1,
    "userId": 2,
    "costCoins": 40,
    "status": "requested",
    "redeemedAt": "2026-02-17T19:00:00.000Z"
  },
  "newCoinsBalance": 110
}
```

**Errors**:
- `400`: Insufficient coins
- `404`: Reward not found or inactive

---

### Approve/Reject Redemption

**Endpoint**: `PUT /api/rewards/redemptions/:id` (Admin only)

**Request Body**:
```json
{
  "status": "approved"
}
```

Status options: `approved`, `rejected`

**Response** (200):
```json
{
  "id": 12,
  "status": "approved",
  ...
}
```

**Note**: If rejected, coins are refunded to user.

---

### Cancel Redemption

**Endpoint**: `POST /api/rewards/redemptions/:id/cancel` (Self only)

**Response** (200):
```json
{
  "id": 12,
  "status": "cancelled",
  ...
}
```

**Note**: Coins are refunded.

---

## 🎖️ Achievements

### Get Achievements

**Endpoint**: `GET /api/achievements`

**Response** (200):
```json
{
  "myAchievements": [
    {
      "id": "tasks_10",
      "name": "Cleaner",
      "description": "Complete 10 tasks",
      "icon": "✨",
      "unlockedAt": "2026-02-15T10:00:00.000Z"
    }
  ],
  "allAchievements": [
    {
      "id": "tasks_1",
      "name": "Starter",
      "description": "Complete your first task",
      "icon": "🌟",
      "unlocked": true
    },
    {
      "id": "streak_30",
      "name": "Legend",
      "description": "Maintain a 30-day streak",
      "icon": "👑",
      "unlocked": false
    }
  ]
}
```

**Note**: `allAchievements` only returned for admins.

**cURL Example**:
```bash
curl -X GET http://localhost:3020/api/achievements \
  -H "Authorization: Bearer <your-token>"
```

---

## 📤 Data Export/Import

### Export Data

**Endpoint**: `GET /api/export` (Admin only)

**Response** (200):
```json
{
  "version": "1.0",
  "exportedAt": "2026-02-17T20:00:00.000Z",
  "users": [...],
  "rooms": [...],
  "tasks": [...],
  "taskCompletions": [...],
  "rewards": [...],
  "rewardRedemptions": [...],
  "appSettings": [...]
}
```

**cURL Example**:
```bash
curl -X GET http://localhost:3020/api/export \
  -H "Authorization: Bearer <admin-token>" \
  -o backup.json
```

---

### Import Data

**Endpoint**: `POST /api/import` (Admin only)

**Request Body**: Full JSON export (same structure as export)

Importing replaces all existing data. Password hashes are never exported or imported: the importing admin keeps their password, anyone whose username already exists on this server keeps their current password, and new people get a random password that an admin must reset.

**Response** (200):
```json
{
  "success": true,
  "imported": {
    "users": 3,
    "rooms": 5,
    "tasks": 42,
    "taskCompletions": 250,
    "rewards": 10,
    "rewardRedemptions": 15
  }
}
```

**Warning**: This will CLEAR and REPLACE all data.

**cURL Example**:
```bash
curl -X POST http://localhost:3020/api/import \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d @backup.json
```

---

## ❌ Error Responses

All errors follow this format:

```json
{
  "error": "Descriptive error message"
}
```

**Common HTTP Status Codes**:

| Code | Meaning | Example |
|------|---------|---------|
| 400 | Bad Request | Missing required field |
| 401 | Unauthorized | Invalid or missing JWT token |
| 403 | Forbidden | Not admin or not owner |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Username already exists |
| 500 | Server Error | Database or internal error |

---

## 🔔 Rate Limiting

Currently **no rate limiting** is implemented. For production deployments, consider using a reverse proxy (Nginx, Caddy) with rate limiting configured.

---

## 📝 Notes

- All timestamps are in ISO 8601 format (UTC)
- JWT tokens expire after **30 days**
- Pagination uses `limit` and `offset` query parameters
- File uploads (avatars) limited to **2MB**
- Accepted image types: `image/*` (MIME type check)

---

**Need help?** Open an issue on [GitHub Issues](https://github.com/mellow-fox/TidyQuest/issues)
