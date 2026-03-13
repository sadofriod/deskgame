// SettlementService – docs/implements/04-domain-services-impl.md
// Resolves damage from the environment card and action submissions.

import { ActionCard, ActionSubmission, DamageRecord, EnvironmentCard, SettlementResult } from "../types";

export interface PlayerSnapshot {
  openId: string;
  hp: number;
  isAlive: boolean;
}

export class SettlementService {
  settle(
    environmentCard: EnvironmentCard,
    actionSubmissions: ActionSubmission[],
    players: PlayerSnapshot[]
  ): SettlementResult {
    const isGasTurn =
      environmentCard === EnvironmentCard.gas ||
      environmentCard === EnvironmentCard.stink ||
      environmentCard === EnvironmentCard.stew;

    const damageMap = new Map<string, number>();
    const immuneSet = new Set<string>();

    const alivePlayers = players.filter((p) => p.isAlive);
    for (const p of alivePlayers) {
      damageMap.set(p.openId, 0);
    }

    // ── Step 1: mark immune players (忍 – endure) ──────────────────────────
    for (const sub of actionSubmissions) {
      if (sub.actionCard === ActionCard.endure) {
        immuneSet.add(sub.openId);
      }
    }

    // ── Step 2: environment damage ─────────────────────────────────────────
    if (environmentCard === EnvironmentCard.gas) {
      // 有屁: 1 damage to all alive players
      for (const p of alivePlayers) {
        if (!immuneSet.has(p.openId)) {
          damageMap.set(p.openId, (damageMap.get(p.openId) ?? 0) + 1);
        }
      }
    } else if (environmentCard === EnvironmentCard.stink) {
      // 有臭屁: 2 damage to all alive players
      for (const p of alivePlayers) {
        if (!immuneSet.has(p.openId)) {
          damageMap.set(p.openId, (damageMap.get(p.openId) ?? 0) + 2);
        }
      }
    } else if (environmentCard === EnvironmentCard.stew) {
      // 有闷屁: pressed (endure) => 1 dmg; empty-press (no endure) => 3 dmg
      for (const p of alivePlayers) {
        if (immuneSet.has(p.openId)) {
          damageMap.set(p.openId, (damageMap.get(p.openId) ?? 0) + 1);
        } else {
          damageMap.set(p.openId, (damageMap.get(p.openId) ?? 0) + 3);
        }
      }
      // For stew, immunity from endure doesn't apply – it's handled above
      immuneSet.clear();
    }

    // ── Step 3: action damage ──────────────────────────────────────────────
    for (const sub of actionSubmissions) {
      const player = players.find((p) => p.openId === sub.openId);
      if (!player?.isAlive) continue;

      if (sub.actionCard === ActionCard.blow) {
        // 吹: gas turn only, 1 damage to target (adjacent)
        // Note: target resolution requires adjacency info; here we apply to
        // each player that received this card via caller-provided targeting.
        // The aggregate resolves targeting; service applies damage only.
      } else if (sub.actionCard === ActionCard.grab) {
        // 抓: unblockable 1 damage (to target – handled by aggregate)
      } else if (sub.actionCard === ActionCard.suck && isGasTurn) {
        // 吸 in gas turn: +1 extra damage to self
        damageMap.set(sub.openId, (damageMap.get(sub.openId) ?? 0) + 1);
      }
    }

    // ── Step 4: build damage records ──────────────────────────────────────
    const damages: DamageRecord[] = [];
    for (const [openId, dmg] of damageMap) {
      if (dmg > 0) {
        damages.push({ openId, damage: dmg, reason: "settlement" });
      }
    }

    // ── Step 5: determine eliminations ────────────────────────────────────
    const eliminated: string[] = [];
    for (const p of alivePlayers) {
      const totalDmg = damages.find((d) => d.openId === p.openId)?.damage ?? 0;
      if (p.hp - totalDmg <= 0) {
        eliminated.push(p.openId);
      }
    }

    return { damages, eliminated };
  }

  /**
   * Compute vote powers for all players based on their current action cards.
   * Used after actionResolve stage.
   */
  computeVotePowers(
    actionSubmissions: ActionSubmission[],
    players: PlayerSnapshot[]
  ): Map<string, number> {
    const result = new Map<string, number>();
    for (const p of players) {
      if (!p.isAlive) {
        result.set(p.openId, 0);
        continue;
      }
      const sub = actionSubmissions.find((s) => s.openId === p.openId);
      if (!sub) {
        result.set(p.openId, 0);
        continue;
      }
      const bonus = sub.actionCard === ActionCard.scold ? 0.5 : 0;
      result.set(p.openId, 1 + bonus);
    }
    return result;
  }
}
