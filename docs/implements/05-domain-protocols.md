# 领域交互协议

本文档的实现描述以 Node.js 作为后端语言。

本文定义聚合与领域服务之间的内部数据协议。

## 共享类型

```json
{
  "RoomRef": {
    "roomId": "String",
    "roomVersion": 1
  }
}
```

## 命令（Gateway -> Room）

### CreateRoom

```json
{
  "name": "CreateRoom",
  "requestId": "uuid",
  "payload": {
    "ownerOpenId": "String",
    "ruleSetCode": "String",
    "deckTemplateCode": "String"
  }
}
```

### JoinRoom

```json
{
  "name": "JoinRoom",
  "requestId": "uuid",
  "payload": {
    "roomId": "String",
    "openId": "String",
    "nickname": "String",
    "avatar": "String"
  }
}
```

### StartGame

```json
{
  "name": "StartGame",
  "requestId": "uuid",
  "payload": {
    "roomId": "String",
    "openId": "String",
    "seed": "String"
  }
}
```

### ConfirmRoleSelection

```json
{
  "name": "ConfirmRoleSelection",
  "requestId": "uuid",
  "payload": {
    "roomId": "String",
    "openId": "String",
    "roleCode": "String"
  }
}
```

### SubmitAction

```json
{
  "name": "SubmitAction",
  "requestId": "uuid",
  "payload": {
    "roomId": "String",
    "openId": "String",
    "cardInstanceId": "String"
  }
}
```

### SubmitVote

```json
{
  "name": "SubmitVote",
  "requestId": "uuid",
  "payload": {
    "roomId": "String",
    "openId": "String",
    "voteRound": 1,
    "voteTarget": "String|null",
    "votePowerAtSubmit": 1
  }
}
```

### AdvanceStage

```json
{
  "name": "AdvanceStage",
  "requestId": "uuid",
  "payload": {
    "roomId": "String",
    "openId": "String",
    "trigger": "ownerCommand|timeout"
  }
}
```

## 事件（Room -> Gateway）

### RoomCreated

```json
{
  "name": "RoomCreated",
  "payload": {
    "roomId": "String",
    "ownerOpenId": "String",
    "gameState": "wait",
    "currentFloor": 1,
    "currentStage": "preparation",
    "version": 1
  }
}
```

### PlayerJoinedRoom

```json
{
  "name": "PlayerJoinedRoom",
  "payload": {
    "roomId": "String",
    "openId": "String",
    "playerCount": 1,
    "version": 2
  }
}
```

### CardsDealt

```json
{
  "name": "CardsDealt",
  "payload": {
    "roomId": "String",
    "matchId": "String",
    "currentFloor": 1,
    "currentStage": "preparation",
    "players": [
      {
        "openId": "String",
        "identityCode": "String",
        "roleOptions": ["String", "String"],
        "initialHandCards": [
          {
            "cardInstanceId": "String",
            "actionCardCode": "String"
          }
        ]
      }
    ],
    "version": 10
  }
}
```

> Gateway 向客户端推送时必须做私有投递与脱敏，身份牌、手牌和环境顺序只发送给有权限的玩家。

### RoleSelectionStarted

```json
{
  "name": "RoleSelectionStarted",
  "payload": {
    "roomId": "String",
    "matchId": "String",
    "pendingPlayers": ["openId"],
    "version": 10
  }
}
```

### RoleSelected

```json
{
  "name": "RoleSelected",
  "payload": {
    "roomId": "String",
    "openId": "String",
    "roleCode": "String",
    "version": 11
  }
}
```

### RoleSelectionCompleted

```json
{
  "name": "RoleSelectionCompleted",
  "payload": {
    "roomId": "String",
    "matchId": "String",
    "currentFloor": 1,
    "currentStage": "preparation",
    "version": 12
  }
}
```

### ActionSubmitted

```json
{
  "name": "ActionSubmitted",
  "payload": {
    "roomId": "String",
    "floor": 1,
    "openId": "String",
    "sequence": 1,
    "sourceStage": "bet",
    "version": 11
  }
}
```

### StageAdvanced

```json
{
  "name": "StageAdvanced",
  "payload": {
    "roomId": "String",
    "currentFloor": 1,
    "fromStage": "bet",
    "toStage": "environment",
    "currentVoteRound": 1,
    "version": 12
  }
}
```

### EnvironmentRevealed

```json
{
  "name": "EnvironmentRevealed",
  "payload": {
    "roomId": "String",
    "floor": 1,
    "environmentCard": "EnvironmentCard",
    "roundKind": "gas",
    "version": 13
  }
}
```

### RoundSettled

```json
{
  "name": "RoundSettled",
  "payload": {
    "roomId": "String",
    "floor": 1,
    "stage": "damage",
    "settlementResult": {
      "damages": [{"openId": "String", "damage": 1, "reason": "String"}],
      "eliminated": ["String"]
    },
    "version": 14
  }
}
```

### VoteSubmitted

```json
{
  "name": "VoteSubmitted",
  "payload": {
    "roomId": "String",
    "floor": 1,
    "voteRound": 1,
    "openId": "String",
    "votePowerAtSubmit": 1,
    "version": 15
  }
}
```

### VoteResolved

```json
{
  "name": "VoteResolved",
  "payload": {
    "roomId": "String",
    "floor": 1,
    "voteRound": 1,
    "voteResult": {
      "targetOpenId": "String|null",
      "votes": 2.5,
      "isTie": false,
      "tieTargets": []
    },
    "nextStage": "preparation",
    "version": 16
  }
}
```

### WinnerDecided

```json
{
  "name": "WinnerDecided",
  "payload": {
    "roomId": "String",
    "winnerCamp": "passenger",
    "reason": "String",
    "decidedAt": "Timestamp",
    "version": 20
  }
}
```

## 服务接口（Room -> Domain Services）

### DealService

```json
{
  "players": ["openId"],
  "ruleSetCode": "String",
  "playerCount": 8,
  "seed": "String"
}
```

### EnvironmentDeckService

```json
{
  "ruleSetCode": "String",
  "deckTemplateCode": "String",
  "seed": "String"
}
```

### SettlementService

```json
{
  "round": {
    "matchId": "String",
    "floor": 1,
    "stage": "damage",
    "currentVoteRound": 1
  },
  "environmentCard": "EnvironmentCard",
  "actionSubmissions": [
    {
      "sequence": 1,
      "openId": "String",
      "cardInstanceId": "String",
      "actionCard": "String",
      "sourceStage": "bet"
    }
  ],
  "players": [{"openId": "String", "hp": 4, "isAlive": true}]
}
```

### WinnerJudgementService

```json
{
  "aliveByCamp": {
    "passenger": 3,
    "fatter": 1
  },
  "currentFloor": 4,
  "resolvedGasRounds": 2
}
```
