# API Smoke Guide

本文档提供一条最小可执行的 HTTP smoke 链路，用于验证房间创建、玩家加入、准备、身份选择、押牌和阶段推进是否正常。

## 前置条件

启动服务：

```bash
pnpm dev
```

默认地址：`http://localhost:3000`

示例约定：

- 房主：`owner-001`
- 其他玩家：`player-001` 到 `player-004`
- 房间配置：5 人局，`roleConfig=independent`

## 1. 创建房间

```bash
curl -X POST http://localhost:3000/rooms \
  -H 'Content-Type: application/json' \
  -d '{
    "ownerOpenId": "owner-001",
    "roomConfig": {
      "playerCount": 5,
      "roleConfig": "independent"
    },
    "requestId": "smoke-create-room"
  }'
```

从响应中记录 `room.roomId`，以下命令统一记为 `<roomId>`。

## 2. 加入 4 名玩家

```bash
curl -X POST http://localhost:3000/rooms/<roomId>/players \
  -H 'Content-Type: application/json' \
  -d '{"openId":"player-001","nickname":"player-001","avatar":"","requestId":"smoke-join-001"}'

curl -X POST http://localhost:3000/rooms/<roomId>/players \
  -H 'Content-Type: application/json' \
  -d '{"openId":"player-002","nickname":"player-002","avatar":"","requestId":"smoke-join-002"}'

curl -X POST http://localhost:3000/rooms/<roomId>/players \
  -H 'Content-Type: application/json' \
  -d '{"openId":"player-003","nickname":"player-003","avatar":"","requestId":"smoke-join-003"}'

curl -X POST http://localhost:3000/rooms/<roomId>/players \
  -H 'Content-Type: application/json' \
  -d '{"openId":"player-004","nickname":"player-004","avatar":"","requestId":"smoke-join-004"}'
```

## 3. 查询房间快照

```bash
curl http://localhost:3000/rooms/<roomId>
```

此时预期：

- `room.playerCount = 5`
- `room.currentStage = "lobby"`
- 房主已经作为第一个玩家存在于 `room.players`

## 4. 5 人全部 ready

```bash
curl -X POST http://localhost:3000/rooms/<roomId>/ready \
  -H 'Content-Type: application/json' \
  -d '{"openId":"owner-001","ready":true,"requestId":"smoke-ready-owner"}'

curl -X POST http://localhost:3000/rooms/<roomId>/ready \
  -H 'Content-Type: application/json' \
  -d '{"openId":"player-001","ready":true,"requestId":"smoke-ready-001"}'

curl -X POST http://localhost:3000/rooms/<roomId>/ready \
  -H 'Content-Type: application/json' \
  -d '{"openId":"player-002","ready":true,"requestId":"smoke-ready-002"}'

curl -X POST http://localhost:3000/rooms/<roomId>/ready \
  -H 'Content-Type: application/json' \
  -d '{"openId":"player-003","ready":true,"requestId":"smoke-ready-003"}'

curl -X POST http://localhost:3000/rooms/<roomId>/ready \
  -H 'Content-Type: application/json' \
  -d '{"openId":"player-004","ready":true,"requestId":"smoke-ready-004"}'
```

再次查询：

```bash
curl http://localhost:3000/rooms/<roomId>
```

此时预期：

- `room.currentStage = "roleSelection"`
- 每个玩家对象上都有 `candidateRoles`

## 5. 确认身份

先查一次房间快照，记录每个玩家的 `candidateRoles`：

```bash
curl http://localhost:3000/rooms/<roomId>
```

然后对每个玩家，从自己的 `candidateRoles` 中任选一个提交。下面示例统一取第一个候选身份，实际请替换为快照里看到的值。

```bash
curl -X POST http://localhost:3000/rooms/<roomId>/role-selection \
  -H 'Content-Type: application/json' \
  -d '{"openId":"owner-001","roleId":"<owner-role>","requestId":"smoke-role-owner"}'

curl -X POST http://localhost:3000/rooms/<roomId>/role-selection \
  -H 'Content-Type: application/json' \
  -d '{"openId":"player-001","roleId":"<player-001-role>","requestId":"smoke-role-001"}'

curl -X POST http://localhost:3000/rooms/<roomId>/role-selection \
  -H 'Content-Type: application/json' \
  -d '{"openId":"player-002","roleId":"<player-002-role>","requestId":"smoke-role-002"}'

curl -X POST http://localhost:3000/rooms/<roomId>/role-selection \
  -H 'Content-Type: application/json' \
  -d '{"openId":"player-003","roleId":"<player-003-role>","requestId":"smoke-role-003"}'

curl -X POST http://localhost:3000/rooms/<roomId>/role-selection \
  -H 'Content-Type: application/json' \
  -d '{"openId":"player-004","roleId":"<player-004-role>","requestId":"smoke-role-004"}'
```

再次查询：

```bash
curl http://localhost:3000/rooms/<roomId>
```

此时预期：

- `room.gameState = "playing"`
- `room.currentStage = "bet"`
- `room.currentRound = 1`
- `room.envDeck` 已生成

## 6. 提交押牌

全部玩家提交合法动作牌。可用动作牌包括：

- `listen`
- `blow`
- `grab`
- `endure`
- `suck`
- `scold`

示例统一使用 `listen`：

```bash
curl -X POST http://localhost:3000/rooms/<roomId>/bets \
  -H 'Content-Type: application/json' \
  -d '{"openId":"owner-001","actionCard":"listen","requestId":"smoke-bet-owner"}'

curl -X POST http://localhost:3000/rooms/<roomId>/bets \
  -H 'Content-Type: application/json' \
  -d '{"openId":"player-001","actionCard":"listen","requestId":"smoke-bet-001"}'

curl -X POST http://localhost:3000/rooms/<roomId>/bets \
  -H 'Content-Type: application/json' \
  -d '{"openId":"player-002","actionCard":"listen","requestId":"smoke-bet-002"}'

curl -X POST http://localhost:3000/rooms/<roomId>/bets \
  -H 'Content-Type: application/json' \
  -d '{"openId":"player-003","actionCard":"listen","requestId":"smoke-bet-003"}'

curl -X POST http://localhost:3000/rooms/<roomId>/bets \
  -H 'Content-Type: application/json' \
  -d '{"openId":"player-004","actionCard":"listen","requestId":"smoke-bet-004"}'
```

此时预期：

- 当前轮次的 `betSubmissions` 长度为 5
- `room.currentStage` 仍然是 `bet`

## 7. 推进到 action

```bash
curl -X POST http://localhost:3000/rooms/<roomId>/stage/advance \
  -H 'Content-Type: application/json' \
  -d '{"openId":"owner-001","requestId":"smoke-advance-1"}'
```

此时预期：

- 响应里的 `events` 同时包含 `EnvironmentRevealed` 和 `StageAdvanced`
- `room.currentStage = "action"`

## 8. 推进到 settlement

```bash
curl -X POST http://localhost:3000/rooms/<roomId>/stage/advance \
  -H 'Content-Type: application/json' \
  -d '{"openId":"owner-001","requestId":"smoke-advance-2"}'
```

此时预期：

- 响应里的 `events` 包含 `RoundSettled`
- `room.currentStage = "settlement"`

## 9. 推进到 discussionVote

```bash
curl -X POST http://localhost:3000/rooms/<roomId>/stage/advance \
  -H 'Content-Type: application/json' \
  -d '{"openId":"owner-001","requestId":"smoke-advance-3"}'
```

此时预期：

- `room.currentStage = "discussionVote"`

## 10. 可选：提交投票并进入下一回合

如果你要继续验证投票流程，可以让所有仍有投票资格的玩家投给同一个目标，以避免平票。

```bash
curl -X POST http://localhost:3000/rooms/<roomId>/votes \
  -H 'Content-Type: application/json' \
  -d '{"openId":"owner-001","voteTarget":"player-004","requestId":"smoke-vote-owner"}'
```

其他有投票权的玩家重复同样的调用后，再由房主推进：

```bash
curl -X POST http://localhost:3000/rooms/<roomId>/stage/advance \
  -H 'Content-Type: application/json' \
  -d '{"openId":"owner-001","requestId":"smoke-advance-vote"}'
```

如果未触发终局，预期：

- 响应里的 `events` 包含 `VoteResolved` 和 `StageAdvanced`
- `room.currentRound = 2`
- `room.currentStage = "bet"`

## 11. 常见失败点

- `400 Only the room owner can perform this operation`
  - 说明非房主调用了更新配置或推进阶段接口
- `400 Room can only be modified in lobby stage`
  - 说明在非大厅阶段尝试加入、改配置或 ready
- `400 Role <x> is not available for player <y>`
  - 说明提交了不属于该玩家候选列表的身份
- `400 Cannot submit bet: not in bet stage`
  - 说明押牌时机不对
- `400 Player <x> has no vote right this round`
  - 说明该玩家本回合不具备投票资格，通常是未押牌或已淘汰

## 12. 参考文档

- [README.md](README.md)
- [docs/接入文档.md](%E6%8E%A5%E5%85%A5%E6%96%87%E6%A1%A3.md)
- [src/server/app.ts](../src/server/app.ts)
- [src/domain/aggregates/Room.ts](../src/domain/aggregates/Room.ts)