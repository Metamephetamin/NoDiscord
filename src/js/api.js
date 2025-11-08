// const API_URL = "https://localhost:7031/api"; // твой бэкенд

// // Заголовок с токеном, если он есть
// function getAuthHeaders() {
//   const token = localStorage.getItem("token");
//   return token ? { Authorization: `Bearer ${token}` } : {};
// }

// // Регистрация
// export async function registerUser(data) {
//   const res = await fetch(`${API_URL}/auth/register`, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify(data)
//   });
//   return res.json();
// }

// // Логин
// export async function loginUser(data) {
//   const res = await fetch(`${API_URL}/auth/login`, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify(data)
//   });
//   return res.json();
// }

// // Автовход по токену
// export async function getCurrentUser() {
//   const res = await fetch(`${API_URL}/auth/me`, {
//     headers: getAuthHeaders()
//   });
//   return res.json();
// }
