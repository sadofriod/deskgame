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
    "roomConfig": {
      "playerCount": 5,
      "roleConfig": "independent"
    }
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

### UpdateRoomConfig

```json
{
  "name": "UpdateRoomConfig",
  "requestId": "uuid",
  "payload": {
    "roomId": "String",
    "openId": "String",
    "roomConfig": {
      "playerCount": 8,
      "roleConfig": "faction"
    }
  }
}
```

### SetReady

```json
{
  "name": "SetReady",
  "requestId": "uuid",
  "payload": {
    "roomId": "String",
    "openId": "String",
    "ready": true
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
    "roleId": "String"
  }
}
```

### SubmitBet

```json
{
  "name": "SubmitBet",
  "requestId": "uuid",
  "payload": {
    "roomId": "String",
    "openId": "String",
    "actionCard": "String",
    "passedBet": false
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
    "voteTarget": "String"
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
    "timeoutFlag": false
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
    "roomCode": "123456",
    "ownerOpenId": "String",
    "gameState": "wait",
    "currentRound": 0,
    "currentStage": "lobby",
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
    "seatNo": 1,
    "playerCount": 1,
    "version": 2
  }
}
```

### RoomConfigUpdated

```json
{
  "name": "RoomConfigUpdated",
  "payload": {
    "roomId": "String",
    "roomConfig": {
      "playerCount": 8,
      "roleConfig": "faction"
    },
    "version": 3
  }
}
```

### PlayerReadyStateChanged

```json
{
  "name": "PlayerReadyStateChanged",
  "payload": {
    "roomId": "String",
    "openId": "String",
    "ready": true,
    "allReady": false,
    "version": 4
  }
}
```

### RoleSelectionStarted

```json
{
  "name": "RoleSelectionStarted",
  "payload": {
    "roomId": "String",
    "candidateRoles": [
      {"openId": "String", "roles": ["String", "String", "String"]}
    ],
    "currentStage": "roleSelection",
    "version": 10
  }
}
```

### RoleSelectionCompleted

```json
{
  "name": "RoleSelectionCompleted",
  "payload": {
    "roomId": "String",
    "currentRound": 1,
    "currentStage": "bet",
    "envDeck": ["EnvironmentCard"],
    "version": 11
  }
}
```

### BetSubmitted

```json
{
  "name": "BetSubmitted",
  "payload": {
    "roomId": "String",
    "round": 1,
    "openId": "String",
    "passedBet": false,
    "selectedAction": "scold",
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
    "round": 1,
    "environmentCard": "EnvironmentCard",
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
    "round": 1,
    "settlementResult": {
      "damages": [{"openId": "String", "damage": 1, "reason": "String"}],
      "heals": [{"openId": "String", "heal": 1, "reason": "String"}],
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
    "round": 1,
    "openId": "String",
    "voteTarget": "String",
    "votePowerAtSubmit": 1.5,
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
    "round": 1,
    "voteResult": {
      "targetOpenId": "String",
      "votes": 2.5,
      "isTie": false,
      "tieTargets": [],
      "needRevote": false
    },
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
  "roomConfig": {
    "playerCount": 8,
    "roleConfig": "extended"
  },
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
  "betSubmissions": [{"openId": "String", "selectedAction": "String", "passedBet": false}],
  "actionTargets": [{"openId": "String", "targetOpenIds": ["String"]}],
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
  "currentRound": 4,
  "allEliminated": false
}
```
