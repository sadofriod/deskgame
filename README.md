# DeskGame Backend

DeskGame Backend 是一个基于 TypeScript、Express 和 Socket.IO 的多人桌游后端原型，负责房间管理、阶段推进、身份选择、押牌结算、讨论投票和胜负判定。

## 当前能力

- 房间创建、加入、离开与快照查询
- 房主修改房间配置
- 玩家准备后自动进入身份选择
- 候选身份选择、8 回合环境牌与押牌流程
- 服务端统一结算、淘汰与投票结果广播
- HTTP 接口与 WebSocket 指令两套接入方式
- 内存态运行，便于本地联调与规则验证

## 核心流程

当前实现对齐文档中的新流程：

`lobby -> roleSelection -> bet -> action -> settlement -> discussionVote -> review`

状态含义：

- `lobby`：大厅阶段，配置房间、玩家加入、准备
- `roleSelection`：服务端发候选身份，玩家确认身份
- `bet`：玩家提交押牌动作或选择不押牌
- `action`：回合动作阶段，由房主或超时推进
- `settlement`：服务端按环境牌和押牌结果统一结算
- `discussionVote`：存活且有资格的玩家发言、投票
- `review`：游戏结束，等待复盘或清理

## 目录

- [src/server](src/server)：HTTP 服务入口与路由
- [src/gateway](src/gateway)：Socket.IO 网关与消息协议
- [src/domain](src/domain)：聚合、实体、领域服务、事件与类型
- [docs/核心业务流程（优化版）.md](docs/%E6%A0%B8%E5%BF%83%E4%B8%9A%E5%8A%A1%E6%B5%81%E7%A8%8B%EF%BC%88%E4%BC%98%E5%8C%96%E7%89%88%EF%BC%89.md)：业务流程基准文档
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
- `POST /rooms/:roomId/config` 更新房间配置
- `POST /rooms/:roomId/ready` 设置准备状态
- `POST /rooms/:roomId/role-selection` 确认身份选择
- `POST /rooms/:roomId/bets` 提交押牌
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
    "roomConfig": {
      "playerCount": 5,
      "roleConfig": "independent"
    },
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

设置 ready：

```bash
curl -X POST http://localhost:3000/rooms/<roomId>/ready \
  -H 'Content-Type: application/json' \
  -d '{
    "openId": "player-002",
    "ready": true,
    "requestId": "req-ready"
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
      roomConfig: {
        playerCount: 5,
        roleConfig: "independent",
      },
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

下面这个示例会启动 5 个客户端连接，按顺序完成：

1. 房主创建房间
2. 4 名玩家加入
3. 5 人全部 ready
4. 根据 `RoleSelectionStarted` 中的候选身份确认角色
5. 全员提交押牌
6. 房主连续推进到 `discussionVote`

```ts
import { io, Socket } from "socket.io-client";

type CommandMessage = {
  type: "COMMAND";
  name: string;
  requestId: string;
  payload: Record<string, unknown>;
};

type EventMessage = {
  type: "EVENT";
  name: string;
  roomId?: string;
  payload: any;
};

const BASE_URL = "http://localhost:3000";
const players = ["owner-001", "player-001", "player-002", "player-003", "player-004"];
const sockets = new Map<string, Socket>();

let roomId = "";
const eventLog: EventMessage[] = [];

function connectPlayer(openId: string): Promise<Socket> {
  return new Promise((resolve) => {
    const socket = io(BASE_URL, { autoConnect: false });
    sockets.set(openId, socket);
    socket.on("connect", () => resolve(socket));
    socket.on("event", (message: EventMessage) => {
      eventLog.push(message);
      console.log(openId, "<= EVENT", message.name, message.payload);

      if (message.name === "RoomCreated") {
        roomId = message.payload.roomId;
      }
    });
    socket.on("error", (message) => {
      console.error(openId, "<= ERROR", message.payload);
    });
    socket.connect();
  });
}

function send(openId: string, message: CommandMessage) {
  sockets.get(openId)?.emit("command", message);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForEvent(name: string, predicate?: (message: EventMessage) => boolean): Promise<EventMessage> {
  for (;;) {
    const found = eventLog.find((item) => item.name === name && (predicate ? predicate(item) : true));
    if (found) {
      return found;
    }
    await sleep(50);
  }
}

async function main() {
  for (const openId of players) {
    await connectPlayer(openId);
  }

  send("owner-001", {
    type: "COMMAND",
    name: "CreateRoom",
    requestId: "create-room",
    payload: {
      ownerOpenId: "owner-001",
      roomConfig: { playerCount: 5, roleConfig: "independent" },
    },
  });

  await waitForEvent("RoomCreated");

  for (const openId of players.slice(1)) {
    send(openId, {
      type: "COMMAND",
      name: "JoinRoom",
      requestId: `join-${openId}`,
      payload: { roomId, openId, nickname: openId, avatar: "" },
    });
  }

  while (eventLog.filter((item) => item.name === "PlayerJoinedRoom").length < 4) {
    await sleep(50);
  }

  for (const openId of players) {
    send(openId, {
      type: "COMMAND",
      name: "SetReady",
      requestId: `ready-${openId}`,
      payload: { roomId, openId, ready: true },
    });
  }

  const roleSelectionStarted = await waitForEvent("RoleSelectionStarted");
  for (const item of roleSelectionStarted.payload.candidateRoles as Array<{ openId: string; roles: string[] }>) {
    send(item.openId, {
      type: "COMMAND",
      name: "ConfirmRoleSelection",
      requestId: `select-${item.openId}`,
      payload: { roomId, openId: item.openId, roleId: item.roles[0] },
    });
  }

  await waitForEvent("RoleSelectionCompleted");

  for (const openId of players) {
    send(openId, {
      type: "COMMAND",
      name: "SubmitBet",
      requestId: `bet-${openId}`,
      payload: { roomId, openId, actionCard: "listen" },
    });
  }

  while (eventLog.filter((item) => item.name === "BetSubmitted").length < 5) {
    await sleep(50);
  }

  send("owner-001", {
    type: "COMMAND",
    name: "AdvanceStage",
    requestId: "advance-bet-to-action",
    payload: { roomId, openId: "owner-001" },
  });

  await waitForEvent("EnvironmentRevealed");

  send("owner-001", {
    type: "COMMAND",
    name: "AdvanceStage",
    requestId: "advance-action-to-settlement",
    payload: { roomId, openId: "owner-001" },
  });

  await waitForEvent("RoundSettled");

  send("owner-001", {
    type: "COMMAND",
    name: "AdvanceStage",
    requestId: "advance-settlement-to-discussionVote",
    payload: { roomId, openId: "owner-001" },
  });

  await waitForEvent(
    "StageAdvanced",
    (message) => message.payload.currentStage === "discussionVote"
  );
  console.log("Reached discussionVote stage for room", roomId);
}

main().catch(console.error);
```

更稳定的按步骤联调方式见 [docs/api-smoke.md](docs/api-smoke.md)。

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
