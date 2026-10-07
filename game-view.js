import {
  bidLabel,
  bidLevels,
  bidValue,
  canRaise,
  nextPlayerIndex,
  raiseLevel,
  teamOf,
} from "./game-rules.js";
import { Player } from "./cards.js";
import { formatGameEvent } from "./game-events.js";

const playerPositions = ["bottom", "right", "top", "left"];

export function createGameView({
  game,
  getPlayerIndex,
  getHostPlayerIndex,
  getIsSpectator,
  getRoomPlayers,
  hasLegacySeats,
  onPlayCard,
  onPlaceBid,
  onRespondToBid,
}) {
  const elements = {
    scoreA: document.getElementById("scoreA"),
    scoreB: document.getElementById("scoreB"),
    messages: document.getElementById("messages"),
    gameEvents: document.getElementById("gameEvents"),
    tableCards: document.getElementById("tableCards"),
    mainCards: document.getElementById("mainCards"),
    otherCardContainers: {
      top: document.getElementById("pTopCards"),
      left: document.getElementById("pLeftCards"),
      right: document.getElementById("pRightCards"),
    },
    players: {
      top: document.getElementById("pTop"),
      left: document.getElementById("pLeft"),
      right: document.getElementById("pRight"),
      bottom: document.getElementById("main"),
    },
    names: {
      top: document.getElementById("nameTop"),
      left: document.getElementById("nameLeft"),
      right: document.getElementById("nameRight"),
      bottom: document.getElementById("nameBottom"),
    },
    labels: {
      top: document.getElementById("labelTop"),
      left: document.getElementById("labelLeft"),
      right: document.getElementById("labelRight"),
      bottom: document.getElementById("labelBottom"),
    },
    bidDialog: document.getElementById("bidDialog"),
    bidDialogTitle: document.getElementById("bidDialogTitle"),
    bidDialogMessage: document.getElementById("bidDialogMessage"),
    bidDialogActions: document.getElementById("bidDialogActions"),
    closeBidDialog: document.getElementById("closeBidDialog"),
    openBidDialog: document.getElementById("openBidDialog"),
  };
  const seenGameEventIds = new Set();
  let gameEventHistoryInitialized = false;

  function viewerPlayerIndex() {
    const playerIndex = getPlayerIndex();
    return Number.isInteger(playerIndex) ? playerIndex : 0;
  }

  function render(state) {
    if (!state) {
      clearGame();
      return;
    }

    const playerIndex = getPlayerIndex();
    if ((!Number.isInteger(playerIndex) && !getIsSpectator()) || !state.players) {
      return;
    }

    const playerStates = Array.from(
      { length: 4 },
      (_, index) => state.players[index],
    );
    if (playerStates.some((player) => !player)) return;
    updateGameMessage();
    syncGameState(state, playerStates);
    renderScore();
    renderMainHand();
    renderOtherHands();
    renderTable();
    renderPlayerHighlights();
    renderPlayerLabels();
    renderPlayerNames();
    updateBidControls(state);

    if (state.status === "finished" && state.matchWinner) {
      elements.messages.textContent =
        `L'equip ${state.matchWinner} ha guanyat el joc!`;
    }
  }

  function clearGame() {
    elements.openBidDialog.hidden = true;
    if (elements.bidDialog.open) elements.bidDialog.close();
    elements.gameEvents.replaceChildren();
    elements.scoreA.textContent = "0";
    elements.scoreB.textContent = "0";

    for (const element of Object.values(elements.names)) {
      element.textContent = "";
    }
    for (const element of Object.values(elements.labels)) {
      element.textContent = "";
    }
    for (const element of Object.values(elements.players)) {
      element.classList.remove("activePlayer", "hostPlayer");
    }
    elements.mainCards.replaceChildren();
    elements.tableCards.replaceChildren();
    for (const container of Object.values(elements.otherCardContainers)) {
      container.replaceChildren();
    }
    game.players = [];
    game.table = [];
  }

  function showGameEvents(eventLog) {
    if (!gameEventHistoryInitialized) {
      for (const event of eventLog) {
        if (event?.id) seenGameEventIds.add(event.id);
      }
      gameEventHistoryInitialized = true;
      return;
    }

    const currentEventIds = new Set(
      eventLog.map((event) => event?.id).filter(Boolean),
    );
    for (const eventId of seenGameEventIds) {
      if (!currentEventIds.has(eventId)) seenGameEventIds.delete(eventId);
    }

    for (const event of eventLog) {
      if (!event?.id || seenGameEventIds.has(event.id)) continue;
      seenGameEventIds.add(event.id);

      const message = formatGameEvent(event);
      if (!message) continue;

      const notice = document.createElement("div");
      notice.className = "game-event";
      notice.textContent = message;
      elements.gameEvents.appendChild(notice);
      setTimeout(() => notice.remove(), 6_000);
    }
  }

  function updateGameMessage() {
    if (hasLegacySeats(getRoomPlayers())) {
      elements.messages.textContent =
        "Aquesta partida fa servir una versió anterior. " +
        "Acabeu-la abans de reiniciar la sala per activar les substitucions.";
    } else if (!getIsSpectator()) {
      elements.messages.textContent = "";
    }
  }

  function syncGameState(state, playerStates) {
    game.deck.cards = state.deck;
    game.players = playerStates.map((playerState, index) => {
      const player = new Player(
        getRoomPlayers()[index]?.name || playerState.name,
        index,
      );
      player.cards = Array.isArray(playerState.cards) ? playerState.cards : [];
      return player;
    });

    game.dealerIndex = state.dealerIndex;
    game.manoIndex = state.manoIndex;
    game.turnPlayerIndex = state.turnPlayerIndex;
    game.table = state.table || [];
    game.trickWinners = state.trickWinners || [];
    game.currentBid = state.currentBid || 1;
    game.bidLevel =
      state.bidLevel === "volnou" ? "valnou" : state.bidLevel || "none";
    game.pendingBid = state.pendingBid || null;
    game.status = state.status || "playing";
    game.matchWinner = state.matchWinner || null;
    game.scoreA = state.scoreA || 0;
    game.scoreB = state.scoreB || 0;
  }

  function renderScore() {
    elements.scoreA.textContent = game.scoreA;
    elements.scoreB.textContent = game.scoreB;
  }

  function renderMainHand() {
    const player = game.players[viewerPlayerIndex()];
    elements.mainCards.replaceChildren();

    for (const card of player.cards) {
      const cardElement = document.createElement("img");
      cardElement.classList.add("card");
      if (player.index !== getPlayerIndex()) {
        cardElement.src = "cards/rev.png";
      } else {
        cardElement.classList.add("interactable");
        cardElement.src = `cards/${card.palo}/${card.num}${card.palo}.png`;
        cardElement.addEventListener("click", () => onPlayCard(card));
      }
      elements.mainCards.appendChild(cardElement);
    }
  }

  function renderOtherHands() {
    for (const container of Object.values(elements.otherCardContainers)) {
      container.replaceChildren();
    }

    const viewerIndex = viewerPlayerIndex();
    for (let index = 0; index < 4; index++) {
      if (index === viewerIndex) continue;

      const position = playerPositions[(index - viewerIndex + 4) % 4];
      const container = elements.otherCardContainers[position];
      if (!container) continue;

      for (const _card of game.players[index].cards) {
        const cardBack = document.createElement("img");
        cardBack.classList.add("card");
        cardBack.src = "cards/rev.png";
        container.appendChild(cardBack);
      }
    }
  }

  function renderTable() {
    elements.tableCards.replaceChildren();
    for (const entry of game.table) {
      const cardImage = document.createElement("img");
      cardImage.classList.add("card");
      cardImage.src =
        `cards/${entry.card.palo}/${entry.card.num}${entry.card.palo}.png`;
      elements.tableCards.appendChild(cardImage);
    }
  }

  function renderPlayerLabels() {
    for (const label of Object.values(elements.labels)) {
      label.textContent = "";
    }

    const viewerIndex = viewerPlayerIndex();
    for (let index = 0; index < 4; index++) {
      const position = playerPositions[(index - viewerIndex + 4) % 4];
      if (index === game.manoIndex) elements.labels[position].textContent = "MÀ";
      if (index === nextPlayerIndex(game.manoIndex)) {
        elements.labels[position].textContent = "PEU";
      }
      if (index === game.dealerIndex) {
        const label = elements.labels[position];
        label.textContent = `${label.textContent ? `${label.textContent} · ` : ""}REPARTIDOR`;
      }
    }
  }

  function renderPlayerNames() {
    for (const name of Object.values(elements.names)) {
      name.textContent = "";
    }

    const viewerIndex = viewerPlayerIndex();
    for (let index = 0; index < 4; index++) {
      const position = playerPositions[(index - viewerIndex + 4) % 4];
      elements.names[position].textContent = game.players[index].name;
    }
  }

  function renderPlayerHighlights() {
    for (const player of Object.values(elements.players)) {
      player.classList.remove("activePlayer", "hostPlayer");
    }

    const viewerIndex = viewerPlayerIndex();
    const position =
      playerPositions[(game.turnPlayerIndex - viewerIndex + 4) % 4];
    elements.players[position].classList.add("activePlayer");
    if (game.turnPlayerIndex === getHostPlayerIndex()) {
      elements.players[position].classList.add("hostPlayer");
    }
  }

  function addBidDialogAction(label, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", action, { once: true });
    elements.bidDialogActions.appendChild(button);
  }

  function updateBidControls(state) {
    const playerIndex = getPlayerIndex();
    if (!Number.isInteger(playerIndex)) {
      elements.openBidDialog.hidden = true;
      elements.closeBidDialog.hidden = true;
      if (elements.bidDialog.open) elements.bidDialog.close();
      return;
    }

    const pendingBid = state.pendingBid || null;
    const canStartBid =
      state.status === "playing" &&
      !pendingBid &&
      state.turnPlayerIndex === playerIndex &&
      canRaise(state.bidLevel || "none");
    const isResponder =
      pendingBid?.responderTeam === teamOf(playerIndex);

    elements.openBidDialog.hidden = !canStartBid;
    elements.closeBidDialog.hidden = Boolean(isResponder);

    if (state.status !== "playing") {
      if (elements.bidDialog.open) elements.bidDialog.close();
      return;
    }

    if (isResponder) {
      renderBidResponse(pendingBid);
      return;
    }

    if (pendingBid) {
      if (elements.bidDialog.open) elements.bidDialog.close();
      return;
    }

    if (elements.bidDialog.open) {
      const nextLevel = raiseLevel(state.bidLevel || "none");
      elements.bidDialogTitle.textContent = "Fer una aposta";
      const points = bidValue(nextLevel);
      elements.bidDialogMessage.textContent =
        `La següent aposta és ${bidLabel(nextLevel)} (${points} ${points === 1 ? "punt" : "punts"}).`;
      elements.bidDialogActions.replaceChildren();
      addBidDialogAction(`Dir ${bidLabel(nextLevel)}`, () =>
        onPlaceBid(nextLevel),
      );
    }
  }

  function renderBidResponse(pendingBid) {
    elements.bidDialogTitle.textContent = `${bidLabel(pendingBid.level)}!`;
    elements.bidDialogMessage.textContent =
      `L'equip ${pendingBid.team} ha cantat ${bidLabel(pendingBid.level)} per ${bidValue(pendingBid.level)} punts. ` +
      "L'equip contrari pot acceptar l'aposta, rebutjar-la o apujar-la.";
    elements.bidDialogActions.replaceChildren();
    addBidDialogAction("Acceptar", () => onRespondToBid("accept"));

    const previousLevel =
      bidLevels[bidLevels.indexOf(pendingBid.level) - 1] || "none";
    const declinedPoints = bidValue(previousLevel);
    addBidDialogAction(
      pendingBid.level === "jocfora"
        ? "Rebutjar (perdre el joc)"
        : `Rebutjar (${declinedPoints} ${declinedPoints === 1 ? "punt" : "punts"})`,
      () => onRespondToBid("decline"),
    );

    const nextLevel = raiseLevel(pendingBid.level);
    if (nextLevel) {
      addBidDialogAction(`Apujar a ${bidLabel(nextLevel)}`, () =>
        onRespondToBid("raise"),
      );
    }

    if (!elements.bidDialog.open) elements.bidDialog.showModal();
  }

  elements.openBidDialog.addEventListener("click", () => {
    if (!elements.bidDialog.open) elements.bidDialog.showModal();
    updateBidControls({
      status: game.status || "playing",
      pendingBid: game.pendingBid,
      turnPlayerIndex: game.turnPlayerIndex,
      bidLevel: game.bidLevel,
    });
  });

  elements.closeBidDialog.addEventListener("click", () =>
    elements.bidDialog.close(),
  );
  elements.bidDialog.addEventListener("cancel", (event) => {
    const playerIndex = getPlayerIndex();
    if (
      Number.isInteger(playerIndex) &&
      game.pendingBid?.responderTeam === teamOf(playerIndex)
    ) {
      event.preventDefault();
    }
  });

  return {
    render,
    showGameEvents,
    closeBidDialog() {
      if (elements.bidDialog.open) elements.bidDialog.close();
    },
  };
}
