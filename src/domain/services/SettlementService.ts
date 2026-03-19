import {
  ActionCard,
  ActionLog,
  BetSubmission,
  DamageRecord,
  EnvironmentCard,
  HealRecord,
  SettlementResult,
} from "../types";

export interface PlayerSnapshot {
  openId: string;
  hp: number;
  isAlive: boolean;
}

export interface SettlementOutput {
  settlementResult: SettlementResult;
  actionLogs: ActionLog[];
}

function addDamage(map: Map<string, number>, openId: string, value: number): void {
  map.set(openId, (map.get(openId) ?? 0) + value);
}

export class SettlementService {
  settle(
    environmentCard: EnvironmentCard,
    betSubmissions: BetSubmission[],
    players: PlayerSnapshot[]
  ): SettlementOutput {
    const alivePlayers = players.filter((player) => player.isAlive);
    const damageMap = new Map<string, number>();
    const healMap = new Map<string, number>();
    const actionLogs: ActionLog[] = [];

    for (const player of alivePlayers) {
      damageMap.set(player.openId, 0);
      healMap.set(player.openId, 0);
    }

    if (environmentCard === EnvironmentCard.gas) {
      for (const player of alivePlayers) {
        addDamage(damageMap, player.openId, 1);
      }
    } else if (environmentCard === EnvironmentCard.stink) {
      for (const player of alivePlayers) {
        addDamage(damageMap, player.openId, 2);
      }
    } else if (environmentCard === EnvironmentCard.stew) {
      for (const player of alivePlayers) {
        addDamage(damageMap, player.openId, 1);
      }
    }

    for (const submission of betSubmissions) {
      const player = players.find((item) => item.openId === submission.openId);
      if (!player?.isAlive) continue;

      if (submission.passedBet) {
        addDamage(
          damageMap,
          submission.openId,
          environmentCard === EnvironmentCard.stew ? 2 : 1
        );
        actionLogs.push({ openId: submission.openId, effect: "pass", targetOpenIds: [] });
        continue;
      }

      if (submission.selectedAction === ActionCard.endure) {
        damageMap.set(submission.openId, 0);
        actionLogs.push({ openId: submission.openId, effect: "endure", targetOpenIds: [] });
        continue;
      }

      if (
        submission.selectedAction === ActionCard.suck &&
        environmentCard !== EnvironmentCard.none
      ) {
        addDamage(damageMap, submission.openId, 1);
      }

      actionLogs.push({
        openId: submission.openId,
        effect: submission.selectedAction ?? "bet",
        targetOpenIds: [],
      });
    }

    const damages: DamageRecord[] = [];
    const heals: HealRecord[] = [];
    const eliminated: string[] = [];
    for (const player of alivePlayers) {
      const damage = damageMap.get(player.openId) ?? 0;
      const heal = healMap.get(player.openId) ?? 0;
      if (damage > 0) {
        damages.push({ openId: player.openId, damage, reason: "settlement" });
      }
      if (heal > 0) {
        heals.push({ openId: player.openId, heal, reason: "settlement" });
      }
      if (player.hp - damage + heal <= 0) {
        eliminated.push(player.openId);
      }
    }

    return {
      settlementResult: { damages, heals, eliminated },
      actionLogs,
    };
  }

  computeVotePowers(
    betSubmissions: BetSubmission[],
    players: PlayerSnapshot[]
  ): Map<string, number> {
    const result = new Map<string, number>();
    const submissionMap = new Map(
      betSubmissions.map((submission) => [submission.openId, submission])
    );

    for (const player of players) {
      if (!player.isAlive) {
        result.set(player.openId, 0);
        continue;
      }
      const submission = submissionMap.get(player.openId);
      if (!submission || submission.passedBet) {
        result.set(player.openId, 0);
        continue;
      }
      const bonus = submission.selectedAction === ActionCard.scold ? 0.5 : 0;
      result.set(player.openId, 1 + bonus);
    }
    return result;
  }
}
