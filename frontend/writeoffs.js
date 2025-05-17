// writeoffs.js

document.addEventListener("DOMContentLoaded", async function () {
    // Инициализация календаря для даты списания
    flatpickr("#writeoffDate", {
        mode: "single",
        dateFormat: "Y-m-d",
        defaultDate: new Date().toISOString().split('T')[0]
    });

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
            const pointSelect = document.getElementById("writeoffPointSelect");
            const filterPointSelect = document.getElementById("writeoffFilterPoint");
            pointSelect.innerHTML = '<option value="">Выберите точку</option>';
            filterPointSelect.innerHTML = '<option value="">Все точки</option>';
            kktList.forEach(point => {
                const option = document.createElement("option");
                option.value = point.pointName;
                option.textContent = point.pointName;
                pointSelect.appendChild(option.cloneNode(true));
                filterPointSelect.appendChild(option);
            });
            console.log("Точки продаж для списаний загружены:", kktList);
        } catch (error) {
            console.error("Ошибка при загрузке точек продаж для списаний:", error);
            showError(`Ошибка загрузки точек продаж: ${error.response?.data?.error || error.message}`);
        }
    }

    // Загрузка и отображение списаний с бэкенда
    async function loadWriteoffs() {
        try {
            const response = await window.common.axiosWithRetry(() => window.common.axiosInstance.get("http://localhost:5000/api/writeoffs"));
            const writeoffs = response.data.writeoffs || [];
            const tableBody = document.getElementById("writeoffData");
            tableBody.innerHTML = ""; // Очищаем таблицу перед обновлением

            if (writeoffs.length === 0) {
                tableBody.innerHTML = "<tr><td colspan='6'>Нет данных о списаниях</td></tr>";
                return [];
            }

            writeoffs.forEach(writeoff => {
                const row = document.createElement("tr");
                row.innerHTML = `
                    <td>${writeoff.date}</td>
                    <td>${writeoff.point}</td>
                    <td>${writeoff.product}</td>
                    <td>${writeoff.quantity}</td>
                    <td>${writeoff.reason}</td>
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

            return writeoffs; // Возвращаем списания для дальнейшего использования
        } catch (error) {
            console.error("Ошибка при загрузке списаний:", error);
            showError(`Ошибка загрузки списаний: ${error.response?.data?.error || error.message}`);
            return [];
        }
    }

    // Добавление нового списания
    async function submitWriteoff() {
        const date = document.getElementById("writeoffDate").value;
        const point = document.getElementById("writeoffPointSelect").value;
        const product = document.getElementById("writeoffProduct").value.trim();
        const quantity = parseInt(document.getElementById("writeoffQuantity").value);
        const reason = document.getElementById("writeoffReason").value.trim();

        // Валидация
        if (!date || !point || !product || isNaN(quantity) || quantity <= 0 || !reason) {
            window.common.showModal("Ошибка", "Пожалуйста, заполните все поля корректно!", "error");
            return;
        }

        // Формируем объект списания
        const writeoff = {
            date,
            point,
            product,
            quantity,
            reason
        };

        try {
            await window.common.axiosWithRetry(() => window.common.axiosInstance.post("http://localhost:5000/api/writeoffs", writeoff));
            // Обновляем таблицу
            await loadWriteoffs();
            // Очищаем форму
            document.getElementById("writeoffProduct").value = "";
            document.getElementById("writeoffQuantity").value = "";
            document.getElementById("writeoffReason").value = "";
            window.common.showModal("Успех", "Списание успешно добавлено!", "success");
        } catch (error) {
            console.error("Ошибка при добавлении списания:", error);
            window.common.showModal("Ошибка", `Ошибка при добавлении списания: ${error.response?.data?.error || error.message}`, "error");
        }
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
            // Загружаем списания
            let writeoffs = await loadWriteoffs();
            if (!writeoffs || writeoffs.length === 0) {
                window.common.showModal("Ошибка", "Нет данных для экспорта", "error");
                return;
            }

            // Применяем фильтры
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

            if (writeoffs.length === 0) {
                window.common.showModal("Ошибка", "Нет данных для экспорта после применения фильтров", "error");
                return;
            }

            // Формируем данные для Excel
            const data = [
                ["Дата списания", "Точка продаж", "Товар", "Количество", "Причина списания"], // Заголовки
                ...writeoffs.map(writeoff => [
                    writeoff.date,
                    writeoff.point,
                    writeoff.product,
                    writeoff.quantity,
                    writeoff.reason
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

    // Добавляем обработчик события для кнопки "Добавить списание"
    const submitButton = document.getElementById("submitWriteoff");
    if (submitButton) {
        submitButton.addEventListener("click", async function () {
            console.log("Обработчик кнопки 'Добавить списание' сработал");
            await submitWriteoff();
        });
    } else {
        console.error("Кнопка 'submitWriteoff' не найдена");
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