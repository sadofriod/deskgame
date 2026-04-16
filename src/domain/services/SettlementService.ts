import { ActionSubmission, DamageRecord, SettlementResult, Stage } from "../types";

export interface SettlementInput {
  floor: number;
  environmentCardCode: string | null;
  actionSubmissions: ActionSubmission[];
  players: { openId: string; currentHp: number; isAlive: boolean }[];
}

export interface SettlementOutput {
  damages: DamageRecord[];
  eliminated: string[];
}

const GAS_CARDS = new Set(["gas", "smelly_gas", "stuffy_gas"]);

export class SettlementService {
  settle(input: SettlementInput): SettlementOutput {
    const { environmentCardCode, actionSubmissions, players } = input;
    const alivePlayers = players.filter((p) => p.isAlive);
    const damageMap = new Map<string, number>();

    for (const p of alivePlayers) damageMap.set(p.openId, 0);

    // Environment base damage
    if (environmentCardCode === "gas") {
      for (const p of alivePlayers) damageMap.set(p.openId, 1);
    } else if (environmentCardCode === "smelly_gas") {
      for (const p of alivePlayers) damageMap.set(p.openId, 2);
    } else if (environmentCardCode === "stuffy_gas") {
      const betterIds = new Set(actionSubmissions.map((s) => s.openId));
      for (const p of alivePlayers) {
        damageMap.set(p.openId, betterIds.has(p.openId) ? 1 : 3);
      }
    }

    // Action card effects
    const isGasRound = GAS_CARDS.has(environmentCardCode ?? "");
    for (const sub of actionSubmissions) {
      const player = players.find((p) => p.openId === sub.openId);
      if (!player?.isAlive) continue;

      if (sub.actionCardCode === "endure") {
        damageMap.set(sub.openId, 0);
      } else if (sub.actionCardCode === "suck" && isGasRound) {
        damageMap.set(sub.openId, (damageMap.get(sub.openId) ?? 0) + 1);
      }
    }

    const damages: DamageRecord[] = [];
    const eliminated: string[] = [];

    for (const p of alivePlayers) {
      const damage = damageMap.get(p.openId) ?? 0;
      if (damage > 0) {
        damages.push({ openId: p.openId, damage, reason: "settlement" });
      }
      if (p.currentHp - damage <= 0) {
        eliminated.push(p.openId);
      }
    }

    return { damages, eliminated };
  }
}
