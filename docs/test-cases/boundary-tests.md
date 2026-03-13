# Boundary Tests

This document defines test cases based on boundary classes (Gateway to Room).

## Scope And Assumptions

- Boundary classes are command handlers exposed by Gateway.
- Tests focus on validation, invariants, and emitted domain events.
- Room state is authoritative and versioned.

## Shared Fixtures

- Default playerCount = 0, gameState = wait, currentFloor = 1, currentStage = night.
- Valid player count range is 5-10.
- Stage order is night -> action -> env -> actionResolve -> hurt -> talk -> vote.

## CreateRoom

### Success

- Given ownerOpenId and roleConfig valid
- When CreateRoom is submitted
- Then RoomCreated is emitted with gameState = wait, currentFloor = 1, currentStage = night

### Validation

- Reject missing ownerOpenId
- Reject missing roleConfig
- Ensure requestId is required and used for idempotency

## JoinRoom

### Success

- Given gameState = wait and playerCount < 10
- When JoinRoom is submitted by a new player
- Then PlayerJoinedRoom is emitted and playerCount increments

### Validation

- Reject when gameState != wait
- Reject when playerCount >= 10
- Reject duplicate openId

## StartGame

### Success

- Given ownerOpenId matches and playerCount in 5-10
- When StartGame is submitted
- Then DealService and EnvironmentDeckService are called
- And CardsDealt is emitted
- And gameState = start, currentStage = night

### Validation

- Reject if openId is not owner
- Reject if playerCount < 5 or playerCount > 10

## SubmitAction

### Success

- Given currentStage = action and player is alive
- When SubmitAction is submitted
- Then ActionSubmitted is emitted

### Validation

- Reject if currentStage != action
- Reject if actionCard is empty
- Reject if player is not alive
- Ensure requestId is idempotent per player per stage

## RevealEnvironment

### Success

- Given currentStage = env
- When RevealEnvironment is executed
- Then EnvironmentRevealed is emitted with floor and environmentCard

### Validation

- Reject if currentStage != env

## SubmitVote

### Success

- Given currentStage = vote and player is alive
- When SubmitVote is submitted
- Then VoteSubmitted is emitted with votePowerAtSubmit

### Validation

- Reject if currentStage != vote
- Reject if voteTarget is empty
- Reject if player is not alive

## AdvanceStage

### Success

- Given owner command or timeout
- When AdvanceStage is executed
- Then StageFlowService returns nextStage
- And StageAdvanced is emitted

### Validation

- Reject if not owner and no timeout flag
- Reject if nextStage is not in allowed order

### Outcome Checks

- When advancing from env to actionResolve or hurt
  - Then SettlementService is called
  - And RoundSettled is emitted with damages and eliminated
- When advancing from vote to night
  - Then VoteResolved is emitted
  - And currentFloor increments
- When WinnerJudgementService returns isFinal = true
  - Then WinnerDecided is emitted and gameState = end

## Cross Cutting

- Version increments on each accepted command
- currentFloor stays in 1-8, 9 only used for end
- currentStage never moves backward
- Players with hp <= 0 are isAlive = false and cannot act
