# 服务端技术架构（WebSocket）

本文档的实现描述以 Node.js 作为后端语言。

本文基于领域文档，描述服务端技术架构方案。核心通信采用 WebSocket，Redis 作为可选技术能力。

## 1. 架构目标与原则

- 权威状态：服务器是唯一真相来源，所有阶段与结算以服务端计算为准。
- 低延迟同步：行动提交、阶段推进、结算广播需实时推送。
- 可复验：发牌、环境牌序列等随机结果需可复验（同种子同输入）。
- 阶段可控：阶段严格单向推进，不可回退。
- 可扩展：支持单机到多实例的演进。

## 2. 总体架构

- 接入层（Gateway）
  - WebSocket 连接管理、鉴权、心跳、基础限流。
- 实时房间服务（Room Service）
  - 维护 Room 聚合、玩家列表与阶段状态。
- 规则与结算服务（Settlement Service）
  - 执行伤害结算、投票结果计算、淘汰与胜负判断。
- 牌堆与发牌服务（Deck/Deal Service）
  - 生成环境牌序列、分配角色，支持可复验随机。
- 复盘与记录服务（Match Service）
  - 记录回合与阶段快照，产出复盘结构。
- 持久化层（Storage）
  - PostgreSQL（存储房间、玩家、回合、事件）。
- 可选 Redis 能力
  - 热状态缓存、房间分片、分布式锁、Pub/Sub。

## 3. 通信模型

### 3.1 WebSocket 消息协议（建议）

统一消息结构，便于幂等与追踪。

```json
{
  "type": "COMMAND|EVENT|ERROR",
  "name": "ActionSubmit",
  "requestId": "uuid",
  "roomId": "String",
  "openId": "String",
  "payload": {}
}
```

- COMMAND：客户端请求（提交行动、投票、准备、房主推进阶段）。
- EVENT：服务端推送（领域事件、阶段变更、结算结果）。
- ERROR：错误响应（校验失败、状态冲突）。

### 3.2 关键事件与推送

- RoomCreated / PlayerJoinedRoom / PlayerRemovedFromRoom
- CardsDealt / RoleSelectionStarted / RoleSelectionCompleted / EnvironmentRevealed
- ActionSubmitted / VoteSubmitted
- StageAdvanced / RoundSettled / PlayerEliminated
- VoteResolved / WinnerDecided

服务端推送必须包含最新房间快照或增量变更，客户端按版本号更新。

## 4. 领域模型映射

- Room 聚合：房间核心状态、阶段、楼层、环境牌序列。
- RoomPlayer：房间座位、准备状态。
- MatchPlayer：身份、角色、血量、票权与可行动状态。
- Round 结构：行动提交、投票提交、伤害、检视与结算结果。
- Match 聚合：回合历史与胜负结果。

领域服务对应实现：
- DealService：生成身份分配。
- EnvironmentDeckService：生成环境牌序列。
- StageFlowService：推进阶段与超时控制。
- SettlementService：伤害结算与票权计算。
- WinnerJudgementService：胜利判定。

## 5. 状态管理与阶段推进

- 每个 Room 维护 `currentStage` 与 `currentFloor`。
- `preparation` 阶段负责角色确认；全部玩家确认后才允许进入 `bet`。
- 阶段推进采用有限状态机，严格按顺序推进：
  - preparation -> bet -> environment -> action -> damage -> talk -> vote -> settlement
  - 若 vote 平票，则进入 tieBreak，再回到 vote。
- 每层 `Round` 在 preparation 阶段先落一行空壳，环境揭示后补齐环境字段。
- 行动提交与投票均需校验：
  - 玩家存活、手牌可用、阶段匹配。
  - 提交后不可修改。
- 同一层允许多条行动提交和最多两轮投票历史，分别用 `sequence` 与 `voteRound` 标识。
- 结算由服务端集中执行并广播结果。

## 6. 数据存储设计（PostgreSQL）

可参考领域文档结构草案，拆为以下表：

- rulesets / identities / identity_distributions / action_cards / environment_cards / roles
  - 静态规则字典，描述身份、牌、人数配置和角色技能。
- rooms / room_players
  - 房间级状态、座位与准备状态。
- matches / match_environment_decks / match_players / match_player_role_options / match_player_action_cards
  - 对局级状态、环境牌序列、身份角色选择与手牌。
- rounds / round_action_submissions / round_action_targets / round_vote_submissions / round_damages / identity_reveals
  - 每层行动、目标、投票、伤害、检视和回合快照。

> 若采用事件溯源，可将领域事件追加到 events 表并异步构建快照。

## 7. Redis 可选方案

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

## 8. 一致性与并发策略

- 房间级串行化：同一房间内的命令按顺序处理。
- 乐观版本控制：命令携带 `roomVersion`，不匹配则拒绝。
- 幂等处理：同一 `requestId` 重复提交应返回相同结果。

## 9. 安全与鉴权

- WebSocket 连接建立时校验 openId 与签名。
- 微信 Auth API 鉴权：
  - 客户端通过微信登录获取 code，服务端以 code 换取会话信息。
  - 服务端校验签名并解析 openId（必要时包含 unionId）。
- 首次使用检测：
  - 以 openId 作为唯一用户标识。
  - 连接建立或首次请求时检查 users 表是否存在该 openId。
  - 不存在则创建用户档案并标记为首次使用（用于新手引导或统计）。
- 房主权限：仅房主可推进阶段与开局。
- 数据最小化推送：身份牌仅对自己可见，广播中需脱敏。

## 10. 可观测性与运维

- 结构化日志：按 roomId 与 requestId 关联。
- 指标：在线连接数、房间数、平均延迟、阶段耗时。
- 追踪：关键命令与结算步骤打点。

## 11. 容错与恢复

- 断线重连：客户端重连后拉取房间快照与当前阶段。
- 超时推进：StageFlowService 支持超时自动进入下一阶段。
- 持久化优先：结算与胜负判定必须落库后再广播。

## 12. 对应领域约束对照

- 玩家数 5-10：创建/加入时校验。
- 阶段不可回退：StageFlowService 单向约束。
- 行动牌为空不可投票：VoteSubmitted 前置校验。
- hp <= 0 必须出局：SettlementService 统一处理。
- 胜负判定实时执行：WinnerJudgementService 在每次结算后运行。
- 活跃人数为 0：按原始规则直接判定屁者获胜。
