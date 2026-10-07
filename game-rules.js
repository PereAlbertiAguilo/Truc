export function teamOf(playerIndex) {
  return playerIndex === 0 || playerIndex === 2 ? "A" : "B";
}

export function otherTeam(team) {
  return team === "A" ? "B" : "A";
}

export function cardRank(card) {
  const rankOrder = {
    amo: 15,
    madona: 14,
    llengoEsp: 13,
    llengoBasto: 12,
    menillaEsp: 11,
    menillaOro: 10,
    3: 9,
    1: 8,
    12: 7,
    11: 6,
    10: 5,
    7: 4,
    6: 3,
    5: 2,
    4: 1,
  };

  const key =
    card.palo === "basto" && card.num === 11
      ? "amo"
      : card.palo === "oro" && card.num === 10
        ? "madona"
        : card.palo === "esp" && card.num === 1
          ? "llengoEsp"
          : card.palo === "basto" && card.num === 1
            ? "llengoBasto"
            : card.palo === "esp" && card.num === 7
              ? "menillaEsp"
              : card.palo === "oro" && card.num === 7
                ? "menillaOro"
                : card.num.toString();

  return rankOrder[key] || 0;
}

export function getTrickWinner(trickCards) {
  let bestRank = -1;
  let winnerIndex = null;
  let tied = false;

  for (const entry of trickCards) {
    const rank = cardRank(entry.card);
    if (rank > bestRank) {
      bestRank = rank;
      winnerIndex = entry.playerIndex;
      tied = false;
    } else if (rank === bestRank) {
      tied = true;
    }
  }

  return tied ? null : winnerIndex;
}

export function getHandWinner(trickWinners, manoIndex) {
  const winsA = trickWinners.filter((winner) => winner === "A").length;
  const winsB = trickWinners.filter((winner) => winner === "B").length;

  if (winsA >= 2) return "A";
  if (winsB >= 2) return "B";
  if (trickWinners.length < 3) return null;
  if (winsA > winsB) return "A";
  if (winsB > winsA) return "B";

  const firstDecisiveTrick = trickWinners.find((winner) => winner !== "tie");
  return firstDecisiveTrick || teamOf(manoIndex);
}

export function nextPlayerIndex(index) {
  return (index + 1) % 4;
}

export const bidLevels = ["none", "truc", "retruc", "valnou", "jocfora"];

export function bidValue(level) {
  switch (level) {
    case "truc":
      return 3;
    case "retruc":
      return 6;
    case "valnou":
      return 9;
    case "jocfora":
      return 18;
    default:
      return 1;
  }
}

export function canRaise(level) {
  return bidLevels.indexOf(level) < bidLevels.length - 1;
}

export function raiseLevel(level) {
  const index = bidLevels.indexOf(level);
  return bidLevels[index + 1] || null;
}

export function bidLabel(level) {
  return (
    {
      truc: "Truc",
      retruc: "Retruc",
      valnou: "Valnou",
      jocfora: "Joc fora",
    }[level] || level
  );
}
