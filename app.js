const palo = ["oro", "copa", "esp", "basto"];

class Card {
  constructor(palo, num) {
    this.palo = palo;
    this.num = num;
  }
}

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
    this.display();
  }

  shuffle() {
    for (var i = this.cards.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = this.cards[i];
      this.cards[i] = this.cards[j];
      this.cards[j] = temp;
    }
  }

  getRandCard() {
    const i = Math.floor(Math.random() * this.cards.length);
    const card = this.cards[i];
    this.cards.splice(i, 1);
    console.log(card);
    return card;
  }

  display() {
    for (const card of this.cards) {
      console.log("Card: " + card.num + " de " + card.palo);
    }
    console.log("\n");
  }
}

class Player {
  constructor(name) {
    this.playing = false;
    this.name = name;
    this.cards = [];
  }

  getHand(deck) {
    this.cards = [];
    for (let i = 0; i < 3; i++) {
      this.addCard(deck.getRandCard());
    }
  }

  addCard(card) {
    if (this.cards.length >= 3) return;

    const cardElem = document.createElement("img");
    cardElem.classList.add("card");
    cardElem.classList.add("interactable");
    cardElem.src =
      "cards/" + card.palo + "/" + card.num + "" + card.palo + ".png";
    cardElem.onclick = () => this.playCard(cardElem);
    this.cards.push(cardElem);
  }

  displayCards() {
    const main = document.getElementById("main");
    main.innerHTML = "";
    for (let card of this.cards) {
      main.appendChild(card);
    }
  }

  playCard(cardElem) {
    cardElem.classList.add("play");
    cardElem.classList.remove("interactable");
  }
}

class Game {
  constructor() {
    this.deck = new Deck();
    this.players = [];
    this.rounds = 0;
    this.activeIndex = 0;
    this.activePlayer = null;
  }

  start() {
    this.deck = new Deck();
    this.players = [];
    this.rounds = 0;
    this.activeIndex = 0;

    this.deck.fill([2, 8, 9]);

    for (let i = 0; i < 4; i++) {
      const player = new Player("Player " + (i + 1));
      player.getHand(this.deck);
      this.players.push(player);
    }

    this.activePlayer = this.players[this.activeIndex];
    this.activePlayer.displayCards();
  }

  updateTurn() {
    this.activeIndex++;
    if (this.activeIndex >= 4) {
      this.rounds++;
      this.activeIndex = 0;
      console.log("round up");
    }
    if (this.rounds >= 3) {
      this.rounds = 0;
      this.deck.fill([2, 8, 9]);
      this.players.forEach((p) => p.getHand(this.deck));
      console.log("round");
    }
    console.log("turn");
    this.activePlayer = this.players[this.activeIndex];
    this.activePlayer.displayCards();
  }
}

const game = new Game();
game.start();

const btn = document.getElementById("btn");
btn.addEventListener("click", () => {
  game.updateTurn();
});
// deck.display();
