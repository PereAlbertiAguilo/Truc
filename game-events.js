import { bidLabel } from "./game-rules.js";

const suitNames = {
  oro: "oros",
  copa: "copes",
  esp: "espases",
  basto: "bastos",
};

export function formatGameEvent(event) {
  switch (event.type) {
    case "game-started":
      return "Comença el joc!";
    case "card-played":
      return `${event.playerName} ha jugat la carta ${event.card.num} de ${suitNames[event.card.palo] || event.card.palo}.`;
    case "trick-won":
      return `L'equip ${event.team} guanya la basa ${event.trickNumber}.`;
    case "trick-tied":
      return formatTrickTie(event);
    case "bid-called":
      return `L'equip ${event.team} ha cantat ${bidLabel(event.level)}: ${formatPoints(event.points)}.`;
    case "bid-accepted":
      return `L'equip ${event.acceptingTeam} ha acceptat ${bidLabel(event.level)}. La mà val ${formatPoints(event.points)}.`;
    case "bid-declined":
      return `L'equip ${event.decliningTeam} ha rebutjat ${bidLabel(event.level)}. L'equip ${event.team} guanya ${formatPoints(event.points)}.`;
    case "hand-won":
      return `L'equip ${event.team} guanya la mà i suma ${formatPoints(event.points)}.`;
    case "game-won":
      return `L'equip ${event.team} ha guanyat el joc!`;
    default:
      return "";
  }
}

function formatPoints(points) {
  return `${points} ${points === 1 ? "punt" : "punts"}`;
}

function formatTrickTie(event) {
  if (event.trickNumber === 1) {
    return "La primera basa ha acabat en empat. La segona decidirà la mà, llevat que també acabi en empat.";
  }

  if (event.trickNumber === 2) {
    if (event.firstTrick === "tie") {
      return "La segona basa també ha acabat en empat. La tercera decidirà la mà.";
    }
    return `La segona basa ha acabat en empat. Com que l'equip ${event.firstTrick} havia guanyat la primera, guanya la mà.`;
  }

  if (event.firstTrick === "tie") {
    return `La tercera basa també ha acabat en empat. L'equip de mà (${event.manoTeam}) guanya la mà.`;
  }

  return `La tercera basa ha acabat en empat. L'equip ${event.firstTrick}, guanyador de la primera, guanya la mà.`;
}
