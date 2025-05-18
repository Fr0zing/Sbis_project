document.addEventListener("DOMContentLoaded", async function () {
    let isLoading = false;
    let currentData = null; // Сохраняем текущие данные для экспорта

    // Получаем текущую дату в формате YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0]; // Например, "2025-05-18"

    // Восстановление фильтров из localStorage
    const savedDateRange = localStorage.getItem("dateRange") || `${today} to ${today}`;
    const savedPointName = localStorage.getItem("pointName") || "";

    // Проверяем, что savedDateRange корректно
    let defaultDateRange;
    try {
        defaultDateRange = savedDateRange.split(" to ");
        if (defaultDateRange.length !== 2 || !defaultDateRange[0] || !defaultDateRange[1]) {
            throw new Error("Некорректный формат savedDateRange");
        }
    } catch (error) {
        console.log("Некорректный формат savedDateRange, используем текущий день");
        defaultDateRange = [today, today];
    }

    // Инициализация календаря для вкладки "Статистика продаж"
    flatpickr("#dateRange", {
        mode: "range",
        dateFormat: "Y-m-d",
        maxDate: "today",
        defaultDate: defaultDateRange
    });

    // Функция для форматирования суммы из копеек в рубли
    function formatAmount(amountInKopecks) {
        const amountInRubles = amountInKopecks / 100;
        return `${amountInRubles.toFixed(2)} ₽`;
    }

    // Функция для пересчёта итоговой суммы на основе сумм отдельных товаров
    function calculateTotalSum(point) {
        const totalSum = point.items.reduce((sum, item) => sum + item.total_sum, 0);
        console.log(`Пересчитанная итоговая сумма для точки ${point.point_name} (в копейках):`, totalSum);
        return totalSum;
    }

    // Загружаем сохранённые данные для статистики продаж
    const cachedSalesData = localStorage.getItem("salesData");
    const cachedSalesPeriod = localStorage.getItem("salesPeriod");
    if (cachedSalesData && cachedSalesPeriod) {
        currentData = JSON.parse(cachedSalesData);
        console.log("Сохранённые данные статистики продаж загружены из кэша:", currentData);
        // Отображаем данные в таблице
        const tableBody = document.getElementById("salesData");
        tableBody.innerHTML = ""; // Очищаем таблицу перед обновлением
        if (currentData && currentData.length > 0) {
            currentData.forEach(point => {
                point.items.forEach(item => {
                    const row = document.createElement("tr");
                    row.innerHTML = `
                        <td>${point.point_name}</td>
                        <td>${item.name}</td>
                        <td class="number-cell">${item.quantity} шт.</td>
                        <td class="number-cell">${formatAmount(item.total_sum)}</td>
                    `;
                    tableBody.appendChild(row);
                });
                // Пересчитываем итоговую сумму
                const totalSum = calculateTotalSum(point);
                const totalRow = document.createElement("tr");
                totalRow.innerHTML = `
                    <td colspan='3'><strong>Итого для ${point.point_name}</strong></td>
                    <td class="number-cell"><strong>${formatAmount(totalSum)}</strong></td>
                `;
                tableBody.appendChild(totalRow);
            });
            console.log("Таблица статистики продаж обновлена из кэша");
            // Отображаем период данных
            const periodDisplay = document.getElementById("salesDataPeriod");
            periodDisplay.textContent = `Данные за период: ${cachedSalesPeriod}`;
        }
    }

    // Показать сообщение об ошибке
    function showError(message) {
        window.common.showModal("Ошибка", message, "error");
    }

    // Управление индикатором загрузки
    function setLoading(state) {
        isLoading = state;
        const showButton = document.getElementById("showSalesData");
        const exportButton = document.getElementById("exportXlsx");
        const spinner = document.getElementById("loadingSpinner");
        showButton.disabled = state;
        exportButton.disabled = state;
        showButton.textContent = state ? "Загрузка..." : "Показать";
        spinner.style.display = state ? "block" : "none";
        const tableBody = document.getElementById("salesData");
        if (state) {
            tableBody.innerHTML = `<tr><td colspan='4'>Данные загружаются...</td></tr>`;
        }
    }

    // Загрузка списка точек продаж
    async function loadPoints() {
        try {
            const kktList = await window.common.loadKktList();
            const pointSelect = document.getElementById("pointSelect");
            pointSelect.innerHTML = '<option value="">Все точки</option>';
            kktList.forEach(point => {
                const option = document.createElement("option");
                option.value = point.pointName;
                option.textContent = point.pointName;
                pointSelect.appendChild(option);
            });
            // Восстанавливаем выбранную точку
            pointSelect.value = savedPointName;
            console.log("Точки продаж загружены:", kktList);
        } catch (error) {
            console.error("Ошибка при загрузке точек продаж:", error);
            let errorMessage = "Ошибка загрузки точек продаж: " + error.message;
            if (error.code === "ERR_NETWORK") {
                errorMessage += " (Проверьте, запущен ли сервер на http://localhost:5000)";
            }
            showError(errorMessage);
        }
    }

    // Экспорт данных в XLSX
    function exportToXlsx() {
        if (!currentData || currentData.length === 0) {
            window.common.showModal("Ошибка", "Нет данных для экспорта", "error");
            return;
        }

        // Формируем данные для XLSX
        const data = [];
        // Добавляем заголовки
        data.push(["Точка продаж", "Продукт", "Количество (шт.)", "Сумма (руб.)"]);

        currentData.forEach(point => {
            point.items.forEach(item => {
                data.push([
                    point.point_name,
                    item.name,
                    item.quantity,
                    (item.total_sum / 100).toFixed(2) // Переводим сумму в рубли
                ]);
            });
            // Пересчитываем итоговую сумму
            const totalSum = calculateTotalSum(point);
            data.push([
                `Итого для ${point.point_name}`,
                "",
                "",
                (totalSum / 100).toFixed(2) // Переводим итоговую сумму в рубли
            ]);
        });

        // Создаем рабочий лист
        const ws = XLSX.utils.aoa_to_sheet(data);
        // Создаем рабочую книгу
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Sales Data");
        // Экспортируем файл
        XLSX.writeFile(wb, "sales_data.xlsx");
    }

    // Загрузка данных о продажах
    async function loadSalesData() {
        console.log("Кнопка 'Показать' нажата");
        if (isLoading) {
            console.log("Запрос уже выполняется, пропускаем");
            return;
        }
        const sid = window.common.getSidValue();
        if (!sid) {
            console.log("SID не получен");
            showError("SID не получен. Пожалуйста, обновите страницу.");
            return;
        }

        // Ждём, пока список KKT не будет загружен
        const kktList = window.common.getKktList();
        if (!kktList) {
            console.log("Список KKT ещё не загружен, ждём...");
            await loadPoints();
        }

        if (!kktList || kktList.length === 0) {
            console.log("Список KKT пуст");
            showError("Не удалось загрузить список KKT. Пожалуйста, обновите страницу.");
            return;
        }

        setLoading(true);
        let dateRange = document.getElementById("dateRange").value.split(" to ");
        let dateFrom = dateRange[0];
        let dateTo = dateRange[1] || dateFrom;

        console.log(`Исходный период: dateFrom=${dateFrom}, dateTo=${dateTo}`);

        // Всегда увеличиваем dateTo на 1 день, чтобы включить последний день периода
        dateTo = common.addOneDay(dateTo);
        console.log(`Увеличиваем dateTo: ${dateTo}`);

        const pointName = document.getElementById("pointSelect").value;

        // Сохраняем фильтры в localStorage
        localStorage.setItem("dateRange", document.getElementById("dateRange").value);
        localStorage.setItem("pointName", pointName);

        // Проверяем количество дней в периоде
        const daysDiff = common.getDaysDifference(dateFrom, dateTo);
        console.log(`Разница в днях: ${daysDiff}`);
        if (daysDiff > 31) {
            showError("Выбранный период превышает 31 день. Пожалуйста, выберите период не более 31 дня.");
            setLoading(false);
            return;
        }

        let allData = [];

        try {
            if (daysDiff <= 0) {
                console.log("Период слишком короткий, делаем один запрос");
                const params = new URLSearchParams({
                    date_from: dateFrom,
                    date_to: dateTo
                });
                if (pointName) {
                    params.append("point_name", pointName);
                }

                const response = await window.common.axiosWithRetry(() => window.common.axiosInstance.get(`http://localhost:5000/api/receipts?${params.toString()}`, {
                    headers: { "X-SBISSessionID": sid }
                }));

                if (response.data.data) {
                    allData = response.data.data;
                }
            } else {
                // Создаём массив дат для последовательных запросов (по 1 дню)
                const dateRanges = [];
                let currentFrom = dateFrom;
                while (new Date(currentFrom) < new Date(dateTo)) {
                    let currentTo = common.addOneDay(currentFrom);
                    dateRanges.push({ date_from: currentFrom, date_to: currentTo });
                    currentFrom = currentTo;
                }

                // Выполняем запросы последовательно
                for (const { date_from, date_to } of dateRanges) {
                    console.log(`Запрос: date_from=${date_from}, date_to=${date_to}`);
                    const params = new URLSearchParams({
                        date_from,
                        date_to
                    });
                    if (pointName) {
                        params.append("point_name", pointName);
                    }

                    const response = await window.common.axiosWithRetry(() => window.common.axiosInstance.get(`http://localhost:5000/api/receipts?${params.toString()}`, {
                        headers: { "X-SBISSessionID": sid }
                    }));

                    if (response.data.data) {
                        allData = allData.concat(response.data.data);
                    } else {
                        console.log(`Нет данных за ${date_from} - ${date_to}`);
                    }
                }

                console.log(`Всего получено точек: ${allData.length}`);
            }

            console.log("Все данные получены:", allData);

            // Если выбрана конкретная точка, агрегируем данные для неё
            if (pointName) {
                allData = [aggregateSinglePoint(allData)];
            } else {
                // Если выбраны "Все точки", агрегируем данные
                const aggregatedData = common.aggregateAllPoints(allData);
                console.log("Агрегированные данные для всех точек:", aggregatedData);
                allData = [aggregatedData];
            }

            // Сохраняем данные для экспорта
            currentData = allData;

            // Сохраняем данные и период в localStorage
            localStorage.setItem("salesData", JSON.stringify(currentData));
            const periodString = `${dateFrom} - ${dateTo}`;
            localStorage.setItem("salesPeriod", periodString);

            // Обновляем таблицу
            const tableBody = document.getElementById("salesData");
            tableBody.innerHTML = ""; // Очищаем таблицу перед обновлением

            if (!currentData || currentData.length === 0) {
                tableBody.innerHTML = "<tr><td colspan='4'>Нет данных за выбранный период</td></tr>";
                console.log("Данные не найдены");
                return;
            }

            currentData.forEach(point => {
                console.log(`Обработка точки: ${point.point_name}, items:`, point.items);
                point.items.forEach(item => {
                    const row = document.createElement("tr");
                    row.innerHTML = `
                        <td>${point.point_name}</td>
                        <td>${item.name}</td>
                        <td class="number-cell">${item.quantity} шт.</td>
                        <td class="number-cell">${formatAmount(item.total_sum)}</td>
                    `;
                    tableBody.appendChild(row);
                });
                // Пересчитываем итоговую сумму
                const totalSum = calculateTotalSum(point);
                const totalRow = document.createElement("tr");
                totalRow.innerHTML = `
                    <td colspan='3'><strong>Итого для ${point.point_name}</strong></td>
                    <td class="number-cell"><strong>${formatAmount(totalSum)}</strong></td>
                `;
                tableBody.appendChild(totalRow);
            });
            console.log("Таблица обновлена");

            // Отображаем период данных
            const periodDisplay = document.getElementById("salesDataPeriod");
            periodDisplay.textContent = `Данные за период: ${periodString}`;
        } catch (error) {
            console.error("Ошибка при загрузке данных о продажах:", error);
            let errorMessage = "Ошибка загрузки данных: " + error.message;
            if (error.code === "ERR_NETWORK") {
                errorMessage += " (Проверьте, запущен ли сервер на http://localhost:5000)";
            }
            showError(errorMessage);
        } finally {
            setLoading(false);
        }
    }

    // Инициализация
    try {
        await window.common.getSid();
        if (window.common.getSidValue()) {
            await loadPoints();
        } else {
            showError("Не удалось инициализировать SID");
        }
    } catch (error) {
        console.error("Ошибка инициализации:", error);
        showError("Ошибка инициализации: " + error.message);
    }

    // Добавляем обработчик события для кнопки "Показать"
    const showButton = document.getElementById("showSalesData");
    if (showButton) {
        showButton.addEventListener("click", function () {
            console.log("Обработчик кнопки 'Показать' сработал");
            loadSalesData();
        });
    } else {
        console.error("Кнопка 'showSalesData' не найдена");
    }

    // Добавляем обработчик события для кнопки "Экспорт в XLSX"
    const exportButton = document.getElementById("exportXlsx");
    if (exportButton) {
        exportButton.addEventListener("click", function () {
            console.log("Обработчик кнопки 'Экспорт в XLSX' сработал");
            exportToXlsx();
        });
    } else {
        console.error("Кнопка 'exportXlsx' не найдена");
    }
});