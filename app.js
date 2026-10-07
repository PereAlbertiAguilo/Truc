import { Deck, Player } from "./cards.js";
import {
  bidLevels,
  bidValue,
  getHandWinner,
  getTrickWinner,
  nextPlayerIndex,
  otherTeam,
  raiseLevel,
  teamOf,
} from "./game-rules.js";
import { createGameView } from "./game-view.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  onDisconnect,
  runTransaction,
  set,
} from "https://www.gstatic.com/firebasejs/10.0.0/firebase-database.js";
import {
  getAuth,
  signInAnonymously,
} from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";

const DEBUG_RESET = false;
const roomName = "room1";
let myPlayerIndex = null;
let myName = null;
let mySpectator = false;
let roomFull = false;
let roomPlayers = {};

// ---------------- FIREBASE INIT ----------------
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
const gameRef = ref(db, roomName + "/game");
const playersRef = ref(db, roomName + "/lobbyPlayers");
const connectedRef = ref(db, ".info/connected");
const MAX_ROOM_SIZE = 8;
const MAX_SPECTATORS = MAX_ROOM_SIZE - 4;
const DISCONNECT_GRACE_MS = 20_000;
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
let connected = false;
let gameStateLoaded = false;
let presenceWrite = null;
let connectionGeneration = 0;
let lastGameState = null;
const seatTimers = new Map();
const spectatorTimers = new Map();
let hostElectionTimer = null;

function currentHostId(players) {
  return players?.hostId || players?.[0]?.id || null;
}

function isCurrentHost(players = roomPlayers) {
  return Number.isInteger(myPlayerIndex) && currentHostId(players) === playerId;
}

function updateResetControl(players) {
  document.getElementById("reset").hidden = !isCurrentHost(players);
}

function publishPresence() {
  if (
    !connected ||
    presenceWrite?.generation === connectionGeneration
  ) {
    return;
  }

  const playerPresenceRef = ref(
    db,
    `${roomName}/lobbyPlayers/presence/${playerId}`,
  );
  const generation = connectionGeneration;
  const write = onDisconnect(playerPresenceRef)
    .remove()
    .then(() => {
      if (!connected || generation !== connectionGeneration) return;
      return set(playerPresenceRef, true);
    })
    .then(() => {
      roomFull = false;
    })
    .catch((error) => {
      console.error("No s'ha pogut registrar sa presència:", error);
    })
    .finally(() => {
      if (presenceWrite?.promise === write) presenceWrite = null;
    });
  presenceWrite = { generation, promise: write };
}

onValue(connectedRef, (snapshot) => {
  connectionGeneration++;
  connected = snapshot.val() === true;
  if (connected) {
    publishPresence();
  } else {
    presenceWrite = null;
  }
});

function isLobbyReady(players) {
  return [0, 1, 2, 3].every(
    (index) =>
      players?.[index]?.name &&
      players[index].presenceTracked === true &&
      players.presence?.[players[index].id] &&
      !Array.isArray(players[index].cards),
  );
}

function hasLegacySeats(players) {
  return [0, 1, 2, 3].some(
    (index) =>
      players?.[index]?.name && players[index].presenceTracked !== true,
  );
}

function startGameIfReady(players) {
  if (!isCurrentHost(players) || startingGame || !isLobbyReady(players)) return;

  startingGame = true;
  game.start(players).catch((error) => {
    startingGame = false;
    console.error("No s'ha pogut iniciar sa partida:", error);
  });
}

function updateLobbyMessage(players) {
  const seatedPlayers = [0, 1, 2, 3].filter((index) => players?.[index]?.name)
    .length;
  const spectatorIds = Object.keys(players?.spectators || {});
  const spectatorCount = spectatorIds.length;
  const message = document.getElementById("messages");
  const spectatorStatus = document.getElementById("spectatorStatus");
  spectatorStatus.textContent = `Espectadors ${spectatorCount}/${MAX_SPECTATORS}`;
  spectatorStatus.title = spectatorIds
    .map((id) => players.spectators[id].name)
    .join(", ");

  if (hasLegacySeats(players)) {
    message.textContent =
      "Aquesta sala és d'una versió anterior. " +
      "L'amfitrió l'ha de reiniciar quan sigui segur per activar ses substitucions.";
    return;
  }

  if (mySpectator) {
    const queue = spectatorIds.sort(
      (a, b) =>
        (players.spectators[a].joinedAt || 0) -
        (players.spectators[b].joinedAt || 0),
    );
    const queuePosition = queue.indexOf(playerId) + 1;
    message.textContent =
      `Sou es espectador (${queuePosition}/${spectatorCount}). ` +
      "Entrareu a jugar quan quedi un lloc lliure.";
    return;
  }

  if (roomFull && myPlayerIndex === null) {
    message.textContent = "Sa sala és plena (8/8).";
    return;
  }

  if (isLobbyReady(players)) {
    if (myPlayerIndex === null) {
      message.textContent =
        "Sa sala és plena. Tancau ses pestanyes antigues o reiniciau sa sala des de sa pestanya de qui l'ha creada.";
    } else {
      message.textContent =
        isCurrentHost(players)
          ? "Iniciant sa partida…"
          : "Tots es jugadors ja hi són. Esperant que comenci sa partida…";
    }
  } else if (seatedPlayers === 4) {
    message.textContent =
      "Esperant que tornin a estar connectats tots es jugadors…";
  } else {
    message.textContent = `Esperant es jugadors (${seatedPlayers}/4)…`;
  }
}

function claimMembership() {
  const players = roomPlayers;
  if (
    !gameStateLoaded ||
    myPlayerIndex !== null ||
    mySpectator ||
    claimingSeat ||
    !players.presence?.[playerId]
  ) {
    return;
  }

  claimingSeat = true;
  runTransaction(playersRef, (currentPlayers) => {
    const current = currentPlayers || {};
    if (!current.presence?.[playerId]) return;
    const ownSeat = [0, 1, 2, 3].some(
      (index) => current[index]?.id === playerId,
    );
    const spectators = { ...(current.spectators || {}) };
    if (ownSeat || spectators[playerId]) {
      return;
    }

    const preserveLegacyGame =
      lastGameState?.status === "playing" && hasLegacySeats(current);
    const slot = preserveLegacyGame
      ? undefined
      : [0, 1, 2, 3].find((index) => !current[index]);
    const seatedCount = [0, 1, 2, 3].filter(
      (index) => current[index]?.id,
    ).length;
    if (seatedCount + Object.keys(spectators).length >= MAX_ROOM_SIZE) {
      return;
    }

    if (slot === undefined) {
      spectators[playerId] = {
        id: playerId,
        name: `Espectador ${Object.keys(spectators).length + 1}`,
        joinedAt: Date.now(),
        presenceTracked: true,
      };
    }
    return {
      ...current,
      ...(currentHostId(current)
        ? { hostId: currentHostId(current) }
        : slot === 0
          ? { hostId: playerId }
          : {}),
      ...(slot === undefined
        ? { spectators }
        : {
            [slot]: {
              name: `Jugador ${slot + 1}`,
              id: playerId,
              presenceTracked: true,
            },
          }),
    };
  })
    .then(({ snapshot: claimedSnapshot }) => {
      const claimedPlayers = claimedSnapshot.val() || {};
      const ownSlot = Object.keys(claimedPlayers).find(
        (index) =>
          ["0", "1", "2", "3"].includes(index) &&
          claimedPlayers[index]?.id === playerId,
      );

      if (ownSlot !== undefined) {
        myPlayerIndex = Number(ownSlot);
        myName = claimedPlayers[ownSlot].name;
        mySpectator = false;
        roomFull = false;
      } else if (claimedPlayers.spectators?.[playerId]) {
        myPlayerIndex = null;
        myName = claimedPlayers.spectators[playerId].name;
        mySpectator = true;
        roomFull = false;
      } else {
        roomFull = true;
      }

      roomPlayers = claimedPlayers;
      updateResetControl(claimedPlayers);
      updateLobbyMessage(claimedPlayers);
      if (DEBUG_RESET && isCurrentHost(claimedPlayers)) set(gameRef, null);
      startGameIfReady(claimedPlayers);
      refreshCurrentGameView();
    })
    .catch((error) => {
      console.error("No s'ha pogut reservar un lloc a sa sala:", error);
    })
    .finally(() => {
      claimingSeat = false;
    });
}

onValue(playersRef, (snapshot) => {
  const players = snapshot.val() || {};
  roomPlayers = players;
  if (connected && !players.presence?.[playerId]) {
    publishPresence();
    return;
  }

  const ownSeat = [0, 1, 2, 3].find(
    (index) => players[index]?.id === playerId,
  );
  if (ownSeat !== undefined) {
    myPlayerIndex = ownSeat;
    myName = players[ownSeat].name;
    mySpectator = false;
    roomFull = false;
  } else if (players.spectators?.[playerId]) {
    myPlayerIndex = null;
    myName = players.spectators[playerId].name;
    mySpectator = true;
    roomFull = false;
  } else {
    myPlayerIndex = null;
    myName = null;
    mySpectator = false;
  }

  claimMembership();

  updateLobbyMessage(players);
  updateResetControl(players);
  scheduleHostElection(players);
  scheduleSeatReclamation(players);
  startGameIfReady(players);
  refreshCurrentGameView();
});

function scheduleHostElection(players) {
  const hostId = currentHostId(players);
  if (!hostId || players.presence?.[hostId]) {
    if (hostElectionTimer) clearTimeout(hostElectionTimer.timer);
    hostElectionTimer = null;
    return;
  }

  if (hostElectionTimer?.hostId === hostId) return;
  if (hostElectionTimer) clearTimeout(hostElectionTimer.timer);

  const startedAt = Date.now();
  const attemptElection = () => {
    const remainingGrace = DISCONNECT_GRACE_MS - (Date.now() - startedAt);
    if (remainingGrace > 0) {
      const timer = setTimeout(attemptElection, remainingGrace);
      hostElectionTimer = { hostId, timer };
      return;
    }

    runTransaction(playersRef, (currentPlayers) => {
      const current = currentPlayers || {};
      if (
        currentHostId(current) !== hostId ||
        current.presence?.[hostId]
      ) {
        return;
      }

      const successor = [1, 2, 3, 0]
        .map((index) => current[index])
        .find(
          (seat) =>
            seat?.id &&
            seat.id !== hostId &&
            seat.presenceTracked === true &&
            current.presence?.[seat.id],
        );
      if (!successor) return;

      return { ...current, hostId: successor.id };
    })
      .then(({ snapshot }) => {
        const current = snapshot.val() || {};
        const electedHostId = currentHostId(current);
        if (electedHostId !== hostId || current.presence?.[hostId]) {
          if (hostElectionTimer?.hostId === hostId) {
            clearTimeout(hostElectionTimer.timer);
            hostElectionTimer = null;
          }
          return;
        }

        const timer = setTimeout(attemptElection, 1_000);
        hostElectionTimer = { hostId, timer };
      })
      .catch((error) => {
        console.error("No s'ha pogut elegir un amfitrió nou:", error);
        const timer = setTimeout(attemptElection, 1_000);
        hostElectionTimer = { hostId, timer };
      });
  };

  const timer = setTimeout(attemptElection, DISCONNECT_GRACE_MS);
  hostElectionTimer = { hostId, timer };
}

function scheduleSeatReclamation(players) {
  const presence = players.presence || {};

  for (let index = 0; index < 4; index++) {
    const seat = players[index];
    const currentTimer = seatTimers.get(index);
    if (!seat?.id || seat.presenceTracked !== true || presence[seat.id]) {
      if (currentTimer) clearTimeout(currentTimer.timer);
      seatTimers.delete(index);
      continue;
    }

    if (currentTimer?.playerId === seat.id) continue;
    if (currentTimer) clearTimeout(currentTimer.timer);

    const timer = setTimeout(() => {
      runTransaction(playersRef, (currentPlayers) => {
        const current = currentPlayers || {};
        const currentSeat = current[index];
        if (
          currentSeat?.id !== seat.id ||
          current.presence?.[seat.id]
        ) {
          return;
        }

        const waitingSpectators = Object.entries(
          current.spectators || {},
        )
          .filter(([spectatorId]) => current.presence?.[spectatorId])
          .sort(([, a], [, b]) => (a.joinedAt || 0) - (b.joinedAt || 0));
        const nextSpectator = waitingSpectators[0];
        const nextSpectators = { ...(current.spectators || {}) };
        const nextPlayers = { ...current };

        if (nextSpectator) {
          const [spectatorId, spectator] = nextSpectator;
          nextPlayers[index] = {
            id: spectator.id,
            name: `Jugador ${index + 1}`,
            presenceTracked: true,
          };
          delete nextSpectators[spectatorId];
          nextPlayers.spectators = nextSpectators;
        } else {
          delete nextPlayers[index];
        }

        return nextPlayers;
      })
        .then(({ snapshot: updatedSnapshot }) => {
          const updatedPlayers = updatedSnapshot.val() || {};
          const promotedSeat = updatedPlayers[index];
          if (
            promotedSeat?.id &&
            promotedSeat.id !== seat.id
          ) {
            runTransaction(gameRef, (state) => {
              if (!state?.players?.[index]) return;
              const gamePlayers = [...state.players];
              gamePlayers[index] = {
                ...gamePlayers[index],
                name: promotedSeat.name,
              };
              return { ...state, players: gamePlayers };
            }).catch((error) => {
              console.error("No s'ha pogut actualitzar es jugador nou:", error);
            });
          }
        })
        .catch((error) => {
          console.error("No s'ha pogut recuperar es lloc:", error);
        })
        .finally(() => seatTimers.delete(index));
    }, DISCONNECT_GRACE_MS);
    seatTimers.set(index, { playerId: seat.id, timer });
  }

  for (const [spectatorId, spectator] of Object.entries(
    players.spectators || {},
  )) {
    const currentTimer = spectatorTimers.get(spectatorId);
    if (presence[spectatorId]) {
      if (currentTimer) clearTimeout(currentTimer);
      spectatorTimers.delete(spectatorId);
      continue;
    }
    if (currentTimer) continue;

    const timer = setTimeout(() => {
      runTransaction(playersRef, (currentPlayers) => {
        const current = currentPlayers || {};
        if (
          !current.spectators?.[spectatorId] ||
          current.presence?.[spectatorId]
        ) {
          return;
        }
        const spectators = { ...current.spectators };
        delete spectators[spectatorId];
        return { ...current, spectators };
      }).catch((error) => {
        console.error("No s'ha pogut llevar es espectador desconnectat:", error);
      }).finally(() => spectatorTimers.delete(spectatorId));
    }, DISCONNECT_GRACE_MS);
    spectatorTimers.set(spectatorId, timer);
  }
}

// ---------------- GAME STATE ----------------
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
const gameView = createGameView({
  game,
  getPlayerIndex: () => myPlayerIndex,
  getHostPlayerIndex: () =>
    [0, 1, 2, 3].find(
      (index) => roomPlayers[index]?.id === currentHostId(roomPlayers),
    ),
  getIsSpectator: () => mySpectator,
  getRoomPlayers: () => roomPlayers,
  hasLegacySeats,
  onPlayCard: playCard,
  onPlaceBid: placeBid,
  onRespondToBid: respondToBid,
});

// ---------------- GAME ACTIONS ----------------
function playCard(card) {
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

function placeBid(level) {
  if (!Number.isInteger(myPlayerIndex)) return;

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
    if (committed) gameView.closeBidDialog();
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
  if (!Number.isInteger(myPlayerIndex)) return;

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

// ---------------- GAME LISTENER ----------------
onValue(gameRef, (snapshot) => {
  lastGameState = snapshot.val();
  gameStateLoaded = true;
  gameView.render(lastGameState);
  claimMembership();
});

function refreshCurrentGameView() {
  gameView.render(lastGameState);
}

document.getElementById("reset").onclick = () => {
  if (isCurrentHost()) {
    Promise.all([set(playersRef, null), set(gameRef, null)]).catch((error) => {
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
