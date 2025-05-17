document.addEventListener("DOMContentLoaded", async function () {
    // Показать сообщение через модальное окно
    function showMessage(title, message, type) {
        window.common.showModal(title, message, type);
    }

    // Загрузка списка точек продаж для вкладки "Остатки на складах"
    async function loadStockPoints() {
        try {
            const kktList = await window.common.loadKktList();
            const pointSelect = document.getElementById("stockPointSelect");
            pointSelect.innerHTML = '<option value="">Выберите точку</option>';
            kktList.forEach(point => {
                const option = document.createElement("option");
                option.value = point.pointName;
                option.textContent = point.pointName;
                pointSelect.appendChild(option);
            });
            console.log("Точки продаж для остатков загружены:", kktList);
        } catch (error) {
            console.error("Ошибка при загрузке точек продаж для остатков:", error);
            showMessage("Ошибка", `Ошибка загрузки точек продаж: ${error.response?.data?.error || error.message}`, "error");
        }
    }

    // Загрузка списка товаров
    async function loadProducts() {
        try {
            const response = await window.common.axiosWithRetry(() => window.common.axiosInstance.get("http://localhost:5000/api/products"));
            return response.data.products || [];
        } catch (error) {
            console.error("Ошибка при загрузке списка товаров:", error);
            showMessage("Ошибка", `Ошибка загрузки списка товаров: ${error.response?.data?.error || error.message}`, "error");
            return [];
        }
    }

    // Загрузка и отображение остатков с бэкенда
    async function loadStocks() {
        try {
            const point = document.getElementById("stockPointSelect").value;
            const products = await loadProducts();
            const response = await window.common.axiosWithRetry(() => window.common.axiosInstance.get("http://localhost:5000/api/stocks"));
            const stocks = response.data.stocks || {};
            const tableBody = document.getElementById("stockData");
            tableBody.innerHTML = ""; // Очищаем таблицу перед обновлением

            if (!point) {
                tableBody.innerHTML = "<tr><td colspan='3'>Пожалуйста, выберите точку продаж</td></tr>";
                return;
            }

            if (products.length === 0) {
                tableBody.innerHTML = "<tr><td colspan='3'>Нет данных о товарах</td></tr>";
                return;
            }

            const pointStocks = stocks[point] || {};

            // Отображаем все товары из списка
            products.forEach(product => {
                const quantity = pointStocks[product.name] || 0;
                const row = document.createElement("tr");
                row.innerHTML = `
                    <td class="border p-2">${product.name}</td>
                    <td class="border p-2">${quantity}</td>
                    <td class="border p-2">
                        <button class="edit-stock-btn bg-blue-500 text-white px-2 py-1 rounded" data-point="${point}" data-product="${product.name}" data-quantity="${quantity}">Изменить</button>
                    </td>
                `;
                tableBody.appendChild(row);
            });

            // Добавляем обработчики для кнопок "Изменить"
            document.querySelectorAll(".edit-stock-btn").forEach(button => {
                button.addEventListener("click", () => {
                    const point = button.getAttribute("data-point");
                    const product = button.getAttribute("data-product");
                    const quantity = parseInt(button.getAttribute("data-quantity"));
                    openEditStockModal(point, product, quantity);
                });
            });
        } catch (error) {
            console.error("Ошибка при загрузке остатков:", error);
            showMessage("Ошибка", `Ошибка загрузки остатков: ${error.response?.data?.error || error.message}`, "error");
        }
    }

    // Открытие модального окна для редактирования остатков
    function openEditStockModal(point, product, currentQuantity) {
        // Удаляем существующее модальное окно, если оно есть
        const existingModal = document.querySelector('.modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.className = 'modal fixed inset-0 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="fixed inset-0 bg-black opacity-50"></div>
            <div class="relative bg-white rounded-lg shadow-lg p-6 max-w-sm w-full">
                <div class="flex items-center mb-4">
                    <span class="text-2xl mr-2">📦</span>
                    <h2 class="text-xl font-semibold bg-blue-500 text-white px-4 py-2 rounded">Изменить остатки</h2>
                </div>
                <div class="mb-4">
                    <p class="mb-2"><strong>Точка:</strong> ${point}</p>
                    <p class="mb-2"><strong>Товар:</strong> ${product}</p>
                    <label for="newQuantity" class="block mb-1">Новое количество:</label>
                    <input type="number" id="newQuantity" class="border p-2 rounded w-full" value="${currentQuantity}" min="0">
                </div>
                <div class="flex justify-end space-x-2">
                    <button id="saveStock" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">Сохранить</button>
                    <button class="close-modal bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600">Закрыть</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Обработчик закрытия модального окна
        const closeModal = () => modal.remove();
        modal.querySelector('.close-modal').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });

        // Обработчик сохранения нового количества
        document.getElementById("saveStock").addEventListener("click", async () => {
            const newQuantity = parseInt(document.getElementById("newQuantity").value);
            if (isNaN(newQuantity) || newQuantity < 0) {
                showMessage("Ошибка", "Количество не может быть меньше 0", "error");
                return;
            }
            await updateStock(point, product, newQuantity, "set");
            closeModal();
        });
    }

    // Обновление остатков
    async function updateStock(point, product, quantity, operation) {
        try {
            const response = await window.common.axiosWithRetry(() => window.common.axiosInstance.post("http://localhost:5000/api/stocks", {
                point,
                product,
                quantity,
                operation
            }));
            await loadStocks();
            showMessage("Успех", response.data.message, "success");
        } catch (error) {
            console.error("Ошибка при обновлении остатков:", error);
            showMessage("Ошибка", `Ошибка при обновлении остатков: ${error.response?.data?.error || error.message}`, "error");
        }
    }

    // Инициализация
    try {
        await window.common.getSid();
        if (window.common.getSidValue()) {
            await loadStockPoints();
            await loadStocks();
        } else {
            showMessage("Ошибка", "Не удалось инициализировать SID", "error");
        }
    } catch (error) {
        console.error("Ошибка инициализации:", error);
        showMessage("Ошибка", "Ошибка инициализации: " + error.message, "error");
    }

    // Обработчик выбора точки
    const pointSelect = document.getElementById("stockPointSelect");
    if (pointSelect) {
        pointSelect.addEventListener("change", async () => {
            await loadStocks();
        });
    }

    // Обработчик кнопки "Обновить"
    const refreshButton = document.querySelector(".refresh-btn[data-tab='stock']");
    if (refreshButton) {
        refreshButton.addEventListener("click", async () => {
            await loadStocks();
        });
    }
});