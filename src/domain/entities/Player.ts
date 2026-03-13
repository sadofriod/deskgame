// Player entity derived from docs/implements/02-player-entity-impl.md
// and docs/domain/01-实体与聚合.md

import { ActionCard, Role } from "../types";

export interface PlayerState {
  openId: string;
  nickname: string;
  avatar: string;
  role: Role | null;
  hp: number;
  votePower: number;
  isAlive: boolean;
  actionCard: ActionCard | null;
  voteTarget: string | null;
  isReady: boolean;
  joinTime: Date;
}

export class Player {
  private state: PlayerState;

  constructor(params: {
    openId: string;
    nickname: string;
    avatar: string;
    joinTime?: Date;
  }) {
    this.state = {
      openId: params.openId,
      nickname: params.nickname,
      avatar: params.avatar,
      role: null,
      hp: 4,
      votePower: 1,
      isAlive: true,
      actionCard: null,
      voteTarget: null,
      isReady: false,
      joinTime: params.joinTime ?? new Date(),
    };
  }

  static restore(state: PlayerState): Player {
    const p = new Player({
      openId: state.openId,
      nickname: state.nickname,
      avatar: state.avatar,
      joinTime: state.joinTime,
    });
    p.state = { ...state };
    return p;
  }

  get openId(): string {
    return this.state.openId;
  }

  get isAlive(): boolean {
    return this.state.isAlive;
  }

  get actionCard(): ActionCard | null {
    return this.state.actionCard;
  }

  get votePower(): number {
    return this.state.votePower;
  }

  get hp(): number {
    return this.state.hp;
  }

  get role(): Role | null {
    return this.state.role;
  }

  get isReady(): boolean {
    return this.state.isReady;
  }

  toState(): PlayerState {
    return { ...this.state };
  }

  /** CardsDealt: assign a role to the player. */
  assignRole(role: Role): void {
    this.state.role = role;
  }

  /** action stage: update the current action card. */
  drawActionCard(card: ActionCard): void {
    this.state.actionCard = card;
  }

  /** Lock the action card upon submission (idempotent – already recorded in Round). */
  submitAction(card: ActionCard): void {
    this.state.actionCard = card;
  }

  /** Record vote target for this floor. */
  submitVote(voteTarget: string): void {
    if (!this.state.isAlive) {
      throw new Error(`Player ${this.state.openId} is not alive and cannot vote`);
    }
    if (!this.state.actionCard) {
      throw new Error(
        `Player ${this.state.openId} has no action card and cannot vote`
      );
    }
    this.state.voteTarget = voteTarget;
  }

  /** Apply damage to the player; marks eliminated when hp drops to zero. */
  resolveDamage(damage: number): void {
    this.state.hp = Math.max(0, this.state.hp - damage);
    if (this.state.hp <= 0) {
      this.state.isAlive = false;
    }
  }

  /**
   * Calculate and cache vote power for this floor.
   * 骂 (scold) adds +0.5; eliminated or no action card => 0.
   */
  resolveVotePower(): number {
    if (!this.state.isAlive || !this.state.actionCard) {
      this.state.votePower = 0;
      return 0;
    }
    const base = 1;
    const bonus = this.state.actionCard === ActionCard.scold ? 0.5 : 0;
    this.state.votePower = base + bonus;
    return this.state.votePower;
  }

  /** Mark the player as ready. */
  setReady(ready: boolean): void {
    this.state.isReady = ready;
  }

  /** Reset per-floor fields at the start of each night stage. */
  resetFloor(): void {
    this.state.actionCard = null;
    this.state.voteTarget = null;
    this.state.votePower = 1;
  }
}
