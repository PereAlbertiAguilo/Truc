const palo = ["oro", "copa", "esp", "basto"];

function addCard(palo, num) {
  const card = document.createElement("img");
  card.classList.add("card");
  card.src = "cards/" + palo + "/" + num + "" + palo + ".png";
  document.body.appendChild(card);
}

for (let i = 0; i < 4; i++) {
  for (let j = 1; j <= 12; j++) {
    addCard(palo[i], j);
  }
}
