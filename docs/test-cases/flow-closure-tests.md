# Flow Closure Tests

This document defines end-to-end test scenarios that validate the closed gameplay loop across preparation, round execution, tie-break voting, and winner judgement.

## Scenario 1: Start Game Closes The Preparation Loop

- Given a room with 6 ready players and valid `ruleSetCode` / `deckTemplateCode`
- When `StartGame` is accepted
- Then `Match`, `MatchPlayer`, `MatchPlayerRoleOption`, `MatchPlayerActionCard`, `MatchEnvironmentDeck`, and the floor-1 `Round` shell are created
- And `CardsDealt` and `RoleSelectionStarted` are emitted
- And every `MatchPlayer` has `identityCode` assigned, `chosenRoleCode = null`, and `status.roleSelection = pending`
- When all players submit `ConfirmRoleSelection`
- Then `RoleSelectionCompleted` is emitted
- And the room becomes eligible to advance from `preparation` to `bet`

## Scenario 2: Round Shell Accepts Bet Before Environment Reveal

- Given floor 1 is in `bet`
- And the floor-1 `Round` row already exists with `environmentCard = null` and `roundKind = null`
- When each player submits one bet card
- Then one `RoundActionSubmission` with `sequence = 1` and `sourceStage = bet` exists per player
- And the consumed `MatchPlayerActionCard` rows are marked as used
- When the room advances to `environment`
- Then `EnvironmentRevealed` fills the existing `Round.environmentCard` and `Round.roundKind`
- And no new `Round` row is created for the same floor

## Scenario 3: Action Stage Supports Additional Direct Play

- Given the current floor is a gas round and the acting player already has a locked bet submission
- When the player uses a card with direct-play capability during `action`
- Then an additional `RoundActionSubmission` is appended with `sequence > 1` and `sourceStage = action`
- And related `RoundActionTarget` rows reference the matching `sequence`
- And `SettlementService` receives the ordered submissions list for damage resolution

## Scenario 4: Tie Break Preserves Vote History

- Given the current floor is in `vote` and `Round.currentVoteRound = 1`
- When the first vote ends in a tie
- Then `VoteResolved` is emitted with `voteRound = 1`, `isTie = true`, and the tied targets list
- And the room advances to `tieBreak`
- When `tieBreak` completes and the room returns to `vote`
- Then `Round.currentVoteRound` increments to 2
- And only non-tied eligible players can submit votes against the tied targets
- When the second vote still ties
- Then `VoteResolved` is emitted with `voteRound = 2`, `targetOpenId = null`, and `isTie = true`
- And no player is eliminated by voting on that floor

## Scenario 5: Winner Judgement Matches Original Rules

- Given settlement finishes on any floor with `alivePassenger <= aliveFatter`
- Then `WinnerDecided.winnerCamp = fatter`
- Given settlement finishes with `alivePassenger = 0` and `aliveFatter = 0`
- Then `WinnerDecided.winnerCamp = fatter`
- Given floor 8 settlement finishes with `alivePassenger > aliveFatter`
- Then `WinnerDecided.winnerCamp = passenger`
- Given `resolvedGasRounds = 4`
- Then `WinnerDecided.winnerCamp = fatter`

## Scenario 6: Next Floor Reopens A Fresh Preparation Phase

- Given settlement resolves without a final winner
- When the room advances to the next floor
- Then `currentFloor` increments by 1
- And `currentStage` returns to `preparation`
- And a new `Round` shell is created for the new floor with `currentVoteRound = 1`
- And floor-scoped speech / vote temporary states are reset while player identity and chosen role persist