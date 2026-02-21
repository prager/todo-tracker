/* update 1 */
const loginForm = document.getElementById("loginForm");
const loginAlert = document.getElementById("loginAlert");

const showError = (message) => {
  loginAlert.textContent = message;
  loginAlert.classList.remove("d-none");
};

const hideError = () => {
  loginAlert.textContent = "";
  loginAlert.classList.add("d-none");
};

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideError();

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      throw new Error("Invalid username or password");
    }

    window.location.href = "/";
  } catch (error) {
    showError(error.message || "Login failed");
  }
});
