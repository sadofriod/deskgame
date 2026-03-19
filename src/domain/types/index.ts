export type RoleConfig = "independent" | "faction";

export interface RoomConfig {
  playerCount: number;
  roleConfig: RoleConfig;
}

export enum GameState {
  wait = "wait",
  selecting = "selecting",
  playing = "playing",
  ended = "ended",
}

export enum Stage {
  lobby = "lobby",
  roleSelection = "roleSelection",
  bet = "bet",
  action = "action",
  settlement = "settlement",
  discussionVote = "discussionVote",
  review = "review",
}

export const STAGE_ORDER: Stage[] = [
  Stage.lobby,
  Stage.roleSelection,
  Stage.bet,
  Stage.action,
  Stage.settlement,
  Stage.discussionVote,
  Stage.review,
];

export enum Role {
  fatter1 = "fatter1",
  fatter2 = "fatter2",
  fatter = "fatter",
  passenger = "passenger",
}

export enum ActionCard {
  listen = "listen",
  blow = "blow",
  grab = "grab",
  endure = "endure",
  suck = "suck",
  scold = "scold",
}

export enum EnvironmentCard {
  gas = "gas",
  stink = "stink",
  stew = "stew",
  none = "none",
}

export enum WinnerCamp {
  passenger = "passenger",
  fatter = "fatter",
  draw = "draw",
}

export interface VoteResult {
  targetOpenId: string | null;
  votes: number;
  isTie: boolean;
  tieTargets: string[];
  needRevote: boolean;
}

export interface WinnerResult {
  winnerCamp: WinnerCamp;
  reason: string;
  decidedAt: Date;
}

export interface DamageRecord {
  openId: string;
  damage: number;
  reason: string;
}

export interface HealRecord {
  openId: string;
  heal: number;
  reason: string;
}

export interface SettlementResult {
  damages: DamageRecord[];
  heals: HealRecord[];
  eliminated: string[];
}

export interface BetSubmission {
  openId: string;
  selectedAction: ActionCard | null;
  passedBet: boolean;
  submittedAt: Date;
}

export interface VoteSubmission {
  openId: string;
  voteTarget: string;
  votePowerAtSubmit: number;
  submittedAt: Date;
}

export interface ActionLog {
  openId: string;
  effect: string;
  targetOpenIds: string[];
}

export interface Round {
  round: number;
  environmentCard: EnvironmentCard | null;
  betSubmissions: BetSubmission[];
  actionLogs: ActionLog[];
  voteSubmissions: VoteSubmission[];
  voteResult: VoteResult | null;
  settlementResult: SettlementResult | null;
  revoteCount: number;
}
