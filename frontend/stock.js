// stock.js

document.addEventListener("DOMContentLoaded", async function () {
    async function loadStockData() {
        const tableBody = document.getElementById("stockData");
        tableBody.innerHTML = "<tr><td colspan='2'>Функционал в разработке</td></tr>";
    }

    // Вызываем при загрузке вкладки
    loadStockData();

    // Добавляем обработчик события для кнопки "Обновить"
    const refreshButton = document.querySelector(".refresh-btn[data-tab='stock']");
    if (refreshButton) {
        refreshButton.addEventListener("click", async function () {
            await loadStockData();
        });
    } else {
        console.error("Кнопка 'refresh-btn' для вкладки 'stock' не найдена");
    }
});