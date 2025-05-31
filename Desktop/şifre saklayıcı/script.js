function savePassword() {
  const site = document.getElementById("site").value;
  const password = document.getElementById("password").value;

  if (site && password) {
    localStorage.setItem(site, password);
    alert("Şifre kaydedildi!");
    document.getElementById("site").value = "";
    document.getElementById("password").value = "";
    loadPasswords();
  } else {
    alert("Lütfen tüm alanları doldurun.");
  }
}

function loadPasswords() {
  const list = document.getElementById("passwordList");
  list.innerHTML = "";

  for (let i = 0; i < localStorage.length; i++) {
    const site = localStorage.key(i);
    const password = localStorage.getItem(site);

    const li = document.createElement("li");
    li.textContent = `${site}: ${password}`;
    list.appendChild(li);
  }
}

window.onload = loadPasswords;
