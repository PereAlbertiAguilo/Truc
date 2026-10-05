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
  constructor() {
    this.playing = false;
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

    this.cards.push(card);
    const cardElem = document.createElement("img");
    cardElem.classList.add("card");
    cardElem.src =
      "cards/" + card.palo + "/" + card.num + "" + card.palo + ".png";
    document.body.appendChild(cardElem);
  }
}

const deck = new Deck();
deck.fill([2, 8, 9]);

document.body.appendChild(document.createElement("div"));

const player1 = new Player();
player1.getHand(deck);

document.body.appendChild(document.createElement("div"));

const player2 = new Player();
player2.getHand(deck);

document.body.appendChild(document.createElement("div"));
document.body.appendChild(document.createElement("div"));

const player3 = new Player();
player3.getHand(deck);

document.body.appendChild(document.createElement("div"));

const player4 = new Player();
player4.getHand(deck);

document.body.appendChild(document.createElement("div"));
// deck.display();
