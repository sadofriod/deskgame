import { HandCard, MatchPlayerState } from "../types";

const ROLE_BASE_HP: Record<string, number> = {
  pumpkin: 5,
  plague_doctor: 5,
  introvert: 5,
  rhinitis_kid: 5,
  young_master: 3,
};
const DEFAULT_HP = 4;

export class MatchPlayer {
  readonly state: MatchPlayerState;

  constructor(state: MatchPlayerState) {
    this.state = state;
  }

  get openId(): string {
    return this.state.openId;
  }
  get isAlive(): boolean {
    return this.state.isAlive;
  }
  get canVote(): boolean {
    return this.state.canVote;
  }
  get currentHp(): number {
    return this.state.currentHp ?? 0;
  }

  confirmRole(roleCode: string): void {
    if (this.state.chosenRoleCode !== null) throw new Error("Role already confirmed");
    if (!this.state.roleOptions.includes(roleCode))
      throw new Error(`roleCode "${roleCode}" not in roleOptions`);
    const baseHp = ROLE_BASE_HP[roleCode] ?? DEFAULT_HP;
    this.state.chosenRoleCode = roleCode;
    this.state.maxHp = baseHp;
    this.state.currentHp = baseHp;
  }

  consumeCard(cardInstanceId: string): void {
    const card = this.state.handCards.find((c) => c.cardInstanceId === cardInstanceId);
    if (!card) throw new Error(`Card "${cardInstanceId}" not found`);
    if (card.consumed) throw new Error(`Card "${cardInstanceId}" already consumed`);
    card.consumed = true;
  }

  applyDamage(amount: number): void {
    if (amount <= 0) return;
    this.state.currentHp = Math.max(0, (this.state.currentHp ?? 0) - amount);
    if (this.state.currentHp <= 0) this.eliminate();
  }

  eliminate(): void {
    this.state.isAlive = false;
    this.state.canSpeak = false;
    this.state.canVote = false;
  }

  toState(): MatchPlayerState {
    return { ...this.state, handCards: this.state.handCards.map((c) => ({ ...c })) };
  }
}

// Backward-compat export used by old repository code
export type { MatchPlayerState as PlayerState };
export { MatchPlayer as Player };
