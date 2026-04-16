# DeskGame Backend

DeskGame Backend 是一个基于 TypeScript、Express 和 Socket.IO 的多人桌游后端原型，负责房间管理、阶段推进、身份选择、押牌结算、讨论投票和胜负判定。

## 当前能力

- 房间创建、加入、离开与快照查询
- 房主开局与阶段推进
- 身份候选确认、押牌与行动分阶段执行
- 候选身份选择、8 回合环境牌与押牌流程
- 服务端统一结算、淘汰与投票结果广播
- HTTP 接口与 WebSocket 指令两套接入方式
- 内存态运行，便于本地联调与规则验证

## 核心流程

当前实现对齐文档中的新流程：

`preparation -> bet -> environment -> action -> damage -> talk -> vote -> [tieBreak] -> settlement`

平票分支：

`vote -> tieBreak -> vote`

状态含义：

- `preparation`：准备/发牌阶段，包含候选角色确认
- `bet`：玩家提交押牌动作
- `environment`：揭示环境牌
- `action`：行动阶段执行动作
- `damage`：伤害结算
- `talk`：发言阶段
- `vote`：投票阶段
- `tieBreak`：平票重投阶段
- `settlement`：结算淘汰、胜负判定与层数推进

## 目录

- [src/server](src/server)：HTTP 服务入口与路由
- [src/gateway](src/gateway)：Socket.IO 网关与消息协议
- [src/domain](src/domain)：聚合、实体、领域服务、事件与类型
- [docs/flows/room-flow.zh-CN.md](docs/flows/room-flow.zh-CN.md)：业务流程基准文档
- [docs/接入文档.md](docs/%E6%8E%A5%E5%85%A5%E6%96%87%E6%A1%A3.md)：HTTP / WebSocket 接入说明
- [docs/domain/README.md](docs/domain/README.md)：领域模型说明

## 环境要求

- Node.js 18+
- pnpm 9+

## 安装与启动

```bash
pnpm install
pnpm dev
```

默认监听端口为 `3000`，可通过环境变量 `PORT` 覆盖：

```bash
PORT=3100 pnpm dev
```

生产构建与启动：

```bash
pnpm build
pnpm start
```

运行测试：

```bash
pnpm test
```

## Vercel 部署

仓库已经补齐 Vercel 所需的最小配置：

- `public/index.html`：作为公开可访问的根入口页
- `api/index.js`：将现有 Express 应用暴露给 Vercel Node Runtime
- `vercel.json`：把 `/rooms`、`/api/*`、`/admin/*` 重写到同一个服务入口
- `prisma/schema.prisma` 中的 `PersistedRoom`：用于通过 Prisma 把房间快照落到 Vercel Postgres
- `.env.example`：整理了需要同步到 Vercel 的环境变量

### 推荐的 Vercel 构建 / 启动命令

```bash
npm run vercel-build
npm run vercel-start
```

其中：

- `vercel-build` 会执行 `prisma generate`、`prisma migrate deploy` 和 TypeScript 构建
- `vercel-start` 保持与当前生产启动命令一致

### 需要上传到 Vercel 的环境变量

至少配置以下变量：

```bash
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/deskgame?sslmode=require
ADMIN_AUTH_USERNAME=desk-admin
ADMIN_AUTH_PASSWORD=replace-with-a-strong-password
```

可选变量：

```bash
PORT=3000
ADMIN_ID=admin-1
ADMIN_NAME=运营管理员
ADMIN_EMAIL=ops@example.com
ADMIN_AVATAR=https://example.com/avatar.png
ADMIN_USERS='[{"id":"ops-1","name":"运营管理员","email":"ops@example.com","avatar":"https://example.com/avatar.png"}]'
```

> 说明：Vercel 运行时本身不提供 PM2 这样的常驻进程管理能力，因此线上重启由 Vercel 平台负责；仓库内提供的是 Vercel 可直接使用的构建、路由和 Prisma 存储接入配置。

## 管理后台

启动服务后，可通过 `http://localhost:3000/admin` 打开后台单页应用。
后台页面会每 15 秒自动刷新一次房间与用户概览。

后台提供以下能力：

- 用户列表
- 在线人数统计
- 活跃房间数量
- 活跃房间列表
- 将 `docs/接入文档.md` 转换后展示为 API 文档

管理员信息从环境变量读取，支持两种方式：

1. 单管理员变量：

```bash
ADMIN_NAME=运营管理员
ADMIN_EMAIL=ops@example.com
ADMIN_AVATAR=https://example.com/avatar.png
```

2. 多管理员 JSON：

```bash
ADMIN_USERS='[
  {
    "id": "ops-1",
    "name": "运营管理员",
    "email": "ops@example.com",
    "avatar": "https://example.com/avatar.png"
  }
]'
```

后台访问受 HTTP Basic Auth 保护，需额外配置：

```bash
ADMIN_AUTH_USERNAME=desk-admin
ADMIN_AUTH_PASSWORD=replace-with-a-strong-password
```

## HTTP 接入概览

基础地址示例：`http://localhost:3000`

主要接口：

- `POST /rooms` 创建房间
- `POST /rooms/:roomId/players` 加入房间
- `DELETE /rooms/:roomId/players/:openId` 离开房间
- `POST /rooms/:roomId/start` 开始游戏
- `POST /rooms/:roomId/role-selection` 确认身份选择
- `POST /rooms/:roomId/actions` 提交押牌（仅 bet 阶段）
- `POST /rooms/:roomId/environment/reveal` 揭示环境牌
- `POST /rooms/:roomId/votes` 提交投票
- `POST /rooms/:roomId/stage/advance` 推进阶段
- `GET /rooms/:roomId` 获取房间快照

完整请求体、响应约定和联调顺序见 [docs/接入文档.md](docs/%E6%8E%A5%E5%85%A5%E6%96%87%E6%A1%A3.md)。

房间快照的主键字段为 `room.roomId`，不是 `room.id`。

## 最小联调示例

### 使用 curl 创建房间并查询快照

创建房间：

```bash
curl -X POST http://localhost:3000/rooms \
  -H 'Content-Type: application/json' \
  -d '{
    "ownerOpenId": "owner-001",
    "ruleSetCode": "classic-5p",
    "deckTemplateCode": "default-8-floor",
    "requestId": "req-create-room"
  }'
```

返回结果里的 `room.roomId` 可直接用于后续请求：

```bash
curl http://localhost:3000/rooms/<roomId>
```

加入房间：

```bash
curl -X POST http://localhost:3000/rooms/<roomId>/players \
  -H 'Content-Type: application/json' \
  -d '{
    "openId": "player-002",
    "nickname": "Bob",
    "avatar": "",
    "requestId": "req-join-room"
  }'
```

房主开始游戏：

```bash
curl -X POST http://localhost:3000/rooms/<roomId>/start \
  -H 'Content-Type: application/json' \
  -d '{
    "openId": "owner-001",
    "requestId": "req-start"
  }'
```

### 使用 Socket.IO 客户端发送命令

```ts
import { io } from "socket.io-client";

const socket = io("http://localhost:3000");

socket.on("connect", () => {
  socket.emit("command", {
    type: "COMMAND",
    name: "CreateRoom",
    requestId: "req-create-room",
    payload: {
      ownerOpenId: "owner-001",
      ruleSetCode: "classic-5p",
      deckTemplateCode: "default-8-floor",
    },
  });
});

socket.on("event", (message) => {
  console.log("EVENT", message.name, message.payload);
});

socket.on("error", (message) => {
  console.error("ERROR", message.payload);
});
```

### 使用 Socket.IO 跑一条最小完整流程

推荐按以下顺序联调：

1. `CreateRoom` / `JoinRoom`
2. `StartGame`
3. 所有玩家 `ConfirmRoleSelection`
4. `SubmitAction`（bet 阶段押牌）
5. `AdvanceStage` 到 `environment` 并 `RevealEnvironment`
6. 多次调用 `AdvanceStage`，依次推进到 `damage`、`talk`、`vote`（`action` 阶段由服务端执行，不需要再次 `SubmitAction`）
7. 在 `vote` 阶段执行 `SubmitVote`
8. 如有必要，再调用 `AdvanceStage` 进入 `tieBreak` 后重投，并继续推进到 `settlement`

完整字段与示例请参考 [docs/接入文档.md](docs/%E6%8E%A5%E5%85%A5%E6%96%87%E6%A1%A3.md)。

建议联调时至少监听这些事件：

- `RoomCreated`
- `PlayerJoinedRoom`
- `RoleSelectionStarted`
- `RoleSelectionCompleted`
- `EnvironmentRevealed`
- `RoundSettled`
- `VoteResolved`
- `WinnerDecided`

## WebSocket 接入概览

Socket.IO 统一消息结构：

```json
{
  "type": "COMMAND",
  "name": "CreateRoom",
  "requestId": "req-001",
  "payload": {}
}
```

客户端发送：

- 事件名固定为 `command`
- `payload` 按命令名变化

服务端返回：

- `event`：领域事件广播
- `error`：命令校验或状态错误

事件名与 payload 定义见 [src/gateway/types.ts](src/gateway/types.ts) 与 [docs/接入文档.md](docs/%E6%8E%A5%E5%85%A5%E6%96%87%E6%A1%A3.md)。

## 当前实现边界

- 当前房间和对局数据存储在内存中，服务重启后不会保留
- 尚未接入鉴权、数据库持久化和分布式房间协调
- 适合规则验证、接口联调和前后端原型开发

## 开发说明

- 规则核心位于 [src/domain/aggregates/Room.ts](src/domain/aggregates/Room.ts)
- HTTP 网关位于 [src/server/app.ts](src/server/app.ts)
- WebSocket 网关位于 [src/gateway/RoomGateway.ts](src/gateway/RoomGateway.ts)
- 当前测试覆盖领域服务、边界条件、网关和服务端接口

如需先做前后端联调，优先阅读 [docs/接入文档.md](docs/%E6%8E%A5%E5%85%A5%E6%96%87%E6%A1%A3.md)。
