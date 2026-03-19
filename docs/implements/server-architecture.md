# 服务端技术架构（当前实现）

本文档的实现描述以 Node.js 作为后端语言。

本文基于当前代码实现，描述 DeskGame Backend 的服务端技术架构。当前仓库同时提供 HTTP 和 WebSocket 两种接入方式，运行态以单进程内存存储为主；Redis、PostgreSQL 和鉴权属于后续演进方向，不是本仓库当前已落地能力。

## 1. 架构目标与原则

- 权威状态：服务器是唯一真相来源，所有阶段与结算以服务端计算为准。
- 低延迟同步：押牌提交、阶段推进、结算广播需实时推送。
- 可复验：发牌、环境牌序列等随机结果需可复验（同种子同输入）。
- 阶段可控：阶段严格单向推进，不可回退。
- 可扩展：当前为单机内存模型，结构上保留向多实例演进的空间。

## 2. 总体架构

- HTTP 接入层
  - Express 路由将 JSON 请求映射到 Room 聚合命令。
- WebSocket 接入层
  - Socket.IO 接收 `command` 消息，转发为 Room 聚合命令，并把领域事件广播为 `event`。
- 实时房间服务（Room Service）
  - `Room` 聚合维护房间、玩家、准备状态、身份选择、回合与阶段状态。
- 规则与结算服务（Settlement Service）
  - 执行伤害结算、票权计算、不押牌惩罚、淘汰与胜负判断。
- 牌堆与发牌服务（Deck/Deal Service）
  - 生成环境牌序列、候选角色组，支持可复验随机。
- 复盘与记录服务（Match Service）
  - 当前仓库已有 `Match` 聚合定义，但未实现持久化复盘输出链路。
- 内存存储层
  - HTTP 使用 `RoomStore = Map<string, Room>`。
  - WebSocket 使用 `RoomRegistry` 管理 `Room` 实例。

## 3. 通信模型

### 3.1 HTTP 模型

HTTP 接口通过 REST 风格命令入口驱动房间状态，例如：

- `POST /rooms`
- `POST /rooms/:roomId/players`
- `POST /rooms/:roomId/config`
- `POST /rooms/:roomId/ready`
- `POST /rooms/:roomId/role-selection`
- `POST /rooms/:roomId/bets`
- `POST /rooms/:roomId/votes`
- `POST /rooms/:roomId/stage/advance`
- `GET /rooms/:roomId`

每次写请求直接执行聚合命令，并返回：

- `events`：当前命令产生的未提交领域事件
- `room`：最新房间快照

### 3.2 WebSocket 消息协议

统一消息结构，便于幂等与追踪。

```json
{
  "type": "COMMAND|EVENT|ERROR",
  "name": "CreateRoom",
  "requestId": "uuid",
  "payload": {}
}
```

- COMMAND：客户端请求（准备、确认角色、押牌、投票、房主改配置）。
- EVENT：服务端推送（领域事件、阶段变更、结算结果）。
- ERROR：错误响应（校验失败、状态冲突）。

Socket.IO 事件名固定为：

- 客户端到服务端：`command`
- 服务端到客户端：`event`
- 服务端错误：`error`

### 3.3 当前命令集与关键事件

当前实现支持的命令：

- `CreateRoom`
- `JoinRoom`
- `LeaveRoom`
- `UpdateRoomConfig`
- `SetReady`
- `ConfirmRoleSelection`
- `SubmitBet`
- `SubmitVote`
- `AdvanceStage`

- RoomCreated / PlayerJoinedRoom / PlayerRemovedFromRoom
- RoomConfigUpdated / PlayerReadyStateChanged
- RoleSelectionStarted / RoleSelectionCompleted
- BetSubmitted / EnvironmentRevealed / StageAdvanced
- RoundSettled / PlayerEliminated / VoteSubmitted / VoteResolved
- WinnerDecided

当前 WebSocket 广播的是领域事件增量，不自动附带完整快照；客户端如需兜底同步，应调用 HTTP 快照接口拉取最新房间状态。

## 4. 领域模型映射

- Room 聚合：房间核心状态、配置、准备、身份选择、回合阶段、环境牌序列、事件缓冲与幂等请求记录。
- Player 实体：座位号、候选身份、最终身份、押牌状态、票权与投票目标。
- Round 结构：押牌提交、行动记录、投票提交、投票结果与结算结果。
- Match 聚合：类型层面的对局聚合，当前主流程仍由 `Room` 直接驱动。

领域服务对应实现：
- DealService：生成候选身份。
- EnvironmentDeckService：生成环境牌序列。
- StageFlowService：推进阶段与最终回合判断。
- SettlementService：伤害结算与票权计算。
- WinnerJudgementService：胜利判定。

## 5. 状态管理与阶段推进

- 每个 Room 维护 `currentStage` 与 `currentRound`。
- 阶段推进采用有限状态机，严格按顺序推进：
  - lobby -> roleSelection -> bet -> action -> settlement -> discussionVote -> review
- 大厅阶段校验：
  - 仅房主可更新配置。
  - 所有人 ready 后自动进入身份选择。
- 身份选择阶段校验：
  - 每名玩家只能从自己的候选身份中选择。
  - 全员确认后自动进入 `bet`，并初始化环境牌堆与第 1 回合。
- 押牌与投票均需校验：
  - 玩家存活、阶段匹配、提交后不可修改。
  - 不押牌玩家本回合不可发言且不可投票。
- `advanceStage` 负责从 `bet -> action -> settlement -> discussionVote` 和回合切换。
- 结算由服务端集中执行并广播结果。

## 6. 当前存储实现

当前仓库没有真正落库，所有状态都在进程内存中：

- HTTP 模式下，`createApp()` 内部使用 `Map<string, Room>` 保存房间实例
- WebSocket 模式下，`RoomRegistry` 保存房间实例
- Socket 会话关系由 `RoomGateway.sessions` 保存 `socketId -> { roomId, openId }`

这意味着：

- 服务重启会丢失房间和对局数据
- HTTP 与 WebSocket 默认不共享房间存储，除非在上层手动注入同一份 store / registry
- 当前适合本地联调、规则开发和原型验证

## 7. 数据库存储设计（后续演进）

可参考领域文档结构草案，拆为以下表：

- rooms
  - roomId, roomCode, ownerOpenId, gameState, playerCount, roomConfig,
    currentRound, currentStage, envDeck, version, createdAt
- players
  - roomId, openId, nickname, avatar, seatNo, candidateRoles,
    selectedRole, hp, votePower, isAlive, selectedAction, passedBet,
    voteTarget, isReady, joinTime
- rounds
  - roomId, round, environmentCard, betSubmissions (jsonb),
    actionLogs (jsonb), voteSubmissions (jsonb), voteResult (jsonb),
    settlementResult (jsonb)
- matches
  - matchId, roomId, rounds (jsonb), winnerResult (jsonb)

> 若采用事件溯源，可将领域事件追加到 events 表并异步构建快照。

## 8. Redis 可选方案

在多实例或高并发场景下启用：

- 房间热状态缓存
  - Key: room:{roomId}，TTL 与版本号控制。
- 分布式锁
  - 结算与阶段推进需要互斥（room:{roomId}:lock）。
- Pub/Sub
  - 多实例间广播 EVENT（room:{roomId}:event）。
- 限流与防刷
  - 连接级别与消息级别速率限制。

单机模式下可仅使用内存状态与单实例广播。

## 9. 一致性与并发策略

- 房间级串行化：同一房间内的命令按顺序处理。
- 版本单调递增：每次成功命令都会推动 `Room.version` 增加。
- 幂等处理：`Room` 聚合记录 `requestId`，同一请求不会重复执行。

当前实现没有对外暴露 `roomVersion` 入参校验，也没有跨进程并发保护。

## 10. 安全与鉴权

当前仓库尚未接入真实鉴权。

当前约束只有：

- `openId` 由客户端传入，服务端按其作为玩家标识处理
- 房主权限由 `Room.ownerOpenId` 判定
- 角色候选列表和玩家完整快照会出现在服务端返回中，尚未做面向不同客户端的字段裁剪

如果要上线，需要至少补齐：

- 登录态与签名校验
- 用户身份绑定
- 房间访问控制
- 针对不同客户端的敏感字段脱敏

## 11. 可观测性与运维

- 结构化日志：按 roomId 与 requestId 关联。
- 指标：在线连接数、房间数、平均延迟、阶段耗时。
- 追踪：关键命令与结算步骤打点。

当前代码中尚未完整实现上述观测链路。

## 12. 容错与恢复

- 断线重连：客户端可通过 HTTP 快照接口重新拉取房间状态。
- 超时推进：StageFlowService 支持超时自动进入下一阶段。

当前没有自动恢复、事件重放和持久化优先机制。

## 13. 对应领域约束对照

- 玩家数 5-10：创建/加入时校验。
- 阶段不可回退：StageFlowService 单向约束。
- 身份未确认不可开局：RoleSelectionCompleted 前置校验。
- 不押牌不可投票：VoteSubmitted 前置校验。
- hp <= 0 必须出局：SettlementService 统一处理。
- 胜负判定实时执行：WinnerJudgementService 在每次结算后运行。
