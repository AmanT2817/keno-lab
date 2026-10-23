import { db } from "@/lib/db";
import {
  drawKenoNumbers,
  countMatches,
  matchedNumbers,
  DRAW_ALGORITHM_VERSION,
  KENO_DRAW_SIZE,
  KENO_POOL_SIZE,
} from "./engine";
import { calculatePayout, PAYTABLE_VERSION } from "./paytable";

/**
 * Round phase durations (milliseconds).
 *
 * Timeline per cycle:
 *   OPEN       → users pick numbers (30s)
 *   CLOSED/DRAWING → reveal 20 numbers at 1s intervals (20s)
 *   SETTLED/RESULTS → final results + countdown to next round (30s)
 *   total cycle = 80s
 *
 * The DRAW phase is 20 seconds because we reveal one number per second
 * and there are 20 winning numbers. The server persists all 20 numbers
 * IMMEDIATELY when the round transitions to DRAWN — the 1-second-per-
 * number reveal is a server-driven animation driven by drawnAt timestamp.
 */
export const OPEN_DURATION_MS = 30_000;
export const DRAW_DURATION_MS = KENO_DRAW_SIZE * 1_000; // 20 numbers × 1s
export const WAIT_DURATION_MS = 30_000;

export type RoundPhase =
  | "OPEN"
  | "DRAWING"
  | "RESULTS"
  | "WAITING";

export interface CurrentRoundState {
  round: {
    id: string;
    roundNumber: number | null;
    status: string;
    phase: RoundPhase;
    opensAt: string;
    closesAt: string | null;
    drawnAt: string | null;
    settledAt: string | null;
    scheduledClosesAt: string | null;
    scheduledDrawnAt: string | null;
    scheduledSettledAt: string | null;
    scheduledNextRoundAt: string | null;
    rulesVersion: string;
  };
  draw: {
    winningNumbers: number[]; // only the revealed subset (during DRAWING)
    revealedCount: number;
    totalCount: number;
    algorithmVersion: string | null;
  };
  serverTime: number; // ms epoch — clients use this to stay synced
  countdownMs: number; // ms until next phase transition
  nextPhaseLabel: string; // human-readable description of what's next
}

/**
 * Lazily advance the round state machine based on the server clock.
 *
 * Called at the start of every API request (current-round, tickets,
 * frequency, etc.) so the round schedule is always up-to-date without
 * needing a separate background worker or cron job.
 *
 * Within a single Prisma transaction:
 *   - If no scheduled round exists yet, create the first one.
 *   - If the most recent scheduled round is OPEN and past scheduledClosesAt
 *     → transition to CLOSED (betting ends).
 *   - If CLOSED and past scheduledDrawnAt → perform the draw (CSPRNG),
 *     persist immutable DrawResult, transition to DRAWN.
 *   - If DRAWN and past scheduledSettledAt → settle ALL tickets for this
 *     round (idempotent), credit payouts, transition to SETTLED.
 *   - If SETTLED and past scheduledNextRoundAt → create the next scheduled
 *     OPEN round, link current.nextRoundId, transition current to ARCHIVED.
 *
 * Note: legacy instant-play rounds (no scheduled timestamps) are skipped
 * by this function — they remain in whatever terminal state they ended in
 * and do not block the scheduled round system from creating a new round.
 */
export async function advanceRoundsIfNeeded(): Promise<void> {
  await db.$transaction(async (tx) => {
    const now = new Date();

    // Find the most recent SCHEDULED round (has scheduledClosesAt set).
    // Legacy instant-play rounds are ignored by the scheduler.
    const current = await tx.gameRound.findFirst({
      where: { scheduledClosesAt: { not: null } },
      orderBy: { scheduledClosesAt: "desc" },
      include: {
        drawResult: true,
        tickets: { include: { ticketResult: true } },
      },
    });

    // No scheduled round exists yet → bootstrap round #1.
    if (!current) {
      await createScheduledRound(tx, 1, now);
      return;
    }

    let round = current;

    // OPEN -> CLOSED (betting closes)
    if (
      round.status === "OPEN" &&
      round.scheduledClosesAt &&
      now >= round.scheduledClosesAt
    ) {
      round = await tx.gameRound.update({
        where: { id: round.id },
        data: { status: "CLOSED", closesAt: now },
        include: {
          drawResult: true,
          tickets: { include: { ticketResult: true } },
        },
      });
    }

    // CLOSED -> DRAWN (perform the draw immediately)
    // The draw is persisted NOW. The 1s-per-number reveal is just an
    // animation driven by `drawnAt` — the authoritative outcome is saved.
    if (
      round.status === "CLOSED" &&
      round.scheduledDrawnAt &&
      now >= round.scheduledDrawnAt
    ) {
      // Idempotency: only create a DrawResult if one doesn't already exist.
      if (!round.drawResult) {
        const drawn = drawKenoNumbers(KENO_POOL_SIZE, KENO_DRAW_SIZE);
        await tx.drawResult.create({
          data: {
            roundId: round.id,
            winningNumbers: JSON.stringify(drawn),
            algorithmVersion: DRAW_ALGORITHM_VERSION,
          },
        });
      }
      round = await tx.gameRound.update({
        where: { id: round.id },
        data: { status: "DRAWN", drawnAt: now },
        include: {
          drawResult: true,
          tickets: { include: { ticketResult: true } },
        },
      });
    }

    // DRAWN -> SETTLED (settle every ticket idempotently)
    if (
      round.status === "DRAWN" &&
      round.scheduledSettledAt &&
      now >= round.scheduledSettledAt &&
      round.drawResult
    ) {
      const drawn = JSON.parse(round.drawResult.winningNumbers) as number[];

      for (const ticket of round.tickets) {
        // Skip if this ticket already has a result (idempotent).
        if (ticket.ticketResult) continue;

        const selected = JSON.parse(ticket.selectedNumbers) as number[];
        const hits = countMatches(selected, drawn);
        const matched = matchedNumbers(selected, drawn);
        const payoutMinor = calculatePayout(
          ticket.spots,
          hits,
          ticket.stakeMinor
        );
        const isWin = payoutMinor > 0;

        await tx.ticketResult.create({
          data: {
            ticketId: ticket.id,
            matchedNumbers: JSON.stringify(matched),
            matchCount: hits,
            payoutMinor,
            isWin,
          },
        });

        if (payoutMinor > 0) {
          await tx.ledgerEntry.create({
            data: {
              playerId: ticket.playerId,
              ticketId: ticket.id,
              roundId: round.id,
              entryType: "PAYOUT_CREDIT",
              amountMinor: payoutMinor,
              idempotencyKey: `payout-${ticket.idempotencyKey}`,
            },
          });
          await tx.player.update({
            where: { id: ticket.playerId },
            data: { balanceMinor: { increment: payoutMinor } },
          });
        }

        await tx.ticket.update({
          where: { id: ticket.id },
          data: { status: "SETTLED" },
        });
      }

      round = await tx.gameRound.update({
        where: { id: round.id },
        data: { status: "SETTLED", settledAt: now },
        include: {
          drawResult: true,
          tickets: { include: { ticketResult: true } },
        },
      });
    }

    // SETTLED -> ARCHIVED + create next OPEN round
    if (
      round.status === "SETTLED" &&
      round.scheduledNextRoundAt &&
      now >= round.scheduledNextRoundAt
    ) {
      const nextRoundNumber = (round.roundNumber ?? 0) + 1;
      const next = await createScheduledRound(tx, nextRoundNumber, now);

      // Link current to next, then archive current.
      await tx.gameRound.update({
        where: { id: round.id },
        data: { status: "ARCHIVED", nextRoundId: next.id },
      });
    }
  });
}

/**
 * Create a new scheduled OPEN round with all four scheduled timestamps.
 */
async function createScheduledRound(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  roundNumber: number,
  startTime: Date
) {
  const opensAt = startTime;
  const scheduledClosesAt = new Date(opensAt.getTime() + OPEN_DURATION_MS);
  // Drawing begins immediately when betting closes (no gap).
  const scheduledDrawnAt = scheduledClosesAt;
  const scheduledSettledAt = new Date(
    scheduledDrawnAt.getTime() + DRAW_DURATION_MS
  );
  const scheduledNextRoundAt = new Date(
    scheduledSettledAt.getTime() + WAIT_DURATION_MS
  );

  return await tx.gameRound.create({
    data: {
      roundNumber,
      status: "OPEN",
      opensAt,
      scheduledClosesAt,
      scheduledDrawnAt,
      scheduledSettledAt,
      scheduledNextRoundAt,
      rulesVersion: PAYTABLE_VERSION,
    },
  });
}

/**
 * Compute the current round state (phase, countdown, revealed draw)
 * for client consumption. Calls `advanceRoundsIfNeeded` first.
 */
export async function getCurrentRoundState(): Promise<CurrentRoundState | null> {
  await advanceRoundsIfNeeded();

  const round = await db.gameRound.findFirst({
    where: { scheduledClosesAt: { not: null } },
    orderBy: { scheduledClosesAt: "desc" },
    include: { drawResult: true },
  });

  if (!round) return null;

  const now = Date.now();
  const drawnAtMs = round.drawnAt ? round.drawnAt.getTime() : null;
  const allDrawn = round.drawResult
    ? (JSON.parse(round.drawResult.winningNumbers) as number[])
    : [];

  // Compute revealedCount based on server time and drawnAt.
  // During DRAWING phase: 1 number per second since drawnAt.
  // Before DRAWN: 0 revealed.
  // After SETTLED: all 20 revealed.
  let revealedCount = 0;
  if (round.status === "DRAWN" && drawnAtMs != null) {
    const elapsed = now - drawnAtMs;
    // First number reveals immediately at drawnAt; subsequent every 1000ms.
    revealedCount = Math.min(
      KENO_DRAW_SIZE,
      Math.floor(elapsed / 1000) + 1
    );
  } else if (
    round.status === "SETTLED" ||
    round.status === "ARCHIVED"
  ) {
    revealedCount = KENO_DRAW_SIZE;
  }

  // Map DB status to client-facing phase.
  let phase: RoundPhase;
  let countdownMs = 0;
  let nextPhaseLabel = "";

  if (round.status === "OPEN") {
    phase = "OPEN";
    countdownMs = round.scheduledClosesAt
      ? Math.max(0, round.scheduledClosesAt.getTime() - now)
      : 0;
    nextPhaseLabel = "Betting closes";
  } else if (round.status === "CLOSED") {
    // CLOSED is a transient state — we transition to DRAWN immediately.
    // If we somehow see CLOSED here, treat as DRAWING.
    phase = "DRAWING";
    countdownMs = round.scheduledSettledAt
      ? Math.max(0, round.scheduledSettledAt.getTime() - now)
      : 0;
    nextPhaseLabel = "Drawing complete";
  } else if (round.status === "DRAWN") {
    phase = "DRAWING";
    countdownMs = round.scheduledSettledAt
      ? Math.max(0, round.scheduledSettledAt.getTime() - now)
      : 0;
    nextPhaseLabel = "Drawing complete";
  } else if (round.status === "SETTLED") {
    phase = "RESULTS";
    countdownMs = round.scheduledNextRoundAt
      ? Math.max(0, round.scheduledNextRoundAt.getTime() - now)
      : 0;
    nextPhaseLabel = "Next round opens";
  } else {
    // ARCHIVED — a new round should already have been created by advance.
    phase = "WAITING";
    countdownMs = 0;
    nextPhaseLabel = "Next round";
  }

  return {
    round: {
      id: round.id,
      roundNumber: round.roundNumber,
      status: round.status,
      phase,
      opensAt: round.opensAt.toISOString(),
      closesAt: round.closesAt?.toISOString() ?? null,
      drawnAt: round.drawnAt?.toISOString() ?? null,
      settledAt: round.settledAt?.toISOString() ?? null,
      scheduledClosesAt: round.scheduledClosesAt?.toISOString() ?? null,
      scheduledDrawnAt: round.scheduledDrawnAt?.toISOString() ?? null,
      scheduledSettledAt: round.scheduledSettledAt?.toISOString() ?? null,
      scheduledNextRoundAt: round.scheduledNextRoundAt?.toISOString() ?? null,
      rulesVersion: round.rulesVersion,
    },
    draw: {
      winningNumbers: allDrawn.slice(0, revealedCount),
      revealedCount,
      totalCount: allDrawn.length,
      algorithmVersion: round.drawResult?.algorithmVersion ?? null,
    },
    serverTime: now,
    countdownMs,
    nextPhaseLabel,
  };
}
