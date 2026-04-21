# API 测试用例文档

> 基于 `newtest.py` 实现的端到端游戏流程测试，覆盖 boundary-tests 与 flow-closure-tests 中定义的场景。

---

## 测试环境

| 项目 | 值 |
|---|---|
| 接口基地址 | `https://deskgame.ashesborn.cloud/` |
| 玩家数量 | 6（1 名房主 + 5 名普通玩家） |
| 规则集编码 | `classic_v1` |
| 牌组模板编码 | `classic_pool_v1` |

---

## 测试数据

### 玩家列表

| 序号 | openId | nickname | 备注 |
|---|---|---|---|
| 1 | `player_001` | 玩家1（房主） | 房主，负责房间管理操作 |
| 2 | `player_002` | 玩家2 | 普通玩家 |
| 3 | `player_003` | 玩家3 | 普通玩家 |
| 4 | `player_004` | 玩家4 | 普通玩家 |
| 5 | `player_005` | 玩家5 | 普通玩家 |
| 6 | `player_006` | 玩家6 | 普通玩家 |

---

## 完整游戏流程测试

### TC-001 创建房间

**接口**：`POST /rooms`

**前置条件**：无

**请求体**：
```json
{
  "ownerOpenId": "player_001",
  "ruleSetCode": "classic_v1",
  "deckTemplateCode": "classic_pool_v1",
  "requestId": "req_{uuid}"
}
```

**预期结果**：
- HTTP 状态码 200
- 响应体包含 `room.roomId`（后续步骤复用）
- `room.gameState = wait`
- `room.currentFloor = 1`
- `room.currentStage = preparation`
- 触发事件：`RoomCreated`

**验证边界（来自 boundary-tests）**：
- 缺少 `ownerOpenId` → 拒绝
- 缺少 `ruleSetCode` → 拒绝
- 缺少 `deckTemplateCode` → 拒绝
- `requestId` 必填，支持幂等

---

### TC-002 玩家加入房间

**接口**：`POST /rooms/{roomId}/players`

**前置条件**：TC-001 成功，`gameState = wait`

**执行**：玩家2～玩家6 依次发起请求，每次间隔 0.5s

**请求体示例（玩家2）**：
```json
{
  "openId": "player_002",
  "nickname": "玩家2",
  "avatar": "avatar_2",
  "requestId": "req_{uuid}"
}
```

**预期结果**：
- 每次请求 HTTP 200
- 触发事件：`PlayerJoinedRoom`
- `playerCount` 递增至 6

**验证边界（来自 boundary-tests）**：
- `gameState != wait` → 拒绝
- `playerCount >= 10` → 拒绝
- 重复 `openId` → 拒绝

---

### TC-003 开始游戏

**接口**：`POST /rooms/{roomId}/start`

**前置条件**：TC-002 成功，`playerCount = 6`，请求方为房主

**请求体**：
```json
{
  "openId": "player_001",
  "requestId": "req_{uuid}"
}
```

**预期结果**：
- HTTP 200
- 响应中 `room.match.players` 包含 6 名玩家数据
- 每名玩家具有：
  - `identityCode` 已分配
  - `roleOptions`（角色候选列表，非空）
  - `handCards`（手牌列表，非空）
  - `chosenRoleCode = null`
  - `status.roleSelection = pending`
- 触发事件：`CardsDealt`、`RoleSelectionStarted`
- 创建实体：`Match`、`MatchPlayer`、`MatchPlayerRoleOption`、`MatchPlayerActionCard`、`MatchEnvironmentDeck`、第1层 `Round` shell
- `Round.environmentCard = null`，`Round.roundKind = null`，`Round.currentVoteRound = 1`

**验证边界（来自 boundary-tests）**：
- `openId` 非房主 → 拒绝
- `playerCount < 5` 或 `playerCount > 10` → 拒绝

---

### TC-004 确认角色选择（全员）

**接口**：`POST /rooms/{roomId}/role-selection`

**前置条件**：TC-003 成功，`currentStage = preparation`

**执行**：6 名玩家依次发起请求，每人选择 `roleOptions[0]`

**请求体示例（玩家1）**：
```json
{
  "openId": "player_001",
  "roleCode": "{roleOptions[0]}",
  "requestId": "req_{uuid}"
}
```

**预期结果**：
- 每次请求 HTTP 200
- 触发事件：`RoleSelected`
- 对应 `MatchPlayer` 的 `chosenRoleCode`、`maxHp`、`currentHp` 被填充
- 全员确认后额外触发：`RoleSelectionCompleted`
- 房间可从 `preparation` 推进至 `bet`

**验证边界（来自 boundary-tests）**：
- `currentStage != preparation` → 拒绝
- `roleCode` 不在玩家候选列表中 → 拒绝
- 同一玩家重复确认 → 拒绝

---

### TC-005 推进阶段：preparation → bet

**接口**：`POST /rooms/{roomId}/stage/advance`

**前置条件**：TC-004 全员完成角色选择

**请求体**：
```json
{
  "openId": "player_001",
  "requestId": "req_{uuid}"
}
```

**预期结果**：
- HTTP 200
- `room.currentStage = bet`
- 触发事件：`StageAdvanced`

**验证边界（来自 boundary-tests）**：
- 非房主且无超时标志 → 拒绝
- 未完成全员角色选择时尝试推进 → 拒绝

---

### TC-006 提交押牌（bet 阶段，全员）

**接口**：`POST /rooms/{roomId}/actions`

**前置条件**：TC-005 成功，`currentStage = bet`

**执行**：6 名玩家依次提交手牌第一张，每次间隔 0.5s

**请求体示例（玩家1）**：
```json
{
  "openId": "player_001",
  "cardInstanceId": "{handCards[0].cardInstanceId}",
  "requestId": "req_{uuid}"
}
```

**预期结果**：
- 每次请求 HTTP 200
- 触发事件：`ActionSubmitted`
- 创建 `RoundActionSubmission`，`sequence = 1`，`sourceStage = bet`
- 对应 `MatchPlayerActionCard` 标记为已使用

**验证边界（来自 boundary-tests）**：
- `currentStage != bet` → 拒绝
- 玩家无可用手牌 → 拒绝
- 玩家 `isAlive = false` → 拒绝
- 当前层 `Round` shell 不存在 → 拒绝
- 同一玩家同阶段重复提交 → 幂等处理

---

### TC-007 推进阶段：bet → environment

**接口**：`POST /rooms/{roomId}/stage/advance`

**前置条件**：TC-006 全员押牌完毕

**预期结果**：
- HTTP 200
- `room.currentStage = environment`

---

### TC-008 揭示环境牌

**接口**：`POST /rooms/{roomId}/environment/reveal`

**前置条件**：TC-007 成功，`currentStage = environment`

**请求体**：
```json
{
  "openId": "player_001",
  "requestId": "req_{uuid}"
}
```

**预期结果**：
- HTTP 200
- 触发事件：`EnvironmentRevealed`，包含 `floor` 和 `environmentCard`
- 现有 `Round` 行的 `environmentCard` 和 `roundKind` 被更新（**不创建新 Round 行**）

**验证边界（来自 boundary-tests）**：
- `currentStage != environment` → 拒绝

---

### TC-009 推进阶段：environment → action

**接口**：`POST /rooms/{roomId}/stage/advance`

**前置条件**：TC-008 成功

**预期结果**：
- HTTP 200
- `room.currentStage = action`

---

### TC-009b 提交直出牌（action 阶段，可选）

**接口**：`POST /rooms/{roomId}/actions`

**前置条件**：TC-009 成功，`currentStage = action`，玩家持有具备直出能力的手牌

**请求体示例（玩家1 打出第2张牌，指定目标）**：
```json
{
  "openId": "player_001",
  "cardInstanceId": "{handCards[1].cardInstanceId}",
  "targetOpenId": "player_002",
  "requestId": "req_{uuid}"
}
```

**预期结果**（来自 flow-closure-tests Scenario 3）：
- HTTP 200
- 触发事件：`ActionSubmitted`
- 创建新 `RoundActionSubmission`，`sequence > 1`，`sourceStage = action`
- 同层已有 `sequence = 1`（bet 阶段）的记录仍保留
- 创建 `RoundActionTarget` 行，关联当前 `sequence`
- `SettlementService` 接收按 `sequence` 排序的 `actionSubmissions` 列表

**验证边界**：
- `currentStage != action` → 拒绝
- 玩家 `isAlive = false` → 拒绝
- 卡牌已被消耗（`isUsed = true`）→ 拒绝
- 指定目标 `isAlive = false` → 拒绝

---

### TC-010 推进阶段：action → damage（触发结算）

**接口**：`POST /rooms/{roomId}/stage/advance`

**前置条件**：TC-009 成功，`currentStage = action`

**预期结果**：
- HTTP 200
- `room.currentStage = damage`
- 触发 `SettlementService` 调用（输入：`round`、`environmentCard`、按 `sequence` 排序的 `actionSubmissions`、`players`）
- 触发事件：`RoundSettled`，响应包含：
  - `damages`：各玩家受到的伤害列表
  - `eliminated`：`hp <= 0` 的玩家列表（`isAlive` 标记为 `false`）
  - `identityReveals`：本回合因行动触发的身份揭示记录
  - `playerStateChanges`：禁言（`canSpeak = false`）、禁投（`canVote = false`）等状态变更
- 若结算触发胜负判定（`WinnerJudgementService.isFinal = true`）：额外触发 `WinnerDecided`，`gameState = end`

**结算边界（来自 boundary-tests AdvanceStage Outcome Checks）**：
- 环境伤害优先于行动伤害处理
- 免疫/不可防御规则在扣血前应用
- `hp <= 0` 的玩家立即设为 `isAlive = false`，且不再参与后续阶段行动

---

### TC-011 推进阶段：damage → talk

**接口**：`POST /rooms/{roomId}/stage/advance`

**前置条件**：TC-010 成功，`currentStage = damage`

**预期结果**：
- HTTP 200
- `room.currentStage = talk`

---

### TC-012 推进阶段：talk → vote

**接口**：`POST /rooms/{roomId}/stage/advance`

**前置条件**：TC-011 成功，`currentStage = talk`

**预期结果**：
- HTTP 200
- `room.currentStage = vote`

---

### TC-013 提交投票（vote 阶段，全员）

**接口**：`POST /rooms/{roomId}/votes`

**前置条件**：TC-012 成功，`currentStage = vote`

**执行**：每名玩家投票给下一个玩家（循环），每次间隔 0.5s

**请求体示例（玩家1 投给 玩家2）**：
```json
{
  "openId": "player_001",
  "voteRound": 1,
  "voteTarget": "player_002",
  "votePowerAtSubmit": 1,
  "requestId": "req_{uuid}"
}
```

**预期结果**：
- 每次请求 HTTP 200
- 触发事件：`VoteSubmitted`，包含 `votePowerAtSubmit`
- 创建 `RoundVoteSubmission`，关联当前 `voteRound`

**验证边界（来自 boundary-tests）**：
- `currentStage != vote` → 拒绝
- `voteRound` 与 `Round.currentVoteRound` 不匹配 → 拒绝
- 玩家 `canVote = false` → 拒绝
- tieBreak 重投阶段投给非平局目标 → 拒绝

---

### TC-014 推进阶段：vote → settlement

**接口**：`POST /rooms/{roomId}/stage/advance`

**前置条件**：TC-013 全员投票完毕

**预期结果**（无平局情形）：
- HTTP 200
- `room.currentStage = settlement`
- 触发事件：`VoteResolved`

**平局情形（来自 flow-closure-tests Scenario 4）**：

| 步骤 | 预期行为 |
|---|---|
| 第1轮投票平局 | `VoteResolved`（`voteRound=1, isTie=true`），进入 `tieBreak` |
| tieBreak 完成，重回 vote | `Round.currentVoteRound` 递增至 2，仅平局目标可被投票 |
| 第2轮仍平局 | `VoteResolved`（`voteRound=2, targetOpenId=null, isTie=true`），本层无人被淘汰 |

---

### TC-015 获取房间快照

**接口**：`GET /rooms/{roomId}`

**前置条件**：TC-014 成功

**预期结果**：
- HTTP 200
- 响应体 `room` 包含：
  - `currentStage`：当前阶段
  - `gameState`：游戏状态
  - `roomPlayers`：6 名玩家 openId 列表

---

## 第 2 层回合循环测试（来自 flow-closure-tests Scenario 6）

> 在 TC-014 settlement 无终局胜者后，房间自动推进至第 2 层 `preparation`。以下用例验证完整的第 2 层循环。

### TC-016 推进阶段：settlement → preparation（跨层）

**接口**：`POST /rooms/{roomId}/stage/advance`

**前置条件**：TC-014 成功，`currentStage = settlement`，`WinnerJudgementService.isFinal = false`

**请求体**：
```json
{
  "openId": "player_001",
  "requestId": "req_{uuid}"
}
```

**预期结果**：
- HTTP 200
- `room.currentFloor = 2`
- `room.currentStage = preparation`
- 触发事件：`StageAdvanced`，包含 `VoteResolved` 最终结果
- 创建新 `Round` shell（`floor = 2`，`environmentCard = null`，`roundKind = null`，`currentVoteRound = 1`）
- 第 1 层的 `Round` 数据保留不变
- 所有玩家的 `identityCode` 和 `chosenRoleCode` 保留（不清空）
- 发言/投票临时状态（`canSpeak`、`canVote`）重置为初始值

**验证边界**：
- `WinnerJudgementService.isFinal = true` 时不应推进至下一层
- `currentFloor > 8` → `currentFloor = 9`，仅用于结束状态，不允许继续创建 Round

---

### TC-017 第 2 层押牌（bet 阶段，全员）

**接口**：`POST /rooms/{roomId}/stage/advance` + `POST /rooms/{roomId}/actions`

**前置条件**：TC-016 成功，`currentFloor = 2`，`currentStage = preparation`

**执行步骤**：
1. 由房主推进 `preparation → bet`（预期：`currentStage = bet`）
2. 全员提交手牌第 2 张（若第 1 张已用）或仍存在可用手牌

**预期结果**：
- 每条 `RoundActionSubmission` 的 `sequence = 1`，`sourceStage = bet`，关联 `floor = 2` 的 `Round`
- 第 1 层的 `RoundActionSubmission` 不受影响

---

### TC-018 第 2 层揭示环境牌

**接口**：`POST /rooms/{roomId}/environment/reveal`

**前置条件**：`currentStage = environment`，`currentFloor = 2`

**预期结果**：
- HTTP 200
- `floor = 2` 的 `Round` 行被更新（`environmentCard`、`roundKind`）
- `floor = 1` 的 `Round` 行不受影响
- 触发事件：`EnvironmentRevealed`（`floor = 2`）

---

### TC-019 第 2 层 action → damage 结算

**接口**：`POST /rooms/{roomId}/stage/advance`

**前置条件**：`currentStage = action`，`currentFloor = 2`

**预期结果**：
- HTTP 200
- `room.currentStage = damage`
- 触发事件：`RoundSettled`，`damages` 与 `eliminated` 基于第 2 层数据
- 若本层为气体回合（`roundKind = gas`），则 `resolvedGasRounds` 递增
- 若 `resolvedGasRounds = 4`：触发 `WinnerDecided`，`winnerCamp = fatter`，`gameState = end`

---

### TC-020 第 2 层投票流程（全员）

**接口**：`POST /rooms/{roomId}/votes`

**前置条件**：`currentStage = vote`，`currentFloor = 2`

**执行**：全员投票，验证 `voteRound = 1` 且关联 `floor = 2` 的 `Round`

**预期结果**：
- 每条 `RoundVoteSubmission` 的 `voteRound = 1`，关联 `floor = 2` 的 `Round`
- 第 1 层的投票记录完整保留
- 触发事件：`VoteSubmitted`

---

### TC-021 第 2 层 settlement → 第 3 层（或终局）

**接口**：`POST /rooms/{roomId}/stage/advance`

**前置条件**：`currentStage = vote`，`currentFloor = 2`，全员已投票

**预期结果（无终局）**：
- `currentFloor = 3`，`currentStage = preparation`
- 创建 `floor = 3` 的 `Round` shell

**预期结果（触发终局）**：
- `WinnerJudgementService.isFinal = true`
- 触发事件：`WinnerDecided`，`gameState = end`

---

## gas 回合累积测试（resolvedGasRounds）

> 验证 TC-WIN-04 的触发路径：需连续经过 4 个 gas 类型回合。

### TC-022 gas 回合计数累积

**场景**：连续 4 层的 `roundKind = gas`

**执行方式**：在 TC-016～TC-021 基础上，再循环 2 层，确保每层揭示的 `environmentCard` 为 gas 类型

**预期结果**：
- 第 4 次 `RoundSettled` 后，`resolvedGasRounds = 4`
- 触发 `WinnerDecided`（`winnerCamp = fatter`，`reason = gasRoundsExhausted`）
- `gameState = end`
- 后续任何推进命令均应被拒绝

**验证边界**：
- 非 gas 回合不应递增 `resolvedGasRounds`
- 游戏结束后任何命令 → 拒绝（`gameState = end`）

---

## 第 8 层终局测试

### TC-023 第 8 层结算后 passenger 获胜

**场景**：`currentFloor = 8`，结算后 `alivePassenger > aliveFatter`

**预期结果**：
- `WinnerDecided.winnerCamp = passenger`
- `gameState = end`

### TC-024 第 8 层结算后 fatter 获胜

**场景**：`currentFloor = 8`，结算后 `alivePassenger <= aliveFatter`

**预期结果**：
- `WinnerDecided.winnerCamp = fatter`
- `gameState = end`

---

| 用例编号 | 场景 | 预期 `winnerCamp` |
|---|---|---|
| TC-WIN-01 | 结算后 `alivePassenger <= aliveFatter` | `fatter` |
| TC-WIN-02 | 结算后 `alivePassenger = 0` 且 `aliveFatter = 0` | `fatter` |
| TC-WIN-03 | 第 8 层结算后 `alivePassenger > aliveFatter` | `passenger` |
| TC-WIN-04 | `resolvedGasRounds = 4` | `fatter` |

---

## 跨层流程测试（来自 flow-closure-tests Scenario 6）

**场景**：settlement 结算后无最终胜者，推进至下一层

**预期结果**：
- `currentFloor` 递增 1
- `currentStage` 回到 `preparation`
- 创建新层 `Round` shell，`currentVoteRound = 1`
- 当层言论/投票临时状态重置
- 玩家身份（`identityCode`）和已选角色（`chosenRoleCode`）保留

---

## 通用约束（来自 boundary-tests Cross Cutting）

| 约束 | 描述 |
|---|---|
| 版本递增 | 每个被接受的命令都应使 `version` 自增 |
| 层号范围 | `currentFloor` 范围为 1-8，9 仅用于结束状态 |
| 阶段转换图 | `currentStage` 不允许离开合法转换图；唯一循环为 `tieBreak → vote` |
| 存活判断 | `hp <= 0` 的玩家 `isAlive = false`，不可行动 |
| 全灭判定 | `activePlayers = 0` 判定为 `winnerCamp = fatter` |
| 多次行动 | 同层同玩家可有多条 `ActionSubmission`，以 `sequence` 区分 |
| 投票历史 | tieBreak 发生时，两轮投票记录均须保留 |
| 身份揭示 | `IdentityReveal` 行关联触发揭示的 `RoundActionSubmission.sequence` |
| 结算状态变更 | `SettlementService` 输出的禁言/禁投状态须持久化至 `MatchPlayer` |
| Round 快照 | 每层结算后 `Round.stageSnapshots` 应包含完整的阶段历史，供复盘使用 |
| gas 计数 | 仅 `roundKind = gas` 的层才递增 `resolvedGasRounds`，非 gas 层不变 |
| 游戏结束后操作 | `gameState = end` 后，任何非查询命令均应被拒绝 |

---

## 幂等性测试

| 接口 | 幂等键 | 预期行为 |
|---|---|---|
| `POST /rooms` | `requestId` | 相同 `requestId` 重复提交返回相同结果，不重复创建房间 |
| `POST /rooms/{roomId}/players` | `requestId` | 相同请求不重复加入 |
| `POST /rooms/{roomId}/actions` | `requestId`（玩家+阶段） | 同阶段同玩家重复提交不重复创建 `RoundActionSubmission` |

---

## 缺陷修复清单（待修复后对应测试用例转为回归用例）

> 以下为代码审查中发现的合规性缺陷，每条附对应测试用例编号。

| 编号 | 缺陷描述 | 影响范围 | 对应测试 |
|---|---|---|---|
| BUG-01 | `DealService` 每人仅发 1 张手牌，规则要求 4 张 | StartGame / bet 阶段手牌数量 | TC-FIX-01 |
| BUG-02 | `SettlementService` 未实现 `blow`（吹）效果：有屁回合对相邻玩家造成 1 点伤害 + 抽1张牌 | damage 结算 | TC-FIX-02 |
| BUG-03 | `SettlementService` 未实现 `grab`（抓）效果：有屁回合对1位玩家造成 1 点**不可防御**伤害 | damage 结算 | TC-FIX-03 |
| BUG-04 | `endure`（忍）将 damage 直接置 0，未区分"普通伤害"与"不可防御伤害"（`grab`/`抓` 的伤害 `endure` 不应阻挡） | damage 结算 | TC-FIX-04 |
| BUG-05 | `SettlementService` 未实现 `scold`（骂）效果：有屁回合投票权 +0.5，且不能弃票 | vote 票权 | TC-FIX-05 |
| BUG-06 | `canSpeak` / `canVote` 在 settlement→preparation 跨层时未重置为初始值 `true` | 多回合流程 | TC-FIX-06 |
| BUG-07 | `voteModifier` 跨层未清零，导致上层行动牌加成延续到下层 | 多回合投票权 | TC-FIX-07 |
| BUG-08 | `submitVote` 服务端未校验 `votePowerAtSubmit`，客户端可伪造任意票权 | vote 票权 | TC-FIX-08 |
| BUG-09 | bet 阶段结束后未将空押玩家 `canVote` 设为 `false` | vote 阶段空押约束 | TC-FIX-09 |
| BUG-10 | `advanceStage` settlement 分支中 `resolvedVoteResult` 恒为 `null`，`VoteResolved` 事件从不触发 | vote→settlement 事件 | TC-FIX-10 |
| BUG-11 | 7+ 人局屁者间应互知身份，`DealService` 未在输出中携带 `fatterCanSeeEachOther` 标记 | 身份分配 | TC-FIX-11 |

---

## 缺陷修复验证测试用例

### TC-FIX-01 开始游戏后每名玩家持有 4 张手牌

**关联缺陷**：BUG-01

**前置条件**：6 人房间，房主调用 StartGame

**预期结果**：
- `room.match.players` 中每名玩家的 `handCards.length = 4`
- 4 张手牌的 `consumed = false`
- `cardInstanceId` 全局唯一，不同玩家之间不重复

**边界类**：
| 等价类 | 输入 | 预期 |
|---|---|---|
| 正常（6人局） | playerCount = 6，StartGame 成功 | 每人 4 张手牌 |
| 边界下界（5人局） | playerCount = 5，StartGame 成功 | 每人 4 张手牌 |
| 边界上界（10人局） | playerCount = 10，StartGame 成功 | 每人 4 张手牌 |

---

### TC-FIX-02 有屁回合押注「吹」对相邻玩家造成 1 点伤害

**关联缺陷**：BUG-02

**前置条件**：
- `currentFloor` 的 `roundKind = gas`（有屁回合）
- 玩家1（座位1）押注了 `blow`（吹）
- 玩家2（座位2）、玩家6（座位6）为玩家1 的相邻玩家

**执行**：`AdvanceStage` action → damage

**预期结果**：
- `RoundSettled.damages` 包含玩家2 和玩家6 各 1 点伤害，来源为 `blow`
- 玩家1 本身不受 `blow` 自伤
- 玩家2 / 玩家6 的 `currentHp` 减少 1

**边界类**：
| 等价类 | 条件 | 预期 |
|---|---|---|
| 有屁回合 + 吹 | `roundKind = gas`，押吹 | 相邻玩家各 -1 HP |
| 无屁回合 + 吹 | `roundKind = safe`，押吹 | 无额外伤害（吹无效） |
| 相邻玩家已死亡 | 邻座 `isAlive = false` | 跳过死亡玩家，伤害作用于下一个活跃相邻玩家 |

---

### TC-FIX-03 有屁回合押注「抓」对目标造成 1 点不可防御伤害

**关联缺陷**：BUG-03

**前置条件**：
- `roundKind = gas`
- 玩家1 押注了 `grab`（抓），目标为玩家2
- 玩家2 押注了 `endure`（忍）

**执行**：`AdvanceStage` action → damage

**预期结果**：
- 玩家2 受到 `grab` 的 1 点**不可防御**伤害（`endure` 不能阻挡）
- 玩家2 的 `currentHp` 减少 1（而非被 `endure` 归零后不变）
- `damages` 条目带有 `unblockable = true` 标记

**边界类**：
| 等价类 | 条件 | 预期 |
|---|---|---|
| 目标押忍 | 目标有 `endure`，攻击者有 `grab` | 目标仍受 1 点不可防御伤害 |
| 无屁回合 + 抓 | `roundKind = safe` | `grab` 不触发伤害效果 |
| 目标 `isAlive = false` | 目标已死亡 | 不造成伤害，命令拒绝或静默跳过 |

---

### TC-FIX-04 「忍」只防御普通伤害，不可防御伤害穿透

**关联缺陷**：BUG-04

**前置条件**：玩家A 押 `endure`（忍），同回合受到来自 `grab` 的 1 点不可防御伤害 + 环境 1 点普通伤害

**执行**：`AdvanceStage` action → damage

**预期结果**：
- 环境 1 点伤害被 `endure` 防御（damage = 0）
- `grab` 的 1 点不可防御伤害穿透 `endure`（damage = 1）
- 玩家A `currentHp` 净减 1

**边界类**：
| 等价类 | 伤害来源 | 预期 |
|---|---|---|
| 仅普通伤害 | 环境牌 gas | `endure` 防御，最终 damage = 0 |
| 仅不可防御伤害 | `grab` | `endure` 不防御，damage = 1 |
| 混合伤害 | gas + grab | 普通部分防御，不可防御部分穿透，damage = 1 |

---

### TC-FIX-05 押注「骂」使投票权 +0.5，且不能弃票

**关联缺陷**：BUG-05

**前置条件**：`currentStage = vote`，玩家A 在 bet 阶段押了 `scold`（骂），`roundKind = gas`

**预期结果**：
- 服务端计算 `votePowerAtSubmit = 1.5`（基础 1 + 骂 +0.5）
- 玩家A 提交 `voteTarget = null`（弃票）→ **拒绝**（骂不允许弃票）
- 其他押不同牌的玩家 `votePowerAtSubmit = 1`

**边界类**：
| 等价类 | 押牌 | 预期票权 | 可弃票 |
|---|---|---|---|
| 押骂 | `scold` | 1.5 | ❌ 不可弃票 |
| 押其他牌 | `endure`/`blow`/`grab`/`listen`/`suck` | 1 | ✅ 可弃票 |
| 空押 | 无 | 0，`canVote = false` | — |

---

### TC-FIX-06 跨层时 canSpeak / canVote 重置为初始值

**关联缺陷**：BUG-06

**前置条件**：
- 第 1 层结算后，玩家B 因某角色技能被设置 `canSpeak = false`，`canVote = false`
- 房主执行 `AdvanceStage` settlement → preparation（进入第 2 层）

**预期结果**：
- 第 2 层 preparation 阶段开始后，玩家B 的 `canSpeak = true`，`canVote = true`
- 第 2 层 bet 阶段结束后，空押玩家 `canVote` 再次被设为 `false`（本层新一轮判断）

**边界类**：
| 等价类 | 条件 | 预期 |
|---|---|---|
| 第 1 层被禁言/禁投 | 第 1 层结算后状态为 false | 进入第 2 层后重置为 true |
| 第 1 层正常 | `canSpeak/canVote = true` | 第 2 层保持 true |
| 第 8 层终局 | 终局时不创建新层 | 无需重置 |

---

### TC-FIX-07 跨层时 voteModifier 清零

**关联缺陷**：BUG-07

**前置条件**：
- 第 1 层中，玩家A 因角色技能 `voteModifier = +0.5`
- 第 1 层结束，进入第 2 层 preparation

**预期结果**：
- 第 2 层 vote 阶段，玩家A 的 `voteModifier = 0`（技能效果不跨层延续）
- 若玩家A 第 2 层再次符合条件，该层内重新计算

**边界类**：
| 等价类 | 条件 | 预期 |
|---|---|---|
| 上层有正向 modifier | `voteModifier = +0.5` | 下层清零 |
| 上层有负向 modifier | `voteModifier = -0.5` | 下层清零 |
| 上层无 modifier | `voteModifier = 0` | 下层保持 0 |

---

### TC-FIX-08 服务端校验 votePowerAtSubmit 与实际押牌一致

**关联缺陷**：BUG-08

**前置条件**：`currentStage = vote`，玩家A 当层押了 `endure`（忍），理论票权 = 1

**场景A（伪造高票权）**：
- 请求体 `votePowerAtSubmit = 1.5`
- **预期**：服务端拒绝，返回错误 `INVALID_VOTE_POWER`

**场景B（合法值）**：
- 请求体 `votePowerAtSubmit = 1`（与押牌匹配）
- **预期**：HTTP 200，`VoteSubmitted` 触发

**边界类**：
| 等价类 | 押牌 | 提交值 | 预期 |
|---|---|---|---|
| 押骂，提交 1.5 | `scold` | 1.5 | ✅ 接受 |
| 押骂，提交 1 | `scold` | 1 | ❌ 拒绝（偷低票权） |
| 押忍，提交 1.5 | `endure` | 1.5 | ❌ 拒绝（伪造高票权） |
| 押忍，提交 1 | `endure` | 1 | ✅ 接受 |
| 空押，提交任意值 | 无 | 任意 | ❌ 拒绝（canVote = false）|

---

### TC-FIX-09 bet 阶段结束后空押玩家 canVote 置 false

**关联缺陷**：BUG-09

**前置条件**：
- `currentStage = bet`
- 玩家1～5 提交了押牌，玩家6 未提交押牌
- 房主推进 `bet → environment`

**预期结果**：
- 玩家6 的 `canVote = false`
- 玩家1～5 的 `canVote = true`（保持）
- 玩家6 在 vote 阶段提交投票 → **拒绝**，错误码 `PLAYER_CANNOT_VOTE`

**边界类**：
| 等价类 | 条件 | canVote |
|---|---|---|
| 已押牌 | bet 阶段有 ActionSubmission | `true` |
| 空押（主动不押） | bet 阶段无 ActionSubmission | `false` |
| 死亡玩家 | `isAlive = false` | `false`（不受此规则影响，由死亡状态控制） |

---

### TC-FIX-10 vote → settlement 时 VoteResolved 事件正确触发

**关联缺陷**：BUG-10

**前置条件**：`currentStage = vote`，全员已投票，无平局

**执行**：房主调用 `AdvanceStage` vote → settlement

**预期结果**：
- HTTP 200
- `currentStage = settlement`
- 响应事件列表中包含 `VoteResolved`，携带：
  - `floor`（当前层号）
  - `voteRound`（当前投票轮次）
  - `voteResult.targetOpenId`（票数最多的玩家）
  - `voteResult.isTie = false`
- 被淘汰玩家 `isAlive = false`

**边界类**：
| 等价类 | 条件 | 预期 VoteResolved |
|---|---|---|
| 无平局 | 唯一最高票目标 | `targetOpenId != null`，`isTie = false` |
| 首轮平局 | 两人同票 | `isTie = true`，进入 `tieBreak` |
| tieBreak 后仍平局 | 二轮仍相同票数 | `targetOpenId = null`，`isTie = true`，无人淘汰 |

---

### TC-FIX-11 7 人及以上局屁者间互知身份

**关联缺陷**：BUG-11

**前置条件**：房间 playerCount = 7，StartGame 成功

**预期结果**：
- `CardsDealt` 事件中携带 `fatterCanSeeEachOther = true`（或等价字段）
- 屁者玩家可见其他屁者的 `identityCode`
- 5～6 人局 `fatterCanSeeEachOther = false`

**边界类**：
| 等价类 | playerCount | fatterCanSeeEachOther |
|---|---|---|
| 5 人局 | 5 | `false` |
| 6 人局 | 6 | `false` |
| 7 人局（边界） | 7 | `true` |
| 10 人局 | 10 | `true` |
