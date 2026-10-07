const palo = ["oro", "copa", "esp", "basto"];
const DEBUG_RESET = false;

const roomName = "room1";
let myPlayerIndex = null;
let myName = null;
let roomPlayers = {};

// ---------------- FIREBASE INIT ----------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  runTransaction,
  set,
} from "https://www.gstatic.com/firebasejs/10.0.0/firebase-database.js";
import {
  getAuth,
  signInAnonymously,
} from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBOqqQcMMyZsbT61rLXZ_L0wQzW3b4FGxA",
  authDomain: "truc-bb9b5.firebaseapp.com",
  databaseURL:
    "https://truc-bb9b5-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "truc-bb9b5",
  storageBucket: "truc-bb9b5.firebasestorage.app",
  messagingSenderId: "594744065469",
  appId: "1:594744065469:web:6798f27d3e2ff8541226d4",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
try {
  await signInAnonymously(auth);
} catch (error) {
  console.error("Ha fallat l'inici de sessió anònim a Firebase:", error);
  document.getElementById("messages").textContent =
    "No ens hem pogut connectar a Firebase. Comprovau que l'accés anònim estigui activat.";
  throw error;
}

const db = getDatabase(app);
const roomRef = ref(db, roomName);
const gameRef = ref(db, roomName + "/game");
const playersRef = ref(db, roomName + "/lobbyPlayers");
function createPlayerId() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();

  if (cryptoApi?.getRandomValues) {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    const hex = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const playerId = createPlayerId();
let claimingSeat = false;
let startingGame = false;

function isLobbyReady(players) {
  return [0, 1, 2, 3].every(
    (index) => players?.[index]?.name && !Array.isArray(players[index].cards),
  );
}

function startGameIfReady(players) {
  if (myPlayerIndex !== 0 || startingGame || !isLobbyReady(players)) return;

  startingGame = true;
  game.start(players).catch((error) => {
    startingGame = false;
    console.error("No s'ha pogut iniciar sa partida:", error);
  });
}

function updateLobbyMessage(players) {
  const seatedPlayers = [0, 1, 2, 3].filter((index) => players?.[index]?.name)
    .length;
  const message = document.getElementById("messages");

  if (isLobbyReady(players)) {
    if (myPlayerIndex === null) {
      message.textContent =
        "Sa sala és plena. Tancau ses pestanyes antigues o reiniciau sa sala des de sa pestanya de qui l'ha creada.";
    } else {
      message.textContent =
        myPlayerIndex === 0
          ? "Iniciant sa partida…"
          : "Tots es jugadors ja hi són. Esperant que comenci sa partida…";
    }
  } else if (seatedPlayers === 4) {
    message.textContent =
      "Sa sala és plena. Tancau ses pestanyes antigues o reiniciau sa sala des de sa pestanya de qui l'ha creada.";
  } else {
    message.textContent = `Esperant es jugadors (${seatedPlayers}/4)…`;
  }
}

onValue(playersRef, (snapshot) => {
  const players = snapshot.val() || {};
  roomPlayers = players;
  updateLobbyMessage(players);

  if (Object.keys(players).length === 0 && myPlayerIndex !== null) {
    myPlayerIndex = null;
    myName = null;
    startingGame = false;
    game.dealerIndex = 3;
    game.scoreA = 0;
    game.scoreB = 0;
    game.pendingBid = null;
    document.getElementById("reset").hidden = true;
  }

  if (myPlayerIndex === null && !claimingSeat) {
    claimingSeat = true;
    runTransaction(playersRef, (currentPlayers) => {
      const current = currentPlayers || {};
      if (Object.values(current).some((player) => player?.id === playerId)) {
        return;
      }

      const slot = [0, 1, 2, 3].find((index) => !current[index]);
      if (slot === undefined) return;

      return {
        ...current,
        [slot]: { name: `Jugador ${slot + 1}`, id: playerId },
      };
    })
      .then(({ snapshot: claimedSnapshot }) => {
        const claimedPlayers = claimedSnapshot.val() || {};
        const ownSlot = Object.keys(claimedPlayers).find(
          (index) => claimedPlayers[index]?.id === playerId,
        );

        if (ownSlot === undefined) {
          updateLobbyMessage(claimedPlayers);
          return;
        }

        myPlayerIndex = Number(ownSlot);
        myName = claimedPlayers[ownSlot].name;
        roomPlayers = claimedPlayers;
        document.getElementById("reset").hidden = myPlayerIndex !== 0;
        updateLobbyMessage(claimedPlayers);
        if (DEBUG_RESET && myPlayerIndex === 0) set(gameRef, null);
        startGameIfReady(claimedPlayers);
      })
      .catch((error) => {
        console.error("No s'ha pogut reservar un lloc a sa sala:", error);
      })
      .finally(() => {
        claimingSeat = false;
      });
  }

  startGameIfReady(players);
});

// ---------------- TEAMS ----------------
// Team A: players 0 and 2
// Team B: players 1 and 3
function teamOf(playerIndex) {
  return playerIndex === 0 || playerIndex === 2 ? "A" : "B";
}

function otherTeam(team) {
  return team === "A" ? "B" : "A";
}

// ---------------- CARD ----------------
class Card {
  constructor(palo, num) {
    this.palo = palo;
    this.num = num;
  }
}

// ---------------- DECK ----------------
class Deck {
  constructor() {
    this.cards = [];
  }

  fill(excludes) {
    this.cards = [];
    for (let i = 0; i < 4; i++) {
      for (let j = 1; j <= 12; j++) {
        if (excludes.includes(j)) continue;
        this.cards.push(new Card(palo[i], j));
      }
    }
    this.shuffle();
  }

  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  getRandCard() {
    const i = Math.floor(Math.random() * this.cards.length);
    const card = this.cards[i];
    this.cards.splice(i, 1);
    return card;
  }
}

// ---------------- PLAYER ----------------
class Player {
  constructor(name, index) {
    this.name = name;
    this.index = index;
    this.cards = [];
  }

  getHand(deck) {
    this.cards = [];
    for (let i = 0; i < 3; i++) {
      this.cards.push(deck.getRandCard());
    }
  }

  displayCards() {
    const mainCards = document.getElementById("mainCards");
    mainCards.innerHTML = ""; // only clear cards, NOT labels

    if (this.index !== myPlayerIndex) {
      for (let card of this.cards) {
        const back = document.createElement("img");
        back.classList.add("card");
        back.src = "cards/rev.png";
        mainCards.appendChild(back);
      }
      return;
    }

    for (let card of this.cards) {
      const cardElem = document.createElement("img");
      cardElem.classList.add("card", "interactable");
      cardElem.src = `cards/${card.palo}/${card.num}${card.palo}.png`;
      cardElem.onclick = () => this.playCard(card);
      mainCards.appendChild(cardElem);
    }
  }

  playCard(card) {
    if (game.turnPlayerIndex !== myPlayerIndex) return;

    runTransaction(gameRef, (state) => {
      if (
        !state ||
        state.status !== "playing" ||
        state.pendingBid ||
        state.turnPlayerIndex !== myPlayerIndex
      ) {
        return;
      }

      const players = state.players.map((player) => ({
        ...player,
        cards: Array.isArray(player.cards) ? [...player.cards] : [],
      }));
      const hand = players[myPlayerIndex].cards;
      const cardIndex = hand.findIndex(
        (playedCard) =>
          playedCard.palo === card.palo && playedCard.num === card.num,
      );
      if (cardIndex < 0) return;

      hand.splice(cardIndex, 1);
      const table = [
        ...(state.table || []),
        { card, playerIndex: myPlayerIndex },
      ];
      const nextState = {
        ...state,
        players,
        table,
        turnPlayerIndex: nextPlayerIndex(myPlayerIndex),
      };

      if (table.length % 4 !== 0) return nextState;

      const winnerIndex = getTrickWinner(table.slice(-4));
      const trickWinners = [
        ...(state.trickWinners || []),
        winnerIndex === null ? "tie" : teamOf(winnerIndex),
      ];
      const resolvedState = { ...nextState, trickWinners };

      const winner = getHandWinner(trickWinners, state.manoIndex);
      if (winner) {
        return awardPoints(
          resolvedState,
          winner,
          state.currentBid || 1,
          state.bidLevel === "jocfora",
        );
      }

      return {
        ...resolvedState,
        turnPlayerIndex: winnerIndex ?? state.manoIndex,
      };
    }).catch((error) => {
      console.error("No s'ha pogut jugar sa carta:", error);
    });
  }
}

// ---------------- GAME ----------------
class Game {
  constructor() {
    this.deck = new Deck();
    this.players = [];
    this.dealerIndex = 3;
    this.manoIndex = 1; // right of dealer
    this.turnPlayerIndex = 1;
    this.table = [];
    this.trickWinners = [];
    this.currentBid = 1;
    this.bidLevel = "none";
    this.scoreA = 0;
    this.scoreB = 0;
  }

  start(playersFromDB) {
    console.log("S'inicia sa partida.");

    this.deck.fill([2, 8, 9]);

    this.players = [];
    for (let i = 0; i < 4; i++) {
      const p = playersFromDB[i];
      const player = new Player(p.name, i);
      player.getHand(this.deck);
      this.players.push(player);
    }

    this.manoIndex = nextPlayerIndex(this.dealerIndex);
    this.turnPlayerIndex = this.manoIndex;

    const initialState = {
      deck: this.deck.cards,

      players: this.players.map((p) => ({
        name: p.name,
        index: p.index,
        cards: p.cards,
      })),

      dealerIndex: this.dealerIndex,
      manoIndex: this.manoIndex,
      turnPlayerIndex: this.turnPlayerIndex,
      table: [],
      trickWinners: [],
      currentBid: 1,
      bidLevel: "none",
      pendingBid: null,
      scoreA: this.scoreA,
      scoreB: this.scoreB,
      matchWinner: null,
    };

    return runTransaction(gameRef, (currentState) => {
      if (
        currentState?.status === "playing" ||
        currentState?.status === "finished"
      ) {
        return;
      }
      return { ...initialState, status: "playing" };
    });
  }

}

const game = new Game();
const bidDialog = document.getElementById("bidDialog");
const bidDialogTitle = document.getElementById("bidDialogTitle");
const bidDialogMessage = document.getElementById("bidDialogMessage");
const bidDialogActions = document.getElementById("bidDialogActions");
const closeBidDialogButton = document.getElementById("closeBidDialog");
const openBidDialogButton = document.getElementById("openBidDialog");

// ---------------- CARD RANK (Balearic Truc) ----------------
// You can adjust this mapping to exact local hierarchy.
function cardRank(card) {
  const rankOrder = {
    amo: 15, // basto 11
    madona: 14, // oro 10
    llengoEsp: 13, // esp 1
    llengoBasto: 12, // basto 1
    menillaEsp: 11, // esp 7
    menillaOro: 10, // oro 7
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

function getTrickWinner(trickCards) {
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

function getHandWinner(trickWinners, manoIndex) {
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

// ---------------- TURN ORDER ----------------
function nextPlayerIndex(i) {
  return (i + 1) % 4;
}
// ---------------- BIDDING (TRUC, RETRUC, VOL NOU, JOC FORA) ----------------
function bidValue(level) {
  switch (level) {
    case "truc":
      return 3;
    case "retruc":
      return 6;
    case "volnou":
    case "valnou":
      return 9;
    case "jocfora":
      return 18;
    default:
      return 1;
  }
}

const bidLevels = ["none", "truc", "retruc", "valnou", "jocfora"];

function canRaise(level) {
  return bidLevels.indexOf(level) < bidLevels.length - 1;
}

function raiseLevel(level) {
  const idx = bidLevels.indexOf(level);
  return bidLevels[idx + 1] || null;
}

function bidLabel(level) {
  return {
    truc: "Truc",
    retruc: "Retruc",
    valnou: "Valnou",
    jocfora: "Joc fora",
  }[level] || level;
}

function placeBid(level) {
  runTransaction(gameRef, (state) => {
    if (!state || state.status !== "playing") return;

    const pendingBid = state.pendingBid;
    if (pendingBid) {
      if (pendingBid.responderTeam !== teamOf(myPlayerIndex)) return;
    } else if (state.turnPlayerIndex !== myPlayerIndex) {
      return;
    }

    if (raiseLevel(pendingBid?.level || state.bidLevel) !== level) return;

    return {
      ...state,
      pendingBid: {
        level,
        team: teamOf(myPlayerIndex),
        actorIndex: myPlayerIndex,
        responderTeam: otherTeam(teamOf(myPlayerIndex)),
      },
    };
  }).then(({ committed }) => {
    if (committed) bidDialog.close();
  }).catch((error) => {
    console.error("No s'ha pogut fer s'aposta:", error);
  });
}

function dealNextHandState(state) {
  const deck = new Deck();
  deck.fill([2, 8, 9]);
  const players = Array.from({ length: 4 }, (_, index) => {
    const player = new Player(roomPlayers[index].name, index);
    player.getHand(deck);
    return { name: player.name, index, cards: player.cards };
  });
  const dealerIndex = nextPlayerIndex(state.dealerIndex);

  return {
    ...state,
    deck: deck.cards,
    players,
    dealerIndex,
    manoIndex: nextPlayerIndex(dealerIndex),
    turnPlayerIndex: nextPlayerIndex(dealerIndex),
    table: [],
    trickWinners: [],
    currentBid: 1,
    bidLevel: "none",
    pendingBid: null,
    status: "playing",
    matchWinner: null,
  };
}

function awardPoints(state, team, points, forceMatchWinner = false) {
  const scoreKey = team === "A" ? "scoreA" : "scoreB";
  const score = (state[scoreKey] || 0) + points;
  const updatedState = { ...state, [scoreKey]: score, pendingBid: null };

  if (forceMatchWinner || score >= 18) {
    return {
      ...updatedState,
      [scoreKey]: 18,
      status: "finished",
      matchWinner: team,
    };
  }

  return dealNextHandState(updatedState);
}

function respondToBid(action) {
  runTransaction(gameRef, (state) => {
    const pendingBid = state?.pendingBid;
    if (
      !state ||
      state.status !== "playing" ||
      !pendingBid ||
      pendingBid.responderTeam !== teamOf(myPlayerIndex)
    ) {
      return;
    }

    if (action === "raise") {
      const level = raiseLevel(pendingBid.level);
      if (!level) return;
      return {
        ...state,
        pendingBid: {
          level,
          team: teamOf(myPlayerIndex),
          actorIndex: myPlayerIndex,
          responderTeam: otherTeam(teamOf(myPlayerIndex)),
        },
      };
    }

    if (action === "accept") {
      return {
        ...state,
        currentBid: bidValue(pendingBid.level),
        bidLevel: pendingBid.level,
        turnPlayerIndex: nextPlayerIndex(pendingBid.actorIndex),
        pendingBid: null,
      };
    }

    if (action === "decline") {
      if (pendingBid.level === "jocfora") {
        return awardPoints(state, pendingBid.team, 18, true);
      }

      const previousLevel =
        bidLevels[bidLevels.indexOf(pendingBid.level) - 1] || "none";
      return awardPoints(
        state,
        pendingBid.team,
        bidValue(previousLevel),
      );
    }
  }).catch((error) => {
    console.error("No s'ha pogut respondre a s'aposta:", error);
  });
}

// ---------------- ROOM LISTENER ----------------
onValue(gameRef, (snapshot) => {
  const state = snapshot.val();

  if (!state) {
    openBidDialogButton.hidden = true;
    if (bidDialog.open) bidDialog.close();
    document.getElementById("scoreA").textContent = "0";
    document.getElementById("scoreB").textContent = "0";
    for (const id of [
      "nameTop",
      "nameLeft",
      "nameRight",
      "nameBottom",
      "labelTop",
      "labelLeft",
      "labelRight",
      "labelBottom",
    ]) {
      document.getElementById(id).textContent = "";
    }
    for (const id of ["pTop", "pLeft", "pRight", "main"]) {
      document.getElementById(id).classList.remove("activePlayer", "hostPlayer");
    }
    document.getElementById("mainCards").replaceChildren();
    document.getElementById("tableCards").replaceChildren();
    document.getElementById("pTopCards").replaceChildren();
    document.getElementById("pLeftCards").replaceChildren();
    document.getElementById("pRightCards").replaceChildren();
    return;
  }

  if (
    !Number.isInteger(myPlayerIndex) ||
    myPlayerIndex < 0 ||
    myPlayerIndex >= 4 ||
    !state.players
  ) {
    return;
  }

  const playerStates = Array.from(
    { length: 4 },
    (_, index) => state.players[index],
  );
  if (playerStates.some((player) => !player)) return;
  document.getElementById("messages").textContent = "";

  game.deck.cards = state.deck;

  game.players = playerStates.map((playerState, i) => {
    const player = new Player(playerState.name, i);
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

  document.getElementById("scoreA").textContent = game.scoreA;
  document.getElementById("scoreB").textContent = game.scoreB;

  game.players[myPlayerIndex].displayCards();
  renderOtherPlayers();
  renderTable();

  highlightActivePlayer();
  updateLabels();
  updateNames();
  updateBidControls(state);

  if (state.status === "finished" && state.matchWinner) {
    document.getElementById("messages").textContent =
      `S'equip ${state.matchWinner} ha guanyat es joc!`;
  }
});

function addBidDialogAction(label, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", action, { once: true });
  bidDialogActions.appendChild(button);
}

function updateBidControls(state) {
  const pendingBid = state.pendingBid || null;
  const canStartBid =
    state.status === "playing" &&
    !pendingBid &&
    state.turnPlayerIndex === myPlayerIndex &&
    canRaise(state.bidLevel || "none");
  const isResponder =
    pendingBid?.responderTeam === teamOf(myPlayerIndex);

  openBidDialogButton.hidden = !canStartBid;
  closeBidDialogButton.hidden = Boolean(isResponder);

  if (state.status !== "playing") {
    if (bidDialog.open) bidDialog.close();
    return;
  }

  if (isResponder) {
    bidDialogTitle.textContent = `${bidLabel(pendingBid.level)}!`;
    bidDialogMessage.textContent =
      `S'equip ${pendingBid.team} ha dit ${bidLabel(pendingBid.level)} i posa s'aposta a ${bidValue(pendingBid.level)} punts. ` +
      "Podeu acceptar, rebutjar o pujar al nivell següent.";
    bidDialogActions.replaceChildren();
    addBidDialogAction("Acceptar", () => respondToBid("accept"));

    const previousLevel =
      bidLevels[bidLevels.indexOf(pendingBid.level) - 1] || "none";
    const declinedPoints = bidValue(previousLevel);
    addBidDialogAction(
      pendingBid.level === "jocfora"
        ? "Rebutjar (perdre es joc)"
        : `Rebutjar (${declinedPoints} ${declinedPoints === 1 ? "punt" : "punts"})`,
      () => respondToBid("decline"),
    );

    const nextLevel = raiseLevel(pendingBid.level);
    if (nextLevel) {
      addBidDialogAction(`Pujar a ${bidLabel(nextLevel)}`, () =>
        respondToBid("raise"),
      );
    }

    if (!bidDialog.open) bidDialog.showModal();
    return;
  }

  if (pendingBid) {
    if (bidDialog.open) bidDialog.close();
    return;
  }

  if (bidDialog.open) {
    const nextLevel = raiseLevel(state.bidLevel || "none");
    bidDialogTitle.textContent = "Fer una aposta";
    bidDialogMessage.textContent =
      `S'aposta següent és ${bidLabel(nextLevel)} (${bidValue(nextLevel)} ${bidValue(nextLevel) === 1 ? "punt" : "punts"}).`;
    bidDialogActions.replaceChildren();
    addBidDialogAction(`Dir ${bidLabel(nextLevel)}`, () =>
      placeBid(nextLevel),
    );
  }
}

openBidDialogButton.addEventListener("click", () => {
  if (!bidDialog.open) bidDialog.showModal();
  updateBidControls({
    status: game.status || "playing",
    pendingBid: game.pendingBid,
    turnPlayerIndex: game.turnPlayerIndex,
    bidLevel: game.bidLevel,
  });
});

closeBidDialogButton.addEventListener("click", () => bidDialog.close());
bidDialog.addEventListener("cancel", (event) => {
  if (game.pendingBid?.responderTeam === teamOf(myPlayerIndex)) {
    event.preventDefault();
  }
});

// ---------------- RENDER FUNCTIONS ----------------
function renderTable() {
  const tableCards = document.getElementById("tableCards");
  tableCards.innerHTML = "";

  for (let entry of game.table) {
    const card = entry.card;
    const img = document.createElement("img");
    img.classList.add("card");
    img.src = `cards/${card.palo}/${card.num}${card.palo}.png`;
    tableCards.appendChild(img);
  }
}

function renderOtherPlayers() {
  const pTopCards = document.getElementById("pTopCards");
  const pLeftCards = document.getElementById("pLeftCards");
  const pRightCards = document.getElementById("pRightCards");

  // Only clear card containers, NOT labels
  pTopCards.innerHTML = "";
  pLeftCards.innerHTML = "";
  pRightCards.innerHTML = "";

  // Relative seating
  const seat = {
    0: "bottom",
    1: "right",
    2: "top",
    3: "left",
  };

  const rotatedSeat = {};
  for (let i = 0; i < 4; i++) {
    const relative = (i - myPlayerIndex + 4) % 4;
    rotatedSeat[i] = seat[relative];
  }

  for (let i = 0; i < 4; i++) {
    if (i === myPlayerIndex) continue;

    const pos = rotatedSeat[i];
    let container;

    if (pos === "right") container = pRightCards;
    else if (pos === "top") container = pTopCards;
    else if (pos === "left") container = pLeftCards;
    else continue;

    const player = game.players[i];

    for (let card of player.cards) {
      const back = document.createElement("img");
      back.classList.add("card");
      back.src = "cards/rev.png";
      container.appendChild(back);
    }
  }
}

function updateLabels() {
  const labels = {
    bottom: document.getElementById("labelBottom"),
    right: document.getElementById("labelRight"),
    top: document.getElementById("labelTop"),
    left: document.getElementById("labelLeft"),
  };

  for (let key in labels) labels[key].textContent = "";

  const seat = {
    0: "bottom",
    1: "right",
    2: "top",
    3: "left",
  };

  for (let i = 0; i < 4; i++) {
    const relative = (i - myPlayerIndex + 4) % 4;
    const pos = seat[relative];

    if (i === game.manoIndex) labels[pos].textContent = "MÀ";
    if (i === nextPlayerIndex(game.manoIndex)) labels[pos].textContent = "PEU";
    if (i === game.dealerIndex)
      labels[pos].textContent =
        (labels[pos].textContent ? labels[pos].textContent + " · " : "") +
        "REPARTIDOR";
  }
}

function updateNames() {
  const names = {
    bottom: document.getElementById("nameBottom"),
    right: document.getElementById("nameRight"),
    top: document.getElementById("nameTop"),
    left: document.getElementById("nameLeft"),
  };

  // Safety: if any name element is missing, stop
  for (let key in names) {
    if (!names[key]) return;
    names[key].textContent = "";
  }

  const seat = { 0: "bottom", 1: "right", 2: "top", 3: "left" };

  for (let i = 0; i < 4; i++) {
    const relative = (i - myPlayerIndex + 4) % 4;
    const pos = seat[relative];

    if (!names[pos]) continue;

    names[pos].textContent = game.players[i].name;
  }
}

function highlightActivePlayer() {
  const pTop = document.getElementById("pTop");
  const pLeft = document.getElementById("pLeft");
  const pRight = document.getElementById("pRight");
  const main = document.getElementById("main");

  pTop.classList.remove("activePlayer");
  pTop.classList.remove("hostPlayer");
  pLeft.classList.remove("activePlayer");
  pLeft.classList.remove("hostPlayer");
  pRight.classList.remove("activePlayer");
  pRight.classList.remove("hostPlayer");
  main.classList.remove("activePlayer");
  main.classList.remove("hostPlayer");

  const seat = {
    0: "bottom",
    1: "right",
    2: "top",
    3: "left",
  };

  const relative = (game.turnPlayerIndex - myPlayerIndex + 4) % 4;
  const pos = seat[relative];

  if (pos === "bottom") main.classList.add("activePlayer");
  if (pos === "right") pRight.classList.add("activePlayer");
  if (pos === "top") pTop.classList.add("activePlayer");
  if (pos === "left") pLeft.classList.add("activePlayer");

  if (game.turnPlayerIndex === 0) {
    const activeElement = {
      bottom: main,
      right: pRight,
      top: pTop,
      left: pLeft,
    }[pos];
    activeElement.classList.add("hostPlayer");
  }
}

document.getElementById("reset").onclick = () => {
  if (myPlayerIndex === 0) {
    set(roomRef, null).catch((error) => {
      console.error("No s'ha pogut reiniciar sa sala:", error);
    });
  }
};

console.log(
  "Aplicació iniciada. Identificador de jugador:",
  playerId,
  "Lloc de jugador:",
  myPlayerIndex,
);
