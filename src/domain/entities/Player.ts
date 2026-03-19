import { ActionCard, Role } from "../types";

export interface PlayerState {
  openId: string;
  nickname: string;
  avatar: string;
  seatNo: number;
  candidateRoles: Role[];
  selectedRole: Role | null;
  hp: number;
  votePower: number;
  isAlive: boolean;
  selectedAction: ActionCard | null;
  passedBet: boolean;
  canSpeak: boolean;
  canVote: boolean;
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
    seatNo: number;
    joinTime?: Date;
  }) {
    this.state = {
      openId: params.openId,
      nickname: params.nickname,
      avatar: params.avatar,
      seatNo: params.seatNo,
      candidateRoles: [],
      selectedRole: null,
      hp: 4,
      votePower: 1,
      isAlive: true,
      selectedAction: null,
      passedBet: false,
      canSpeak: true,
      canVote: true,
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
      seatNo: state.seatNo,
      joinTime: state.joinTime,
    });
    p.state = { ...state, candidateRoles: [...state.candidateRoles] };
    return p;
  }

  get openId(): string {
    return this.state.openId;
  }

  get isAlive(): boolean {
    return this.state.isAlive;
  }

  get votePower(): number {
    return this.state.votePower;
  }

  get hp(): number {
    return this.state.hp;
  }

  get selectedRole(): Role | null {
    return this.state.selectedRole;
  }

  get isReady(): boolean {
    return this.state.isReady;
  }

  get canVote(): boolean {
    return this.state.canVote;
  }

  get seatNo(): number {
    return this.state.seatNo;
  }

  get selectedAction(): ActionCard | null {
    return this.state.selectedAction;
  }

  get passedBet(): boolean {
    return this.state.passedBet;
  }

  get candidateRoles(): Role[] {
    return [...this.state.candidateRoles];
  }

  toState(): PlayerState {
    return { ...this.state, candidateRoles: [...this.state.candidateRoles] };
  }

  setSeatNo(seatNo: number): void {
    this.state.seatNo = seatNo;
  }

  setReady(ready: boolean): void {
    this.state.isReady = ready;
  }

  setCandidateRoles(roles: Role[]): void {
    this.state.candidateRoles = [...roles];
  }

  confirmRoleSelection(role: Role): void {
    if (this.state.selectedRole) {
      throw new Error(`Player ${this.state.openId} has already selected a role`);
    }
    if (!this.state.candidateRoles.includes(role)) {
      throw new Error(`Role ${role} is not available for player ${this.state.openId}`);
    }
    this.state.selectedRole = role;
  }

  submitBet(input: { selectedAction?: ActionCard; passedBet?: boolean }): void {
    const passedBet = input.passedBet === true;
    const selectedAction = input.selectedAction ?? null;
    if (!passedBet && !selectedAction) {
      throw new Error("Either selectedAction or passedBet must be provided");
    }
    if (passedBet && selectedAction) {
      throw new Error("Cannot submit an action card and passedBet together");
    }
    this.state.selectedAction = selectedAction;
    this.state.passedBet = passedBet;
  }

  resolveDamage(damage: number): void {
    this.state.hp = Math.max(0, this.state.hp - damage);
    if (this.state.hp === 0) {
      this.state.isAlive = false;
      this.state.canSpeak = false;
      this.state.canVote = false;
      this.state.votePower = 0;
    }
  }

  applyHeal(heal: number): void {
    this.state.hp += heal;
  }

  eliminate(): void {
    this.state.hp = 0;
    this.state.isAlive = false;
    this.state.canSpeak = false;
    this.state.canVote = false;
    this.state.votePower = 0;
  }

  resolveRoundPermission(): number {
    if (!this.state.isAlive || this.state.passedBet) {
      this.state.votePower = 0;
      this.state.canSpeak = false;
      this.state.canVote = false;
      return 0;
    }

    this.state.canSpeak = true;
    this.state.canVote = true;
    this.state.votePower =
      this.state.selectedAction === ActionCard.scold ? 1.5 : 1;
    return this.state.votePower;
  }

  submitVote(voteTarget: string): void {
    if (!this.state.isAlive) {
      throw new Error(`Player ${this.state.openId} is not alive and cannot vote`);
    }
    if (!this.state.canVote) {
      throw new Error(`Player ${this.state.openId} has no vote right this round`);
    }
    this.state.voteTarget = voteTarget;
  }

  resetRoundState(): void {
    this.state.selectedAction = null;
    this.state.passedBet = false;
    this.state.voteTarget = null;
    this.state.votePower = this.state.isAlive ? 1 : 0;
    this.state.canSpeak = this.state.isAlive;
    this.state.canVote = this.state.isAlive;
  }
}
