// writeoffs.js

document.addEventListener("DOMContentLoaded", async function () {
    // Инициализация календаря для фильтра по дате
    flatpickr("#writeoffFilterDateRange", {
        mode: "range",
        dateFormat: "Y-m-d",
        maxDate: "today"
    });

    // Показать сообщение об ошибке через модальное окно
    function showError(message) {
        window.common.showModal("Ошибка", message, "error");
    }

    // Загрузка списка точек продаж для вкладки "Списания"
    async function loadWriteoffPoints() {
        try {
            const kktList = await window.common.loadKktList();
            const filterPointSelect = document.getElementById("writeoffFilterPoint");
            filterPointSelect.innerHTML = '<option value="">Все точки</option>';
            kktList.forEach(point => {
                const option = document.createElement("option");
                option.value = point.pointName;
                option.textContent = point.pointName;
                filterPointSelect.appendChild(option);
            });

            // Также заполняем точки в модальном окне
            const modalPointSelects = document.querySelectorAll(".modal-point-select");
            modalPointSelects.forEach(select => {
                select.innerHTML = '<option value="">Выберите точку</option>';
                kktList.forEach(point => {
                    const option = document.createElement("option");
                    option.value = point.pointName;
                    option.textContent = point.pointName;
                    select.appendChild(option);
                });
            });

            console.log("Точки продаж для списаний загружены:", kktList);
        } catch (error) {
            console.error("Ошибка при загрузке точек продаж для списаний:", error);
            showError(`Ошибка загрузки точек продаж: ${error.response?.data?.error || error.message}`);
        }
    }

    // Функция для получения и фильтрации списаний
    async function fetchAndFilterWriteoffs(applyFilters = false) {
        try {
            const response = await window.common.axiosWithRetry(() => window.common.axiosInstance.get("http://localhost:5000/api/writeoffs"));
            let writeoffs = response.data.writeoffs || [];

            if (writeoffs.length === 0) {
                return [];
            }

            // Применяем фильтры, если требуется
            if (applyFilters) {
                const dateRange = document.getElementById("writeoffFilterDateRange").value;
                const pointFilter = document.getElementById("writeoffFilterPoint").value;

                // Фильтрация по дате
                if (dateRange) {
                    const [dateFrom, dateTo] = dateRange.split(" to ");
                    if (dateFrom && dateTo) {
                        writeoffs = writeoffs.filter(writeoff => {
                            const writeoffDate = new Date(writeoff.date);
                            const from = new Date(dateFrom);
                            const to = new Date(dateTo);
                            return writeoffDate >= from && writeoffDate <= to;
                        });
                    } else if (dateFrom) {
                        writeoffs = writeoffs.filter(writeoff => {
                            const writeoffDate = new Date(writeoff.date);
                            const from = new Date(dateFrom);
                            return writeoffDate >= from;
                        });
                    }
                }

                // Фильтрация по точке продаж
                if (pointFilter) {
                    writeoffs = writeoffs.filter(writeoff => writeoff.point === pointFilter);
                }
            }

            return writeoffs;
        } catch (error) {
            console.error("Ошибка при загрузке списаний:", error);
            showError(`Ошибка загрузки списаний: ${error.response?.data?.error || error.message}`);
            return [];
        }
    }

    // Загрузка и отображение списаний с бэкенда
    async function loadWriteoffs(applyFilters = false) {
        const writeoffs = await fetchAndFilterWriteoffs(applyFilters);
        const tableBody = document.getElementById("writeoffData");
        tableBody.innerHTML = ""; // Очищаем таблицу перед обновлением

        if (writeoffs.length === 0) {
            tableBody.innerHTML = "<tr><td colspan='5'>Нет данных о списаниях</td></tr>";
            return;
        }

        writeoffs.forEach(writeoff => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${writeoff.date}</td>
                <td>${writeoff.point}</td>
                <td>${writeoff.product}</td>
                <td>${writeoff.quantity}</td>
                <td>
                    <button class="delete-writeoff bg-red-500 text-white px-2 py-1 rounded" data-id="${writeoff.id}">Удалить</button>
                </td>
            `;
            tableBody.appendChild(row);
        });

        // Добавляем обработчики для кнопок удаления
        document.querySelectorAll(".delete-writeoff").forEach(button => {
            button.addEventListener("click", async function () {
                const id = parseInt(this.getAttribute("data-id"));
                await deleteWriteoff(id);
            });
        });
    }

    // Открытие модального окна для добавления списаний
    function openAddWriteoffModal() {
        // Удаляем существующее модальное окно, если оно есть
        const existingModal = document.querySelector('.modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.className = 'modal fixed inset-0 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="fixed inset-0 bg-black opacity-50"></div>
            <div class="relative bg-white rounded-lg shadow-lg p-6 w-[1000px]">
                <div class="flex items-center mb-4">
                    <span class="text-2xl mr-2">📋</span>
                    <h2 class="text-xl font-semibold bg-blue-500 text-white px-4 py-2 rounded">Добавить списания</h2>
                </div>
                <div id="writeoffItems" class="mb-4 max-h-96 overflow-y-auto">
                    <div class="writeoff-item flex items-center space-x-2 border p-2 rounded mb-2">
                        <input type="text" id="modalWriteoffDate0" class="border p-1 rounded w-8 modal-date text-sm" placeholder="Дата списания">
                        <select id="modalPointSelect0" class="border p-1 rounded w-44 modal-point-select text-sm"></select>
                        <input type="text" id="modalWriteoffProduct0" class="border p-1 rounded w-68 text-sm" placeholder="Продукт">
                        <input type="number" id="modalWriteoffQuantity0" class="border p-1 rounded w-28 text-sm" placeholder="Количество" min="0">
                        <button class="remove-item text-red-500 hover:text-red-700" style="display: none;">✖</button>
                    </div>
                </div>
                <button id="addMoreItem" class="bg-green-500 text-white px-4 py-2 rounded mb-4">+ Добавить ещё товар</button>
                <div class="flex justify-end space-x-2">
                    <button id="saveWriteoffs" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">Сохранить</button>
                    <button class="close-modal bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600">Закрыть</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Инициализация календаря в модальном окне
        document.querySelectorAll(".modal-date").forEach(dateInput => {
            flatpickr(dateInput, {
                mode: "single",
                dateFormat: "Y-m-d",
                defaultDate: new Date().toISOString().split('T')[0]
            });
        });

        // Заполняем точки продаж в модальном окне
        loadWriteoffPoints();

        // Обработчик закрытия модального окна
        const closeModal = () => modal.remove();
        modal.querySelector('.close-modal').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });

        // Обработчик добавления нового товара
        let itemCount = 1;
        document.getElementById("addMoreItem").addEventListener("click", () => {
            const newItem = document.createElement("div");
            newItem.className = "writeoff-item flex items-center space-x-2 border p-2 rounded mb-2";
            newItem.innerHTML = `
                <input type="text" id="modalWriteoffDate${itemCount}" class="border p-1 rounded w-8 modal-date text-sm" placeholder="Дата списания">
                <select id="modalPointSelect${itemCount}" class="border p-1 rounded w-44 modal-point-select text-sm"></select>
                <input type="text" id="modalWriteoffProduct${itemCount}" class="border p-1 rounded w-68 text-sm" placeholder="Продукт">
                <input type="number" id="modalWriteoffQuantity${itemCount}" class="border p-1 rounded w-28 text-sm" placeholder="Количество" min="0">
                <button class="remove-item text-red-500 hover:text-red-700">✖</button>
            `;
            document.getElementById("writeoffItems").appendChild(newItem);
            itemCount++;

            // Инициализация календаря для нового элемента
            flatpickr(`#modalWriteoffDate${itemCount - 1}`, {
                mode: "single",
                dateFormat: "Y-m-d",
                defaultDate: new Date().toISOString().split('T')[0]
            });

            // Заполняем точки продаж для нового элемента
            loadWriteoffPoints();

            // Обновляем видимость кнопок удаления
            updateItemRemoval();
        });

        // Обновление видимости кнопок удаления
        function updateItemRemoval() {
            const items = document.querySelectorAll(".writeoff-item");
            const removeButtons = document.querySelectorAll(".remove-item");

            removeButtons.forEach(button => {
                button.style.display = items.length > 1 ? "block" : "none";
                // Удаляем старые обработчики, чтобы избежать дублирования
                const newButton = button.cloneNode(true);
                button.parentNode.replaceChild(newButton, button);
            });

            // Добавляем новые обработчики
            document.querySelectorAll(".remove-item").forEach(button => {
                button.addEventListener("click", () => {
                    button.parentElement.remove();
                    itemCount--;
                    updateItemRemoval();
                });
            });
        }

        // Обработчик сохранения списаний
        document.getElementById("saveWriteoffs").addEventListener("click", async () => {
            const items = document.querySelectorAll(".writeoff-item");
            const writeoffs = [];

            for (let i = 0; i < items.length; i++) {
                const date = document.getElementById(`modalWriteoffDate${i}`).value;
                const point = document.getElementById(`modalPointSelect${i}`).value;
                const product = document.getElementById(`modalWriteoffProduct${i}`).value.trim();
                const quantity = parseInt(document.getElementById(`modalWriteoffQuantity${i}`).value);

                // Валидация
                try {
                    datetime.strptime(date, "%Y-%m-%d");
                } catch (error) {
                    window.common.showModal("Ошибка", "Некорректный формат даты. Используйте формат YYYY-MM-DD (например, 2025-05-08)", "error");
                    return;
                }

                if (!date || !point || !product || isNaN(quantity) || quantity <= 0) {
                    window.common.showModal("Ошибка", "Пожалуйста, заполните все поля корректно для каждого товара!", "error");
                    return;
                }

                writeoffs.push({
                    date,
                    point,
                    product,
                    quantity
                });
            }

            try {
                const response = await window.common.axiosWithRetry(() => window.common.axiosInstance.post("http://localhost:5000/api/writeoffs", writeoffs));
                await loadWriteoffs();
                window.common.showModal("Успех", response.data.message, "success");
                closeModal();
            } catch (error) {
                console.error("Ошибка при добавлении списаний:", error);
                window.common.showModal("Ошибка", `Ошибка при добавлении списаний: ${error.response?.data?.error || error.message}`, "error");
            }
        });
    }

    // Удаление списания
    async function deleteWriteoff(id) {
        try {
            await window.common.axiosWithRetry(() => window.common.axiosInstance.delete(`http://localhost:5000/api/writeoffs/${id}`));
            // Обновляем таблицу
            await loadWriteoffs();
            window.common.showModal("Успех", `Списание с id ${id} успешно удалено!`, "success");
        } catch (error) {
            console.error("Ошибка при удалении списания:", error);
            window.common.showModal("Ошибка", `Ошибка при удалении списания: ${error.response?.data?.error || error.message}`, "error");
        }
    }

    // Экспорт списаний в Excel с фильтрацией
    async function exportWriteoffsToExcel() {
        try {
            // Используем отфильтрованные списания
            const writeoffs = await fetchAndFilterWriteoffs(true);
            if (!writeoffs || writeoffs.length === 0) {
                window.common.showModal("Ошибка", "Нет данных для экспорта", "error");
                return;
            }

            // Формируем данные для Excel
            const data = [
                ["Дата списания", "Точка продаж", "Товар", "Количество"], // Заголовки
                ...writeoffs.map(writeoff => [
                    writeoff.date,
                    writeoff.point,
                    writeoff.product,
                    writeoff.quantity
                ])
            ];

            // Создаём рабочий лист
            const ws = XLSX.utils.aoa_to_sheet(data);
            // Создаём рабочую книгу
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Writeoffs");
            // Экспортируем файл
            XLSX.writeFile(wb, "writeoffs.xlsx");
            window.common.showModal("Успех", "Списания успешно экспортированы в Excel!", "success");
        } catch (error) {
            console.error("Ошибка при экспорте списаний в Excel:", error);
            window.common.showModal("Ошибка", "Ошибка экспорта в Excel: " + error.message, "error");
        }
    }

    // Инициализация
    try {
        await window.common.getSid();
        if (window.common.getSidValue()) {
            await loadWriteoffPoints();
            // Загружаем списания с бэкенда
            await loadWriteoffs();
        } else {
            showError("Не удалось инициализировать SID");
        }
    } catch (error) {
        console.error("Ошибка инициализации:", error);
        showError("Ошибка инициализации: " + error.message);
    }

    // Добавляем обработчик события для кнопки открытия модального окна
    const openModalButton = document.getElementById("openAddWriteoffModal");
    if (openModalButton) {
        openModalButton.addEventListener("click", () => {
            console.log("Обработчик кнопки 'Добавить списание' сработал");
            openAddWriteoffModal();
        });
    } else {
        console.error("Кнопка 'openAddWriteoffModal' не найдена");
    }

    // Добавляем обработчик события для кнопки "Применить фильтры"
    const applyFiltersButton = document.getElementById("applyWriteoffFilters");
    if (applyFiltersButton) {
        applyFiltersButton.addEventListener("click", async function () {
            console.log("Обработчик кнопки 'Применить фильтры' сработал");
            await loadWriteoffs(true);
        });
    } else {
        console.error("Кнопка 'applyWriteoffFilters' не найдена");
    }

    // Добавляем обработчик события для кнопки "Экспорт в Excel"
    const exportButton = document.getElementById("exportWriteoffsToExcel");
    if (exportButton) {
        exportButton.addEventListener("click", async function () {
            console.log("Обработчик кнопки 'Экспорт в Excel' сработал");
            await exportWriteoffsToExcel();
        });
    } else {
        console.error("Кнопка 'exportWriteoffsToExcel' не найдена");
    }
});