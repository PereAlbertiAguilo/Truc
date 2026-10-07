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
  update,
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
  console.error("Firebase anonymous sign-in failed:", error);
  document.getElementById("messages").textContent =
    "Could not connect to Firebase. Check that Anonymous sign-in is enabled.";
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

const playerId = sessionStorage.getItem("trucPlayerId") || createPlayerId();
sessionStorage.setItem("trucPlayerId", playerId);
let claimingSeat = false;
let startingGame = false;

function isLobbyReady(players) {
  return [0, 1, 2, 3].every(
    (index) => players?.[index]?.name && !Array.isArray(players[index].cards),
  );
}

function startGameIfReady(players) {
  if (startingGame || !isLobbyReady(players)) return;

  startingGame = true;
  game.start(players).catch((error) => {
    startingGame = false;
    console.error("Failed to start game:", error);
  });
}

onValue(playersRef, (snapshot) => {
  const players = snapshot.val() || {};
  roomPlayers = players;

  if (Object.keys(players).length === 0 && myPlayerIndex !== null) {
    myPlayerIndex = null;
    myName = null;
    startingGame = false;
    game.dealerIndex = 3;
    game.scoreA = 0;
    game.scoreB = 0;
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
        [slot]: { name: `Player ${slot + 1}`, id: playerId },
      };
    })
      .then(({ snapshot: claimedSnapshot }) => {
        const claimedPlayers = claimedSnapshot.val() || {};
        const ownSlot = Object.keys(claimedPlayers).find(
          (index) => claimedPlayers[index]?.id === playerId,
        );

        if (ownSlot === undefined) {
          alert("Room is full!");
          return;
        }

        myPlayerIndex = Number(ownSlot);
        myName = claimedPlayers[ownSlot].name;
        roomPlayers = claimedPlayers;
        if (DEBUG_RESET && myPlayerIndex === 0) set(gameRef, null);
        startGameIfReady(claimedPlayers);
      })
      .catch((error) => {
        console.error("Failed to claim a player seat:", error);
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

    this.cards = this.cards.filter(
      (c) => !(c.palo === card.palo && c.num === card.num),
    );

    game.table.push({ card, playerIndex: this.index });

    update(gameRef, {
      players: game.players.map((p) => ({
        name: p.name,
        index: p.index,
        cards: p.cards,
      })),
      table: game.table,
      turnPlayerIndex: nextPlayerIndex(game.turnPlayerIndex),
    });

    if (game.table.length % 4 === 0) {
      resolveTrick();
    }
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
    this.bidLevel = "none"; // none, truc, retruc, volnou, jocfora
    this.bidTeam = null;
    this.accepted = true;
    this.scoreA = 0;
    this.scoreB = 0;
  }

  start(playersFromDB) {
    console.log("HOST: starting game");

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
      bidTeam: null,
      accepted: true,
      scoreA: this.scoreA,
      scoreB: this.scoreB,
    };

    return runTransaction(gameRef, (currentState) => {
      if (currentState?.status === "playing") return;
      return { ...initialState, status: "playing" };
    });
  }

  nextHand(playersFromDB) {
    if (!isLobbyReady(playersFromDB)) {
      return Promise.reject(
        new Error("Cannot deal next hand: lobby is incomplete."),
      );
    }

    this.dealerIndex = nextPlayerIndex(this.dealerIndex);
    this.manoIndex = nextPlayerIndex(this.dealerIndex);
    this.turnPlayerIndex = this.manoIndex;
    this.deck.fill([2, 8, 9]);
    this.players = Array.from({ length: 4 }, (_, index) => {
      const player = new Player(playersFromDB[index].name, index);
      player.getHand(this.deck);
      return player;
    });
    this.table = [];
    this.trickWinners = [];
    this.currentBid = 1;
    this.bidLevel = "none";
    this.bidTeam = null;
    this.accepted = true;

    return set(gameRef, {
      deck: this.deck.cards,
      players: this.players.map((player) => ({
        name: player.name,
        index: player.index,
        cards: player.cards,
      })),
      dealerIndex: this.dealerIndex,
      manoIndex: this.manoIndex,
      turnPlayerIndex: this.turnPlayerIndex,
      table: this.table,
      trickWinners: this.trickWinners,
      currentBid: this.currentBid,
      bidLevel: this.bidLevel,
      bidTeam: this.bidTeam,
      accepted: this.accepted,
      scoreA: this.scoreA,
      scoreB: this.scoreB,
      status: "playing",
    });
  }
}

const game = new Game();

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
      return 9;
    case "jocfora":
      return 999; // whole game
    default:
      return 1;
  }
}

function canRaise(level) {
  const order = ["none", "truc", "retruc", "volnou", "jocfora"];
  return order.indexOf(level) < order.length - 1;
}

function raiseLevel(level) {
  const order = ["none", "truc", "retruc", "volnou", "jocfora"];
  const idx = order.indexOf(level);
  return order[idx + 1] || "jocfora";
}

function callTruc(levelName) {
  if (game.turnPlayerIndex !== myPlayerIndex) return;

  if (!canRaise(game.bidLevel)) return;

  const newLevel = levelName || raiseLevel(game.bidLevel);
  game.bidLevel = newLevel;
  game.currentBid = bidValue(newLevel);
  game.bidTeam = teamOf(myPlayerIndex);
  game.accepted = false;

  showMessage(`Team ${teamOf(myPlayerIndex)} calls ${newLevel.toUpperCase()}!`);

  update(gameRef, {
    bidLevel: game.bidLevel,
    currentBid: game.currentBid,
    bidTeam: game.bidTeam,
    accepted: game.accepted,
  });
}

function respondBid(accept) {
  if (game.bidTeam === null) return;
  if (teamOf(myPlayerIndex) === game.bidTeam) return;

  if (!accept) {
    endHandByBid(false);
    showMessage(`Team ${teamOf(myPlayerIndex)} does NOT accept!`);
    return;
  }

  game.accepted = true;

  showMessage(`Team ${teamOf(myPlayerIndex)} accepts!`);

  update(gameRef, {
    accepted: game.accepted,
  });
}

// ---------------- TRICK RESOLUTION ----------------
function resolveTrick() {
  if (game.table.length % 4 !== 0) return;

  const trickCards = game.table.slice(game.table.length - 4);
  let bestRank = -1;
  let winnerIndex = null;
  let tie = false;

  for (let entry of trickCards) {
    const r = cardRank(entry.card);
    if (r > bestRank) {
      bestRank = r;
      winnerIndex = entry.playerIndex;
      tie = false;
    } else if (r === bestRank) {
      tie = true;
    }
  }

  if (tie) {
    game.trickWinners.push("tie");
    showMessage(`Team ${teamOf(winnerIndex)} wins the trick!`);
  } else {
    game.trickWinners.push(teamOf(winnerIndex));
    showMessage(`Tie! Mano decides next trick.`);
  }

  update(gameRef, {
    trickWinners: game.trickWinners,
  });

  if (game.trickWinners.length === 3) {
    endHandByPlay();
  } else {
    game.turnPlayerIndex = winnerIndex;
    update(gameRef, {
      turnPlayerIndex: game.turnPlayerIndex,
    });
  }
}

// ---------------- END HAND ----------------
function endHandByBid(fromPlay) {
  const winningTeam = game.bidTeam;
  const points = game.currentBid;

  if (winningTeam === "A") game.scoreA += points;
  else game.scoreB += points;

  showMessage(`Team ${winningTeam} wins the bid (${points} points)!`);

  game.nextHand(roomPlayers).catch((error) => {
    console.error("Failed to deal the next hand:", error);
  });
}

function endHandByPlay() {
  const t = game.trickWinners;
  let winningTeam;

  const countA = t.filter((x) => x === "A").length;
  const countB = t.filter((x) => x === "B").length;

  if (countA > countB) winningTeam = "A";
  else if (countB > countA) winningTeam = "B";
  else winningTeam = teamOf(game.manoIndex);

  const points = game.currentBid;

  if (winningTeam === "A") game.scoreA += points;
  else game.scoreB += points;

  showMessage(`Team ${winningTeam} wins the hand (${points} points)!`);

  game.nextHand(roomPlayers).catch((error) => {
    console.error("Failed to deal the next hand:", error);
  });
}

// ---------------- ROOM LISTENER ----------------
onValue(gameRef, (snapshot) => {
  const state = snapshot.val();

  if (!state) return;

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
  game.bidLevel = state.bidLevel || "none";
  game.bidTeam = state.bidTeam || null;
  game.accepted = state.accepted ?? true;
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

    if (i === game.manoIndex) labels[pos].textContent = "MANO";
    if (i === nextPlayerIndex(game.manoIndex)) labels[pos].textContent = "PEU";
    if (i === game.dealerIndex)
      labels[pos].textContent =
        (labels[pos].textContent ? labels[pos].textContent + " · " : "") +
        "DEALER";
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

function showMessage(text) {
  const msg = document.getElementById("messages");
  msg.textContent = text;

  setTimeout(() => {
    msg.textContent = "";
  }, 3000);
}

document.getElementById("reset").onclick = () => {
  if (myPlayerIndex === 0) {
    set(roomRef, null).catch((error) => {
      console.error("Failed to reset the room:", error);
    });
  }
};

console.log(
  "App initialized. Player ID:",
  playerId,
  "Player Index:",
  myPlayerIndex,
);

// expose bidding functions for HTML buttons if you add them
window.callBid = callTruc;
window.respondBid = respondBid;
