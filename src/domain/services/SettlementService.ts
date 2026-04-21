import { ActionSubmission, DamageRecord } from "../types";

export interface SettlementInput {
  floor: number;
  environmentCardCode: string | null;
  actionSubmissions: ActionSubmission[];
  /** All players (alive and dead), ordered or with seatNo for adjacency calculations. */
  players: { openId: string; seatNo: number; currentHp: number; isAlive: boolean }[];
}

export interface SettlementOutput {
  damages: DamageRecord[];
  eliminated: string[];
  /** Vote-power modifiers produced this round (e.g. from `scold` in a gas round). */
  voteModifiers: { openId: string; modifier: number }[];
}

const GAS_CARDS = new Set(["gas", "smelly_gas", "stuffy_gas"]);

/**
 * Return the openIds of the nearest alive neighbours on each side of the player
 * at `idx` in the seat-sorted `all` array, skipping dead seats.
 */
function findAdjacentAlive(
  all: { openId: string; isAlive: boolean }[],
  idx: number
): string[] {
  const n = all.length;
  if (n <= 1) return [];
  const targets: string[] = [];

  // Left neighbour (counter-clockwise)
  let left = (idx - 1 + n) % n;
  while (left !== idx && !all[left]!.isAlive) left = (left - 1 + n) % n;
  if (left !== idx && all[left]!.isAlive) targets.push(all[left]!.openId);

  // Right neighbour (clockwise)
  let right = (idx + 1) % n;
  while (right !== idx && !all[right]!.isAlive) right = (right + 1) % n;
  if (right !== idx && right !== left && all[right]!.isAlive)
    targets.push(all[right]!.openId);

  return targets;
}

/** Internal per-source damage entry before endure is applied. */
interface PendingEntry {
  openId: string;
  amount: number;
  reason: string;
  unblockable: boolean;
}

export class SettlementService {
  settle(input: SettlementInput): SettlementOutput {
    const { environmentCardCode, actionSubmissions, players } = input;
    const alivePlayers = players.filter((p) => p.isAlive);

    // Seat-sorted array (includes dead players, needed for wrap-around adjacency)
    const seatSorted = [...players].sort((a, b) => a.seatNo - b.seatNo);

    const pending: PendingEntry[] = [];

    // ── Environment base damage (ordinary) ───────────────────────────────────
    const envReason = environmentCardCode ?? "settlement";
    if (environmentCardCode === "gas") {
      for (const p of alivePlayers)
        pending.push({ openId: p.openId, amount: 1, reason: envReason, unblockable: false });
    } else if (environmentCardCode === "smelly_gas") {
      for (const p of alivePlayers)
        pending.push({ openId: p.openId, amount: 2, reason: envReason, unblockable: false });
    } else if (environmentCardCode === "stuffy_gas") {
      const betterIds = new Set(actionSubmissions.map((s) => s.openId));
      for (const p of alivePlayers) {
        const amount = betterIds.has(p.openId) ? 1 : 3;
        pending.push({ openId: p.openId, amount, reason: envReason, unblockable: false });
      }
    }

    const isGasRound = GAS_CARDS.has(environmentCardCode ?? "");

    // Collect endure players before processing action effects so that endure is
    // applied last (blocking ALL accumulated ordinary damage for that player).
    const endurePlayers = new Set<string>();
    for (const sub of actionSubmissions) {
      const player = players.find((p) => p.openId === sub.openId);
      if (!player?.isAlive) continue;
      if (sub.actionCardCode === "endure") endurePlayers.add(sub.openId);
    }

    // ── Action card effects ──────────────────────────────────────────────────
    const voteModifiers: { openId: string; modifier: number }[] = [];

    for (const sub of actionSubmissions) {
      const player = players.find((p) => p.openId === sub.openId);
      if (!player?.isAlive) continue;

      switch (sub.actionCardCode) {
        case "suck":
          // suck adds +1 ordinary damage to self in gas round
          if (isGasRound) {
            pending.push({ openId: sub.openId, amount: 1, reason: "suck", unblockable: false });
          }
          break;

        case "blow":
          // BUG-02 fix: blow deals 1 ordinary damage to each adjacent alive player (gas round only)
          if (isGasRound) {
            const seatIdx = seatSorted.findIndex((p) => p.openId === sub.openId);
            if (seatIdx !== -1) {
              for (const targetId of findAdjacentAlive(seatSorted, seatIdx)) {
                pending.push({ openId: targetId, amount: 1, reason: "blow", unblockable: false });
              }
            }
          }
          break;

        case "grab":
          // BUG-03 fix: grab deals 1 unblockable damage to target player (gas round only)
          if (isGasRound && sub.targetOpenId) {
            const target = players.find((p) => p.openId === sub.targetOpenId);
            if (target?.isAlive) {
              pending.push({ openId: sub.targetOpenId, amount: 1, reason: "grab", unblockable: true });
            }
          }
          break;

        case "scold":
          // BUG-05 fix: scold grants +0.5 vote power modifier in gas round
          if (isGasRound) {
            voteModifiers.push({ openId: sub.openId, modifier: 0.5 });
          }
          break;
      }
    }

    // BUG-04 fix: endure zeroes out ORDINARY damage to self; unblockable damage still applies
    const finalEntries = pending.filter(
      (e) => !(endurePlayers.has(e.openId) && !e.unblockable)
    );

    // ── Build output ─────────────────────────────────────────────────────────
    const damages: DamageRecord[] = finalEntries.map((e) => ({
      openId: e.openId,
      damage: e.amount,
      reason: e.reason,
      ...(e.unblockable ? { unblockable: true } : {}),
    }));

    // Compute total damage per player to determine eliminations
    const totalByPlayer = new Map<string, number>();
    for (const e of finalEntries) {
      totalByPlayer.set(e.openId, (totalByPlayer.get(e.openId) ?? 0) + e.amount);
    }

    const eliminated: string[] = [];
    for (const p of alivePlayers) {
      const total = totalByPlayer.get(p.openId) ?? 0;
      if (p.currentHp - total <= 0) {
        eliminated.push(p.openId);
      }
    }

    return { damages, eliminated, voteModifiers };
  }
}
