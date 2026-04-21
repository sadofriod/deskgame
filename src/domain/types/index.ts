// ── New domain types based on docs/implements/schema.prisma ──────────────────

export enum GameState {
  wait = "wait",
  start = "start",
  end = "end",
}

export enum Stage {
  preparation = "preparation",
  bet = "bet",
  environment = "environment",
  action = "action",
  damage = "damage",
  talk = "talk",
  vote = "vote",
  settlement = "settlement",
  tieBreak = "tieBreak",
}

export enum Camp {
  passenger = "passenger",
  fatter = "fatter",
}

// Backward-compat alias used by WinnerJudgementService consumers
export { Camp as WinnerCamp };

export type RoundKind = "gas" | "safe";

export interface HandCard {
  cardInstanceId: string;
  actionCardCode: string;
  consumed: boolean;
}

export interface ActionSubmission {
  openId: string;
  cardInstanceId: string;
  actionCardCode: string;
  sequence: number;
  sourceStage: Stage;
  isLocked: boolean;
  /** Target player openId for cards that require a target (e.g. `grab`). */
  targetOpenId?: string;
}

export interface VoteSubmissionRecord {
  voteRound: number;
  voterOpenId: string;
  targetOpenId: string | null;
  votePowerAtSubmit: number;
}

export interface DamageRecord {
  openId: string;
  damage: number;
  reason: string;
  /** True when this damage is unblockable (e.g. from `grab`) and cannot be prevented by `endure`. */
  unblockable?: boolean;
}

export interface SettlementResult {
  damages: DamageRecord[];
  eliminated: string[];
}

export interface VoteResult {
  targetOpenId: string | null;
  votes: number;
  isTie: boolean;
  tieTargets: string[];
}

export interface WinnerResult {
  winnerCamp: Camp;
  reason: string;
  decidedAt: Date;
}

export interface RoundState {
  floor: number;
  environmentCardCode: string | null;
  roundKind: RoundKind | null;
  currentVoteRound: number;
  actionSubmissions: ActionSubmission[];
  voteSubmissions: VoteSubmissionRecord[];
  settlementResult: SettlementResult | null;
  voteResult: VoteResult | null;
}

export interface MatchPlayerState {
  openId: string;
  seatNo: number;
  identityCode: string;
  chosenRoleCode: string | null;
  maxHp: number | null;
  currentHp: number | null;
  isAlive: boolean;
  canSpeak: boolean;
  canVote: boolean;
  voteModifier: number;
  roleOptions: string[];
  handCards: HandCard[];
  status: Record<string, unknown>;
}

export interface RoomPlayerState {
  openId: string;
  seatNo: number;
  nickname: string;
  avatar: string;
  isReady: boolean;
  joinedAt: Date;
}

export interface DeckEntry {
  position: number;
  environmentCardCode: string;
}

export interface MatchState {
  matchId: string;
  players: MatchPlayerState[];
  deck: DeckEntry[];
  rounds: RoundState[];
  winnerResult: WinnerResult | null;
}

// ── Legacy type aliases kept for Prisma/userRepository backward compat ────────
export type RoleConfig = "independent" | "faction";

export interface RoomConfig {
  playerCount: number;
  roleConfig: RoleConfig;
}
