# 玩家实体实现

本文档的实现描述以 Node.js 作为后端语言。

## 范围

Player 实体隶属于 Room 聚合，记录行动、投票与存活所需的玩家状态。

## 实体状态

- openId
- nickname
- avatar
- seatNo
- candidateRoles
- selectedRole
- hp
- votePower
- isAlive
- selectedAction
- passedBet
- canSpeak
- canVote
- voteTarget
- isReady
- joinTime

## 不变量

- hp <= 0 必须 isAlive = false。
- isAlive = false 不能选择身份、押牌或投票。
- selectedRole 一旦确认不可修改。
- passedBet = true 时，canSpeak = false 且 canVote = false。

## 状态变化

- AssignSeat
  - JoinRoom 时分配或重排 seatNo。

- GenerateRoleOptions
  - RoleSelectionStarted 时设置 candidateRoles。

- ConfirmRoleSelection
  - 玩家确认后写入 selectedRole。

- SubmitBet
  - bet 阶段锁定 selectedAction 或 passedBet。

- ResolveRoundPermission
  - settlement 后根据 selectedAction 计算 votePower、canSpeak、canVote。

- ResolveDamage
  - 应用总伤害；若 hp <= 0，标记 isAlive = false。

- ResetRoundState
  - 新回合开始时重置 selectedAction、passedBet、voteTarget、votePower、canSpeak、canVote。

## 持久化说明

- Player 以 (roomId, openId) 作为主键。
- selectedRole 与 joinTime 为长期状态，其余回合态字段在 bet 阶段前重置。
