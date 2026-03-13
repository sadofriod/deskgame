// Domain enums and value objects derived from docs/domain/02-值对象与枚举.md

export enum GameState {
  wait = "wait",
  start = "start",
  end = "end",
}

export enum Stage {
  night = "night",
  action = "action",
  env = "env",
  actionResolve = "actionResolve",
  hurt = "hurt",
  talk = "talk",
  vote = "vote",
}

export const STAGE_ORDER: Stage[] = [
  Stage.night,
  Stage.action,
  Stage.env,
  Stage.actionResolve,
  Stage.hurt,
  Stage.talk,
  Stage.vote,
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

// ──────────────────────────────────────────────
// Value-object shapes
// ──────────────────────────────────────────────

export interface VoteResult {
  targetOpenId: string;
  votes: number;
  isTie: boolean;
  tieTargets: string[];
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

export interface SettlementResult {
  damages: DamageRecord[];
  eliminated: string[];
}

// ──────────────────────────────────────────────
// Submission sub-entities
// ──────────────────────────────────────────────

export interface ActionSubmission {
  openId: string;
  actionCard: ActionCard;
  submittedAt: Date;
}

export interface VoteSubmission {
  openId: string;
  voteTarget: string;
  votePowerAtSubmit: number;
  submittedAt: Date;
}

// ──────────────────────────────────────────────
// Round value object
// ──────────────────────────────────────────────

export interface Round {
  floor: number;
  environmentCard: EnvironmentCard | null;
  actionSubmissions: ActionSubmission[];
  voteSubmissions: VoteSubmission[];
  settlementResult: SettlementResult | null;
}
