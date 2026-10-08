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
  if (trickWinners.length < 2) return null;

  const [firstTrick, secondTrick, thirdTrick] = trickWinners;
  if (firstTrick === "tie") {
    if (secondTrick !== "tie") return secondTrick;
    if (thirdTrick === undefined) return null;
    return thirdTrick === "tie" ? teamOf(manoIndex) : thirdTrick;
  }

  if (secondTrick === "tie" || firstTrick === secondTrick) {
    return firstTrick;
  }
  if (thirdTrick === undefined) return null;

  return thirdTrick === "tie" ? firstTrick : thirdTrick;
}

export function nextPlayerIndex(index) {
  return (index + 1) % 4;
}

export function getEnvitValue(cards) {
  const cardValue = (card) => (card.num >= 1 && card.num <= 7 ? card.num : 0);
  const specialValue = (card) => {
    if (card.palo === "basto" && card.num === 11) return 28;
    if (card.palo === "oro" && card.num === 10) return 27;
    return 0;
  };

  let bestValue = 0;
  for (let firstIndex = 0; firstIndex < cards.length; firstIndex++) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < cards.length;
      secondIndex++
    ) {
      const firstCard = cards[firstIndex];
      const secondCard = cards[secondIndex];
      const firstSpecial = specialValue(firstCard);
      const secondSpecial = specialValue(secondCard);

      if (firstSpecial) {
        bestValue = Math.max(bestValue, firstSpecial + cardValue(secondCard));
      }
      if (secondSpecial) {
        bestValue = Math.max(bestValue, secondSpecial + cardValue(firstCard));
      }
      if (
        firstCard.palo === secondCard.palo &&
        !firstSpecial &&
        !secondSpecial
      ) {
        bestValue = Math.max(
          bestValue,
          20 + cardValue(firstCard) + cardValue(secondCard),
        );
      }
    }
  }

  return Math.min(bestValue, 35);
}

export function getEnvitWinner(teamScores, manoIndex) {
  const playerOrder = Array.from({ length: 4 }, (_, index) => index).sort(
    (first, second) =>
      ((first - manoIndex + 4) % 4) - ((second - manoIndex + 4) % 4),
  );
  const bestA = Math.max(teamScores[0], teamScores[2]);
  const bestB = Math.max(teamScores[1], teamScores[3]);
  if (bestA > bestB) return "A";
  if (bestB > bestA) return "B";
  return teamOf(playerOrder.find((index) => teamScores[index] === bestA));
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
