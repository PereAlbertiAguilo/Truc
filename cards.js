const suits = ["oro", "copa", "esp", "basto"];

export class Card {
  constructor(palo, num) {
    this.palo = palo;
    this.num = num;
  }
}

export class Deck {
  constructor() {
    this.cards = [];
  }

  fill(excludes) {
    this.cards = [];
    for (const palo of suits) {
      for (let num = 1; num <= 12; num++) {
        if (excludes.includes(num)) continue;
        this.cards.push(new Card(palo, num));
      }
    }
    this.shuffle();
  }

  shuffle() {
    for (let index = this.cards.length - 1; index > 0; index--) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [this.cards[index], this.cards[randomIndex]] = [
        this.cards[randomIndex],
        this.cards[index],
      ];
    }
  }

  getRandCard() {
    const index = Math.floor(Math.random() * this.cards.length);
    const [card] = this.cards.splice(index, 1);
    return card;
  }
}

export class Player {
  constructor(name, index) {
    this.name = name;
    this.index = index;
    this.cards = [];
  }

  getHand(deck) {
    this.cards = [];
    for (let index = 0; index < 3; index++) {
      this.cards.push(deck.getRandCard());
    }
  }
}
