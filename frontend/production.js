document.addEventListener("DOMContentLoaded", async function () {
    let isLoading = false;
    let productionData = null; // Сохраняем данные плана производства
    let blacklist = JSON.parse(localStorage.getItem("productionBlacklist")) || []; // Чёрный список товаров
    let quantityAdjustments = JSON.parse(localStorage.getItem("productionQuantityAdjustments")) || {}; // Корректировки количества
    let isEditing = false; // Флаг режима редактирования

    // Восстановление фильтров из localStorage
    const savedPointName = localStorage.getItem("pointName") || "";

    // Инициализация календаря для дня планирования
    flatpickr("#productionPlanningDate", {
        mode: "single",
        dateFormat: "Y-m-d",
        defaultDate: "2025-04-08" // Пример: следующий день
    });

    // Показать сообщение об ошибке
    function showError(message) {
        window.common.showModal("Ошибка", message, "error");
    }

    // Управление индикатором загрузки
    function setLoading(state) {
        isLoading = state;
        const showButton = document.getElementById("showProductionPlan");
        const editButton = document.getElementById("editProduction");
        const exportButton = document.getElementById("exportProductionXlsx");
        const manageButton = document.getElementById("manageBlacklist");
        const spinner = document.getElementById("loadingSpinner");
        showButton.disabled = state;
        editButton.disabled = state;
        exportButton.disabled = state;
        manageButton.disabled = state;
        showButton.textContent = state ? "Загрузка..." : "Показать";
        spinner.style.display = state ? "block" : "none";
        const tableBody = document.getElementById("productionData");
        if (state) {
            tableBody.innerHTML = `<tr><td colspan='5'>Данные загружаются...</td></tr>`;
        }
    }

    // Загрузка списка точек продаж для вкладки "План производства"
    async function loadProductionPoints() {
        try {
            const kktList = await window.common.loadKktList();
            const pointSelect = document.getElementById("productionPointSelect");
            pointSelect.innerHTML = '<option value="">Все точки</option>';
            kktList.forEach(point => {
                const option = document.createElement("option");
                option.value = point.pointName;
                option.textContent = point.pointName;
                pointSelect.appendChild(option);
            });
            pointSelect.value = savedPointName;
            console.log("Точки продаж для плана производства загружены:", kktList);
        } catch (error) {
            console.error("Ошибка при загрузке точек продаж для плана производства:", error);
            let errorMessage = "Ошибка загрузки точек продаж: " + error.message;
            if (error.code === "ERR_NETWORK") {
                errorMessage += " (Проверьте, запущен ли сервер на http://localhost:5000)";
            }
            showError(errorMessage);
        }
    }

    // Создание вкладок для точек продаж
    function createProductionTabs(data) {
        const tabsContainer = document.getElementById("productionTabs");
        tabsContainer.innerHTML = ""; // Очищаем существующие вкладки

        // Создаём вкладки для каждой точки
        data.forEach(pointData => {
            const tabButton = document.createElement("button");
            tabButton.className = "px-4 py-2 bg-gray-200 rounded-t-lg mr-2 focus:outline-none";
            tabButton.textContent = pointData.point_name;
            tabButton.dataset.point = pointData.point_name;
            tabButton.addEventListener("click", function () {
                // Удаляем активный класс со всех вкладок
                document.querySelectorAll("#productionTabs button").forEach(btn => {
                    btn.classList.remove("bg-blue-500", "text-white");
                    btn.classList.add("bg-gray-200");
                });
                // Добавляем активный класс к текущей вкладке
                tabButton.classList.remove("bg-gray-200");
                tabButton.classList.add("bg-blue-500", "text-white");
                // Отображаем данные для выбранной точки
                displayProductionData(pointData);
            });
            tabsContainer.appendChild(tabButton);
        });

        // Активируем первую вкладку по умолчанию
        if (tabsContainer.children.length > 0) {
            tabsContainer.children[0].classList.remove("bg-gray-200");
            tabsContainer.children[0].classList.add("bg-blue-500", "text-white");
            displayProductionData(data[0]);
        }
    }

    // Отображение данных плана производства
    function displayProductionData(pointData) {
        const tableBody = document.getElementById("productionData");
        tableBody.innerHTML = ""; // Очищаем таблицу перед обновлением

        if (!pointData || !pointData.items || pointData.items.length === 0) {
            tableBody.innerHTML = "<tr><td colspan='5'>Нет данных за выбранный период</td></tr>";
            console.log("Данные для плана производства не найдены");
            return;
        }

        // Фильтруем товары, исключая те, что в чёрном списке
        pointData.items
            .filter(item => !blacklist.includes(item.name))
            .forEach(item => {
                const row = document.createElement("tr");
                const key = `${pointData.point_name}_${item.name}`; // Уникальный ключ для корректировок
                const adjustedToProduce = quantityAdjustments[key] !== undefined ? quantityAdjustments[key] : item.to_produce;
                row.innerHTML = `
                    <td>${item.name}</td>
                    <td class="number-cell">${item.demand} шт.</td>
                    <td class="number-cell">${item.stock} шт.</td>
                    <td class="number-cell ${adjustedToProduce === 0 ? 'zero-to-produce' : ''}">${adjustedToProduce} шт.</td>
                    <td class="edit-actions ${isEditing ? '' : 'hidden'}">
                        <button class="blacklist-btn" data-item="${item.name}">В чёрный список</button>
                        <button class="increment-btn" data-key="${key}" data-item="${item.name}" data-point="${pointData.point_name}">+</button>
                        <button class="decrement-btn" data-key="${key}" data-item="${item.name}" data-point="${pointData.point_name}">−</button>
                    </td>
                `;
                tableBody.appendChild(row);
            });

        // Итоговая строка
        const totalToProduce = pointData.items
            .filter(item => !blacklist.includes(item.name))
            .reduce((sum, item) => {
                const key = `${pointData.point_name}_${item.name}`;
                return sum + (quantityAdjustments[key] !== undefined ? quantityAdjustments[key] : item.to_produce);
            }, 0);
        const totalRow = document.createElement("tr");
        totalRow.innerHTML = `
            <td colspan='3'><strong>Итого для ${pointData.point_name}</strong></td>
            <td class="number-cell"><strong>${totalToProduce} шт.</strong></td>
            <td></td>
        `;
        tableBody.appendChild(totalRow);

        // Добавляем обработчики для кнопок редактирования
        if (isEditing) {
            document.querySelectorAll(".blacklist-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    const itemName = btn.dataset.item;
                    if (!blacklist.includes(itemName)) {
                        blacklist.push(itemName);
                        localStorage.setItem("productionBlacklist", JSON.stringify(blacklist));
                        updateBlacklistDisplay();
                        displayProductionData(pointData); // Перерисовываем таблицу
                    }
                });
            });

            document.querySelectorAll(".increment-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    const key = btn.dataset.key;
                    quantityAdjustments[key] = (quantityAdjustments[key] || pointData.items.find(item => item.name === btn.dataset.item).to_produce) + 1;
                    localStorage.setItem("productionQuantityAdjustments", JSON.stringify(quantityAdjustments));
                    displayProductionData(pointData); // Перерисовываем таблицу
                });
            });

            document.querySelectorAll(".decrement-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    const key = btn.dataset.key;
                    const currentValue = quantityAdjustments[key] !== undefined ? quantityAdjustments[key] : pointData.items.find(item => item.name === btn.dataset.item).to_produce;
                    if (currentValue > 0) {
                        quantityAdjustments[key] = currentValue - 1;
                        localStorage.setItem("productionQuantityAdjustments", JSON.stringify(quantityAdjustments));
                        displayProductionData(pointData); // Перерисовываем таблицу
                    }
                });
            });
        }

        console.log("Таблица плана производства обновлена");
    }

    // Экспорт данных в Excel
    function exportProductionToXlsx() {
        if (!productionData || productionData.length === 0) {
            window.common.showModal("Ошибка", "Нет данных для экспорта", "error");
            return;
        }

        // Формируем данные для XLSX
        const workbook = XLSX.utils.book_new();

        productionData.forEach(pointData => {
            const data = [];
            // Добавляем заголовки
            data.push(["Товар", "Прогнозируемый спрос", "Остатки на складе", "К производству"]);

            // Добавляем строки с данными, исключая товары из чёрного списка
            pointData.items
                .filter(item => !blacklist.includes(item.name))
                .forEach(item => {
                    const key = `${pointData.point_name}_${item.name}`;
                    const adjustedToProduce = quantityAdjustments[key] !== undefined ? quantityAdjustments[key] : item.to_produce;
                    data.push([
                        item.name,
                        item.demand,
                        item.stock,
                        adjustedToProduce
                    ]);
                });

            // Добавляем строку с итогом
            const totalToProduce = pointData.items
                .filter(item => !blacklist.includes(item.name))
                .reduce((sum, item) => {
                    const key = `${pointData.point_name}_${item.name}`;
                    return sum + (quantityAdjustments[key] !== undefined ? quantityAdjustments[key] : item.to_produce);
                }, 0);
            data.push([
                `Итого для ${pointData.point_name}`,
                "",
                "",
                totalToProduce
            ]);

            // Создаём лист для каждой точки
            const ws = XLSX.utils.aoa_to_sheet(data);
            XLSX.utils.book_append_sheet(workbook, ws, pointData.point_name.slice(0, 31)); // Ограничение на длину имени листа
        });

        // Экспортируем файл
        XLSX.writeFile(workbook, "production_plan.xlsx");
    }

    // Загрузка данных для плана производства
    async function loadProductionData() {
        console.log("Кнопка 'Показать план производства' нажата");
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
            await loadProductionPoints();
        }

        if (!kktList || kktList.length === 0) {
            console.log("Список KKT пуст");
            showError("Не удалось загрузить список KKT. Пожалуйста, обновите страницу.");
            return;
        }

        setLoading(true);

        const planningDateInput = document.getElementById("productionPlanningDate").value;
        let planningDate;

        // Проверяем, есть ли значение в поле planningDate
        if (!planningDateInput || planningDateInput.trim() === "") {
            console.log("Поле дня планирования пустое, используем текущую дату");
            planningDate = new Date().toISOString().split('T')[0];
        } else {
            planningDate = planningDateInput;
        }

        const pointName = document.getElementById("productionPointSelect").value;

        try {
            const params = new URLSearchParams({
                planning_date: planningDate
            });
            if (pointName) {
                params.append("point_name", pointName);
            }

            const response = await window.common.axiosWithRetry(() => window.common.axiosInstance.get(`http://localhost:5000/api/production_plan?${params.toString()}`, {
                headers: { "X-SBISSessionID": sid }
            }));

            productionData = response.data.data;
            console.log("Данные плана производства получены:", productionData);

            // Создаём вкладки для точек продаж, если выбраны "Все точки"
            if (!pointName) {
                createProductionTabs(productionData);
            } else {
                // Если выбрана конкретная точка, отображаем только её данные
                document.getElementById("productionTabs").innerHTML = ""; // Очищаем вкладки
                displayProductionData(productionData[0]);
            }
        } catch (error) {
            console.error("Ошибка при загрузке плана производства:", error);
            let errorMessage = "Ошибка загрузки плана производства: " + error.message;
            if (error.code === "ERR_NETWORK") {
                errorMessage += " (Проверьте, запущен ли сервер на http://localhost:5000)";
            }
            showError(errorMessage);
        } finally {
            setLoading(false);
        }
    }

    // Управление чёрным списком
    function updateBlacklistDisplay() {
        const blacklistItems = document.getElementById("blacklistItems");
        blacklistItems.innerHTML = "";
        if (blacklist.length === 0) {
            blacklistItems.innerHTML = "<li>Чёрный список пуст</li>";
        } else {
            blacklist.forEach(item => {
                const li = document.createElement("li");
                li.textContent = item;
                const removeButton = document.createElement("button");
                removeButton.textContent = "Удалить";
                removeButton.className = "ml-2 text-red-500";
                removeButton.addEventListener("click", () => {
                    blacklist = blacklist.filter(i => i !== item);
                    localStorage.setItem("productionBlacklist", JSON.stringify(blacklist));
                    updateBlacklistDisplay();
                    // Перерисовываем таблицу, если данные есть
                    if (productionData) {
                        if (document.getElementById("productionTabs").children.length > 0) {
                            const activeTab = document.querySelector("#productionTabs button.bg-blue-500");
                            if (activeTab) {
                                const pointName = activeTab.dataset.point;
                                const pointData = productionData.find(p => p.point_name === pointName);
                                displayProductionData(pointData);
                            }
                        } else if (productionData[0]) {
                            displayProductionData(productionData[0]);
                        }
                    }
                });
                li.appendChild(removeButton);
                blacklistItems.appendChild(li);
            });
        }
    }

    // Обработка добавления нового товара в чёрный список
    document.getElementById("addBlacklistItem").addEventListener("click", function () {
        const newItemInput = document.getElementById("newBlacklistItem");
        const newItem = newItemInput.value.trim();
        if (newItem && !blacklist.includes(newItem)) {
            blacklist.push(newItem);
            localStorage.setItem("productionBlacklist", JSON.stringify(blacklist));
            updateBlacklistDisplay();
            newItemInput.value = ""; // Очищаем поле ввода
            // Перерисовываем таблицу, если данные есть
            if (productionData) {
                if (document.getElementById("productionTabs").children.length > 0) {
                    const activeTab = document.querySelector("#productionTabs button.bg-blue-500");
                    if (activeTab) {
                        const pointName = activeTab.dataset.point;
                        const pointData = productionData.find(p => p.point_name === pointName);
                        displayProductionData(pointData);
                    }
                } else if (productionData[0]) {
                    displayProductionData(productionData[0]);
                }
            }
        } else if (!newItem) {
            window.common.showModal("Ошибка", "Введите название товара!", "error");
        } else {
            window.common.showModal("Ошибка", "Этот товар уже в чёрном списке!", "error");
        }
    });

    // Обработчик кнопки "Изменить"
    document.getElementById("editProduction").addEventListener("click", function () {
        isEditing = !isEditing;
        const editButton = document.getElementById("editProduction");
        editButton.textContent = isEditing ? "Завершить редактирование" : "Изменить";
        editButton.classList.toggle("bg-yellow-500", !isEditing);
        editButton.classList.toggle("bg-green-500", isEditing);
        // Перерисовываем таблицу, чтобы показать/скрыть кнопки редактирования
        if (productionData) {
            if (document.getElementById("productionTabs").children.length > 0) {
                const activeTab = document.querySelector("#productionTabs button.bg-blue-500");
                if (activeTab) {
                    const pointName = activeTab.dataset.point;
                    const pointData = productionData.find(p => p.point_name === pointName);
                    displayProductionData(pointData);
                }
            } else if (productionData[0]) {
                displayProductionData(productionData[0]);
            }
        }
    });

    // Обработчик кнопки "Управление чёрным списком"
    document.getElementById("manageBlacklist").addEventListener("click", function () {
        const blacklistContainer = document.getElementById("blacklistContainer");
        blacklistContainer.classList.toggle("hidden");
        updateBlacklistDisplay();
    });

    // Инициализация
    try {
        await window.common.getSid();
        if (window.common.getSidValue()) {
            await loadProductionPoints();
        } else {
            showError("Не удалось инициализировать SID");
        }
    } catch (error) {
        console.error("Ошибка инициализации:", error);
        showError("Ошибка инициализации: " + error.message);
    }

    // Обновляем отображение чёрного списка при загрузке
    updateBlacklistDisplay();

    // Добавляем обработчик события для кнопки "Показать" на вкладке "План производства"
    const showProductionButton = document.getElementById("showProductionPlan");
    if (showProductionButton) {
        showProductionButton.addEventListener("click", function () {
            console.log("Обработчик кнопки 'Показать план производства' сработал");
            loadProductionData();
        });
    } else {
        console.error("Кнопка 'showProductionPlan' не найдена");
    }

    // Добавляем обработчик события для кнопки "Экспорт в Excel"
    const exportProductionButton = document.getElementById("exportProductionXlsx");
    if (exportProductionButton) {
        exportProductionButton.addEventListener("click", function () {
            console.log("Обработчик кнопки 'Экспорт в Excel' сработал");
            exportProductionToXlsx();
        });
    } else {
        console.error("Кнопка 'exportProductionXlsx' не найдена");
    }
});