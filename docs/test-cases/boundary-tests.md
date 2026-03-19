# Boundary Tests

This document defines test cases based on boundary classes (Gateway to Room).

## Scope And Assumptions

- Boundary classes are command handlers exposed by Gateway.
- Tests focus on validation, invariants, and emitted domain events.
- Room state is authoritative and versioned.

## Shared Fixtures

- Default playerCount = 1, gameState = wait, currentRound = 0, currentStage = lobby.
- Valid player count range is 5-10.
- Stage order is lobby -> roleSelection -> bet -> action -> settlement -> discussionVote -> review.

## CreateRoom

### Success

- Given ownerOpenId and roomConfig valid
- When CreateRoom is submitted
- Then RoomCreated is emitted with gameState = wait, currentRound = 0, currentStage = lobby
- And a unique 6-digit roomCode is generated

### Validation

- Reject missing ownerOpenId
- Reject missing roomConfig
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
- Reassign seat numbers contiguously after a player leaves in lobby stage

## UpdateRoomConfig

### Success

- Given ownerOpenId matches and currentStage = lobby
- When UpdateRoomConfig is submitted
- Then RoomConfigUpdated is emitted
- And roomConfig is persisted

### Validation

- Reject if openId is not owner
- Reject if playerCount < 5 or playerCount > 10
- Reject if currentStage != lobby

## SetReady

### Success

- Given currentStage = lobby and room player count matches configured playerCount
- When SetReady is submitted by each player
- Then PlayerReadyStateChanged is emitted for each player
- And when all players are ready, RoleSelectionStarted is emitted
- And gameState = selecting, currentStage = roleSelection

### Validation

- Reject if currentStage != lobby
- Reject unknown player

## ConfirmRoleSelection

### Success

- Given currentStage = roleSelection and candidate roles were generated
- When each player confirms one role from their own candidate list
- Then RoleSelectionCompleted is emitted
- And EnvironmentDeckService is called
- And gameState = playing, currentRound = 1, currentStage = bet

### Validation

- Reject if currentStage != roleSelection
- Reject roleId outside player candidate list
- Reject duplicate selection after confirmation

## SubmitBet

### Success

- Given currentStage = bet and player is alive
- When SubmitBet is submitted
- Then BetSubmitted is emitted

### Validation

- Reject if currentStage != bet
- Reject if payload contains neither an actionCard nor an explicit pass choice
- Reject if player is not alive
- Ensure requestId is idempotent per player per stage

## SubmitVote

### Success

- Given currentStage = discussionVote and player is alive
- When SubmitVote is submitted
- Then VoteSubmitted is emitted with votePowerAtSubmit

### Validation

- Reject if currentStage != discussionVote
- Reject if voteTarget is empty
- Reject if player is not alive
- Reject if player passed bet and therefore has no vote right

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

- When advancing from bet to action
  - Then EnvironmentRevealed is emitted with round and environmentCard
- When advancing from action to settlement
  - Then SettlementService is called
  - And RoundSettled is emitted with damages and eliminated
- When advancing from discussionVote to next round
  - Then VoteResolved is emitted
  - And currentRound increments
- When advancing from discussionVote after a second tie
  - Then VoteResolved is emitted with needRevote = false and targetOpenId = null
- When WinnerJudgementService returns isFinal = true
  - Then WinnerDecided is emitted and gameState = ended

## Cross Cutting

- Version increments on each accepted command
- currentRound stays in 1-8 while playing
- currentStage never moves backward
- Players with hp <= 0 are isAlive = false and cannot act
- Players who pass bet cannot speak or vote in the same round
