/** @type {HTMLSelectElement} */
const select = document.querySelector("#resource");
const loadPlainEl = document.querySelector("#load-plain");
const loadDecryptedEl = document.querySelector("#load-decrypted");
const resultContainer = document.querySelector("#loaded");

const loadPlain = async () =>
  fetch("./enc/" + select.selectedOptions[0].value)
    .then((r) => r.text())
    .then((r) => (resultContainer.innerText = r));

const loadDecrypted = async () => {
  const buff = await fetch("./enc/" + select.selectedOptions[0].value).then(
    (r) => r.arrayBuffer()
  );
  const encrypted = buff.slice(16);
  const iv = buff.slice(0, 16);
  const rawkey = Uint8Array.from(
    atob("KeHNaDKDSiO/7Ov4BHS5EpInj3W8+9iL2LB7KxkfbFo="),
    (c) => c.charCodeAt(0)
  );
  const key = await crypto.subtle.importKey("raw", rawkey, "AES-CBC", true, [
    "decrypt",
  ]);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv },
    key,
    encrypted
  );
  resultContainer.innerText = new TextDecoder().decode(decrypted);
};

loadPlainEl.addEventListener("click", loadPlain);
loadDecryptedEl.addEventListener("click", loadDecrypted);
