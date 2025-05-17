// writeoffs.js

document.addEventListener("DOMContentLoaded", async function () {
    // Инициализация календаря для даты списания
    flatpickr("#writeoffDate", {
        mode: "single",
        dateFormat: "Y-m-d",
        defaultDate: new Date().toISOString().split('T')[0]
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
            pointSelect.innerHTML = '<option value="">Выберите точку</option>';
            kktList.forEach(point => {
                const option = document.createElement("option");
                option.value = point.pointName;
                option.textContent = point.pointName;
                pointSelect.appendChild(option);
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
                    <td>${writeoff.reason}</td>
                `;
                tableBody.appendChild(row);
            });
        } catch (error) {
            console.error("Ошибка при загрузке списаний:", error);
            showError(`Ошибка загрузки списаний: ${error.response?.data?.error || error.message}`);
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
});