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
    "roleConfig": "String"
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

### SubmitAction

```json
{
  "name": "SubmitAction",
  "requestId": "uuid",
  "payload": {
    "roomId": "String",
    "openId": "String",
    "actionCard": "String"
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
    "voteTarget": "String",
    "votePowerAtSubmit": 1
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
    "currentStage": "night",
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
    "envDeck": ["EnvironmentCard"],
    "roles": [{"openId": "String", "role": "String"}],
    "version": 10
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
    "version": 11
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
    "settlementResult": {
      "damages": [{"openId": "String", "damage": 1, "reason": "String"}],
      "eliminated": ["String"]
    },
    "version": 12
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
    "voteResult": {
      "targetOpenId": "String",
      "votes": 2.5,
      "isTie": false,
      "tieTargets": []
    },
    "version": 13
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
  "roleConfig": "String",
  "seed": "String"
}
```

### EnvironmentDeckService

```json
{
  "envConfig": {
    "hasGas": 3,
    "hasStink": 1,
    "hasStew": 0,
    "none": 4,
    "pick": 8
  },
  "seed": "String"
}
```

### SettlementService

```json
{
  "environmentCard": "EnvironmentCard",
  "actionSubmissions": [{"openId": "String", "actionCard": "String"}],
  "players": [{"openId": "String", "hp": 4, "isAlive": true}]
}
```

### WinnerJudgementService

```json
{
  "aliveByRole": {
    "passenger": 3,
    "fatter": 1
  },
  "currentFloor": 4
}
```
