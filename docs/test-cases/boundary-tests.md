# Boundary Tests

This document defines test cases based on boundary classes (Gateway to Room).

## Scope And Assumptions

- Boundary classes are command handlers exposed by Gateway.
- Tests focus on validation, invariants, and emitted domain events.
- Room state is authoritative and versioned.

## Shared Fixtures

- Default playerCount = 0, gameState = wait, currentFloor = 1, currentStage = preparation.
- Valid player count range is 5-10.
- The current floor has a persisted Round shell during preparation, with `environmentCard = null`, `roundKind = null`, and `currentVoteRound = 1`.
- `chosenRoleCode`, `maxHp`, and `currentHp` may be null until role confirmation finishes.
- Stage order is preparation -> bet -> environment -> action -> damage -> talk -> vote -> settlement.
- A tie in vote transitions to tieBreak, then back to vote with restricted targets and `currentVoteRound + 1`.
- A floor keeps at most 2 vote rounds.

## CreateRoom

### Success

- Given ownerOpenId, ruleSetCode, and deckTemplateCode valid
- When CreateRoom is submitted
- Then RoomCreated is emitted with gameState = wait, currentFloor = 1, currentStage = preparation

### Validation

- Reject missing ownerOpenId
- Reject missing ruleSetCode
- Reject missing deckTemplateCode
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
- And CardsDealt and RoleSelectionStarted are emitted
- And Match, MatchPlayer, MatchPlayerRoleOption, MatchPlayerActionCard, MatchEnvironmentDeck, and the floor-1 Round shell are created
- And gameState = start, currentStage = preparation

### Validation

- Reject if openId is not owner
- Reject if playerCount < 5 or playerCount > 10

## ConfirmRoleSelection

### Success

- Given currentStage = preparation and the roleCode is in the player's offered role options
- When ConfirmRoleSelection is submitted
- Then RoleSelected is emitted
- And MatchPlayer.chosenRoleCode, maxHp, and currentHp are filled

### Validation

- Reject if currentStage != preparation
- Reject if roleCode is not in the player's offered role options
- Reject duplicate confirmation for the same player

### Outcome Checks

- When all players finish confirmation
  - Then RoleSelectionCompleted is emitted
  - And the room is allowed to advance from preparation to bet

## SubmitAction

### Success

- Given currentStage = bet, player is alive, and cardInstanceId is available in MatchPlayerActionCard
- When SubmitAction is submitted
- Then ActionSubmitted is emitted
- And a RoundActionSubmission is created with sequence = 1 and sourceStage = bet

### Validation

- Reject if currentStage != bet
- Reject if player has no available action card
- Reject if player is not alive
- Reject if the current floor Round shell does not exist
- Ensure requestId is idempotent per player per stage

## RevealEnvironment

### Success

- Given currentStage = environment
- When RevealEnvironment is executed
- Then EnvironmentRevealed is emitted with floor and environmentCard
- And the existing Round row is updated with environmentCard and roundKind

### Validation

- Reject if currentStage != environment

## SubmitVote

### Success

- Given currentStage = vote, player canVote = true, and voteRound matches Round.currentVoteRound
- When SubmitVote is submitted
- Then VoteSubmitted is emitted with votePowerAtSubmit
- And a RoundVoteSubmission is created under the current voteRound

### Validation

- Reject if currentStage != vote
- Reject if voteRound does not match Round.currentVoteRound
- Reject if player canVote = false
- Reject non-tied targets during tieBreak re-vote

## AdvanceStage

### Success

- Given owner command or timeout
- When AdvanceStage is executed
- Then StageFlowService returns nextStage
- And StageAdvanced is emitted

### Validation

- Reject if not owner and no timeout flag
- Reject if nextStage is not in allowed order
- Reject preparation -> bet when not all players completed role selection

### Outcome Checks

- When advancing from action to damage
  - Then SettlementService is called
  - And RoundSettled is emitted with damages and eliminated
- When advancing from vote on a tie
  - Then nextStage = tieBreak
  - And only tied targets remain votable
- When advancing from tieBreak back to vote
  - Then currentVoteRound increments by 1
- When the second vote round still ties
  - Then VoteResolved.targetOpenId = null
  - And no player is eliminated by voting on that floor
- When advancing from settlement to preparation
  - Then VoteResolved is emitted
  - And currentFloor increments
  - And a new Round shell is created for the next floor
- When WinnerJudgementService returns isFinal = true
  - Then WinnerDecided is emitted and gameState = end

## Cross Cutting

- Version increments on each accepted command
- currentFloor stays in 1-8, 9 only used for end
- currentStage never leaves the allowed transition graph; tieBreak -> vote is the only loop
- Players with hp <= 0 are isAlive = false and cannot act
- activePlayers = 0 is judged as winnerCamp = fatter
- One floor may contain multiple ActionSubmission rows for the same player, distinguished by sequence
- Vote history for a floor must preserve both rounds when tieBreak happens
