document.addEventListener("DOMContentLoaded", async function () {
    let isLoading = false;
    let salaryData = null; // Данные о зарплатах
    let employeesData = null; // Данные о сотрудниках
    let ratesData = null; // Данные о ставках

    // Функция для получения списка месяцев (с января 2024 по текущий месяц)
    function generateMonthOptions() {
        const select = document.getElementById("salaryMonthSelect");
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth(); // 0-11 (январь - декабрь)

        const monthsRu = [
            "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
            "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
        ];

        let options = [];
        // Начинаем с января 2024 года
        for (let year = 2024; year <= currentYear; year++) {
            const startMonth = (year === 2024) ? 0 : 0; // Январь 2024
            const endMonth = (year === currentYear) ? currentMonth : 11; // До текущего месяца в 2025

            for (let month = startMonth; month <= endMonth; month++) {
                const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`; // Например, "2025-05"
                const displayStr = `${monthsRu[month]} ${year}`;
                options.push({ value: monthStr, text: displayStr });
            }
        }

        // Сортируем по убыванию, чтобы последние месяцы были сверху
        options.reverse().forEach(option => {
            const opt = document.createElement("option");
            opt.value = option.value;
            opt.textContent = option.text;
            select.appendChild(opt);
        });

        // Устанавливаем текущий месяц по умолчанию
        select.value = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    }

    // Функция для получения количества дней в месяце
    function getDaysInMonth(year, month) {
        return new Date(year, month + 1, 0).getDate();
    }

    // Показать сообщение
    function showMessage(title, message, type) {
        console.log("showMessage вызван:", { title, message, type }); // Отладочный лог
        window.common.showModal(title, message, type);
    }

    // Загрузка сотрудников
    async function loadEmployees() {
        try {
            const response = await window.common.axiosWithRetry(() => window.common.axiosInstance.get("http://localhost:5000/api/employees"));
            const employees = response.data.employees || [];
            console.log("Сотрудники загружены:", employees); // Отладочный лог
            if (!employees.length) {
                console.warn("Список сотрудников пуст");
            }
            return employees;
        } catch (error) {
            console.error("Ошибка при загрузке сотрудников:", error);
            showMessage("Ошибка", `Ошибка загрузки сотрудников: ${error.response?.data?.error || error.message}`, "error");
            return [];
        }
    }

    // Загрузка ставок
    async function loadSalaryRates() {
        try {
            const response = await window.common.axiosWithRetry(() => window.common.axiosInstance.get("http://localhost:5000/api/salary_rates"));
            const rates = response.data.rates || [];
            console.log("Ставки загружены:", rates); // Отладочный лог
            if (!rates.length) {
                console.warn("Список ставок пуст");
            }
            return rates;
        } catch (error) {
            console.error("Ошибка при загрузке ставок:", error);
            showMessage("Ошибка", `Ошибка загрузки ставок: ${error.response?.data?.error || error.message}`, "error");
            return [];
        }
    }

    // Управление индикатором загрузки
    function setLoading(state) {
        isLoading = state;
        const applyButton = document.getElementById("applySalaryFilters");
        const approveButton = document.getElementById("approveHours");
        const exportButton = document.getElementById("exportSalariesToExcel");
        const spinner = document.getElementById("loadingSpinner");
        applyButton.disabled = state;
        approveButton.disabled = state;
        exportButton.disabled = state;
        applyButton.textContent = state ? "Загрузка..." : "Показать";
        spinner.style.display = state ? "block" : "none";
        const tableBody = document.getElementById("salaryDataContainer");
        if (state) {
            tableBody.innerHTML = `<p>Данные загружаются...</p>`;
        }
    }

    // Функция для отображения данных о зарплатах
    function displaySalaryData(data, month) {
        const tableBody = document.getElementById("salaryDataContainer");
        tableBody.innerHTML = ""; // Очищаем таблицу перед обновлением

        // Даже если данных о зарплате нет, отображаем таблицу на основе списка сотрудников
        if (!employeesData || employeesData.length === 0) {
            tableBody.innerHTML = "<p>Нет данных о сотрудниках</p>";
            console.log("Сотрудники не найдены");
            return;
        }

        const [year, monthNum] = month.split('-').map(Number);
        const daysInMonth = getDaysInMonth(year, monthNum - 1);
        const monthsRu = [
            "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
            "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
        ];
        const monthName = monthsRu[monthNum - 1];

        // Создаём таблицу
        const table = document.createElement("table");
        table.className = "w-full border-collapse";

        // Создаём заголовок таблицы
        const thead = document.createElement("thead");
        let headerRow = document.createElement("tr");
        headerRow.innerHTML = `
            <th>Имя</th>
            <th>Фамилия</th>
            <th>Группа</th>
        `;
        // Добавляем заголовки для каждого дня месяца
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, monthNum - 1, day);
            const dayOfWeek = date.toLocaleString('ru-RU', { weekday: 'short' });
            headerRow.innerHTML += `<th>${day} ${dayOfWeek}</th>`;
        }
        headerRow.innerHTML += `<th>Итоговая зарплата (руб.)</th>`;
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Создаём тело таблицы
        const tbody = document.createElement("tbody");
        employeesData.forEach(employee => {
            const row = document.createElement("tr");
            const rate = ratesData.find(r => r.group === employee.group);
            const paymentType = rate ? rate.paymentType : "hourly";
            const employeeSalary = data.find(s => s.id === employee.id);

            row.innerHTML = `
                <td>${employee.firstName}</td>
                <td>${employee.lastName}</td>
                <td>${employee.group}</td>
            `;

            // Добавляем ячейки для каждого дня
            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const hoursData = employee.hours?.[dateStr] || {};
                const hours = hoursData.hours || 0;
                const worked = hoursData.worked || false;

                if (paymentType === "hourly") {
                    row.innerHTML += `
                        <td>
                            <input type="number" class="hours-input border p-1 rounded w-16 text-center"
                                   data-employee-id="${employee.id}"
                                   data-date="${dateStr}"
                                   value="${hours}"
                                   min="0">
                        </td>
                    `;
                } else {
                    row.innerHTML += `
                        <td>
                            <input type="checkbox" class="worked-checkbox"
                                   data-employee-id="${employee.id}"
                                   data-date="${dateStr}"
                                   ${worked ? "checked" : ""}>
                        </td>
                    `;
                }
            }

            // Итоговая зарплата
            const totalSalary = employeeSalary ? employeeSalary.totalSalary : 0;
            row.innerHTML += `<td class="number-cell">${totalSalary.toFixed(2)}</td>`;
            tbody.appendChild(row);
        });

        table.appendChild(tbody);
        tableBody.appendChild(table);

        // Добавляем обработчики для изменения часов/работы
        document.querySelectorAll(".hours-input").forEach(input => {
            input.addEventListener("change", function () {
                const employeeId = parseInt(this.dataset.employeeId);
                const date = this.dataset.date;
                const hours = parseFloat(this.value) || 0;

                const employee = employeesData.find(e => e.id === employeeId);
                if (!employee.hours) employee.hours = {};
                if (!employee.hours[date]) employee.hours[date] = {};
                employee.hours[date].hours = hours;

                // Пересчитываем итоговую зарплату
                updateEmployeeSalary(employee, month);
            });
        });

        document.querySelectorAll(".worked-checkbox").forEach(checkbox => {
            checkbox.addEventListener("change", function () {
                const employeeId = parseInt(this.dataset.employeeId);
                const date = this.dataset.date;
                const worked = this.checked;

                const employee = employeesData.find(e => e.id === employeeId);
                if (!employee.hours) employee.hours = {};
                if (!employee.hours[date]) employee.hours[date] = {};
                employee.hours[date].worked = worked;

                // Пересчитываем итоговую зарплату
                updateEmployeeSalary(employee, month);
            });
        });
    }

    // Обновление зарплаты сотрудника
    function updateEmployeeSalary(employee, month) {
        const [year, monthNum] = month.split('-').map(Number);
        const daysInMonth = getDaysInMonth(year, monthNum - 1);
        const dates = [];
        for (let day = 1; day <= daysInMonth; day++) {
            dates.push(`${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
        }

        const rate = ratesData.find(r => r.group === employee.group) || { paymentType: "hourly", hourlyRate: 0, dailyRate: 0 };
        let totalSalary = 0;

        dates.forEach(date => {
            const hoursData = employee.hours?.[date] || { hours: 0, worked: false };
            let salary = 0;
            if (rate.paymentType === "hourly" && hoursData.hours > 0) {
                salary = hoursData.hours * rate.hourlyRate;
            } else if (rate.paymentType === "daily" && hoursData.worked) {
                salary = rate.dailyRate;
            }
            totalSalary += salary;
        });

        // Обновляем ячейку итоговой зарплаты
        const row = document.querySelector(`.hours-input[data-employee-id="${employee.id}"], .worked-checkbox[data-employee-id="${employee.id}"]`).closest('tr');
        row.cells[row.cells.length - 1].textContent = totalSalary.toFixed(2);
    }

    // Загрузка данных о сотрудниках и ставках
    async function loadEmployeesAndRates() {
        try {
            employeesData = await loadEmployees();
            ratesData = await loadSalaryRates();
        } catch (error) {
            console.error("Ошибка при загрузке сотрудников или ставок:", error);
            showMessage("Ошибка", `Ошибка загрузки данных: ${error.message}`, "error");
        }
    }

    // Загрузка данных о зарплатах за месяц
    async function loadSalaries() {
        const month = document.getElementById("salaryMonthSelect").value;
        setLoading(true);
        try {
            const response = await window.common.axiosWithRetry(() =>
                window.common.axiosInstance.get("http://localhost:5000/api/salaries", {
                    params: { month }
                })
            );
            salaryData = response.data.salaries || [];
            console.log(`Зарплаты загружены за месяц ${month}:`, salaryData);
            displaySalaryData(salaryData, month);
        } catch (error) {
            console.error("Ошибка при загрузке зарплат:", error);
            showMessage("Ошибка", `Ошибка загрузки зарплат: ${error.response?.data?.error || error.message}`, "error");
            // Даже если произошла ошибка при загрузке зарплат, всё равно отображаем таблицу на основе сотрудников
            displaySalaryData([], month);
        } finally {
            setLoading(false);
        }
    }

    // Сохранение часов работы сотрудников
    async function saveEmployeeHours() {
        setLoading(true);
        try {
            for (const employee of employeesData) {
                await window.common.axiosWithRetry(() =>
                    window.common.axiosInstance.post("http://localhost:5000/api/employees", employee)
                );
            }
            console.log("Часы работы сотрудников сохранены:", employeesData);
            showMessage("Успех", "Часы работы сотрудников успешно сохранены", "success");

            // Перезагружаем данные о зарплатах
            await loadSalaries();
        } catch (error) {
            console.error("Ошибка при сохранении часов работы:", error);
            showMessage("Ошибка", `Ошибка сохранения часов работы: ${error.response?.data?.error || error.message}`, "error");
        } finally {
            setLoading(false);
        }
    }

    // Экспорт данных в Excel
    async function exportSalariesToExcel() {
        if (!employeesData || employeesData.length === 0) {
            showMessage("Ошибка", "Нет данных для экспорта", "error");
            return;
        }

        const month = document.getElementById("salaryMonthSelect").value;
        const [year, monthNum] = month.split('-').map(Number);
        const daysInMonth = getDaysInMonth(year, monthNum - 1);
        const monthsRu = [
            "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
            "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
        ];
        const monthName = monthsRu[monthNum - 1];

        // Формируем данные для XLSX
        const data = [];
        // Добавляем заголовки
        let headers = ["Имя", "Фамилия", "Группа"];
        for (let day = 1; day <= daysInMonth; day++) {
            headers.push(`${day}`);
        }
        headers.push("Итоговая зарплата (руб.)");
        data.push(headers);

        employeesData.forEach(employee => {
            const row = [employee.firstName, employee.lastName, employee.group];
            const rate = ratesData.find(r => r.group === employee.group);
            const paymentType = rate ? rate.paymentType : "hourly";
            const employeeSalary = salaryData.find(s => s.id === employee.id);

            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const hoursData = employee.hours?.[dateStr] || {};
                if (paymentType === "hourly") {
                    const hours = hoursData.hours || 0;
                    row.push(hours);
                } else {
                    const worked = hoursData.worked || false;
                    row.push(worked ? "Да" : "Нет");
                }
            }

            const totalSalary = employeeSalary ? employeeSalary.totalSalary : 0;
            row.push(totalSalary.toFixed(2));
            data.push(row);
        });

        // Создаём рабочий лист
        const ws = XLSX.utils.aoa_to_sheet(data);
        // Создаём рабочую книгу
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Salaries");
        // Экспортируем файл
        XLSX.writeFile(wb, `salaries_${monthName}_${year}.xlsx`);
    }

    // Загрузка сотрудников (глобальная функция)
    async function loadEmployeeList(container) {
        const employees = await loadEmployees();
        const employeeList = container;
        employeeList.innerHTML = "";
        if (!employees || employees.length === 0) {
            employeeList.innerHTML = "<p>Нет сотрудников</p>";
            return;
        }
        employees.forEach(employee => {
            const div = document.createElement("div");
            div.className = "employee-item";
            div.innerHTML = `
                <span class="flex-1">${employee.firstName} ${employee.lastName} (${employee.group})</span>
                <button class="btn btn-blue edit-employee" data-id="${employee.id}">Редактировать</button>
                <button class="btn btn-red delete-employee" data-id="${employee.id}">Удалить</button>
            `;
            employeeList.appendChild(div);
        });

        document.querySelectorAll(".edit-employee").forEach(btn => {
            btn.addEventListener("click", async () => {
                console.log("Нажата кнопка 'Редактировать' для сотрудника с id:", btn.dataset.id); // Отладочный лог
                const id = parseInt(btn.dataset.id);
                const employee = employees.find(e => e.id === id);
                await openEmployeeModal(employee);
            });
        });

        document.querySelectorAll(".delete-employee").forEach(btn => {
            btn.addEventListener("click", async () => {
                console.log("Нажата кнопка 'Удалить' для сотрудника с id:", btn.dataset.id); // Отладочный лог
                const id = parseInt(btn.dataset.id);
                try {
                    await window.common.axiosWithRetry(() => window.common.axiosInstance.delete(`http://localhost:5000/api/employees/${id}`));
                    showMessage("Успех", "Сотрудник удалён", "success");
                    await loadEmployeeList(employeeList);
                } catch (error) {
                    showMessage("Ошибка", `Ошибка удаления сотрудника: ${error.response?.data?.error || error.message}`, "error");
                }
            });
        });

        console.log("Список сотрудников загружен, кнопки 'Редактировать' и 'Удалить' должны быть видны"); // Отладочный лог
    }

    // Загрузка групп (глобальная функция)
    async function loadGroupList(container) {
        const rates = await loadSalaryRates();
        const groupList = container;
        groupList.innerHTML = "";
        if (!rates || rates.length === 0) {
            groupList.innerHTML = "<p>Нет групп</p>";
            return;
        }
        rates.forEach(rate => {
            const div = document.createElement("div");
            div.className = "group-item";
            div.innerHTML = `
                <span class="flex-1">${rate.group} (${rate.paymentType === "hourly" ? rate.hourlyRate + " руб/час" : rate.dailyRate + " руб/день"})</span>
                <button class="btn btn-blue edit-group" data-group="${rate.group}">Редактировать</button>
                <button class="btn btn-red delete-group" data-group="${rate.group}">Удалить</button>
            `;
            groupList.appendChild(div);
        });

        document.querySelectorAll(".edit-group").forEach(btn => {
            btn.addEventListener("click", async () => {
                console.log("Нажата кнопка 'Редактировать' для группы:", btn.dataset.group); // Отладочный лог
                const group = btn.dataset.group;
                const rate = rates.find(r => r.group === group);
                await openGroupModal(rate);
            });
        });

        document.querySelectorAll(".delete-group").forEach(btn => {
            btn.addEventListener("click", async () => {
                console.log("Нажата кнопка 'Удалить' для группы:", btn.dataset.group); // Отладочный лог
                const group = btn.dataset.group;
                try {
                    await window.common.axiosWithRetry(() => window.common.axiosInstance.delete(`http://localhost:5000/api/salary_rates/${group}`));
                    showMessage("Успех", "Группа удалена", "success");
                    await loadGroupList(groupList);
                } catch (error) {
                    showMessage("Ошибка", `Ошибка удаления группы: ${error.response?.data?.error || error.message}`, "error");
                }
            });
        });

        console.log("Список групп загружен, кнопки 'Редактировать' и 'Удалить' должны быть видны"); // Отладочный лог
    }

    // Открытие настроек
    async function openSettingsModal() {
        const existingModal = document.querySelector('.modal');
        if (existingModal) existingModal.remove();

        const modal = window.common.createModal({
            title: "Настройки зарплат",
            content: `
                <div class="tab-container">
                    <button id="employeesTabBtn" class="tab-btn active" data-tab="employees">Сотрудники</button>
                    <button id="groupsTabBtn" class="tab-btn" data-tab="groups">Группы</button>
                </div>
                <div id="employeesTab" class="tab-content active">
                    <button id="addEmployee" class="btn btn-green">Добавить сотрудника</button>
                    <div id="employeeList"></div>
                </div>
                <div id="groupsTab" class="tab-content">
                    <button id="addGroup" class="btn btn-green">Добавить группу</button>
                    <div id="groupList"></div>
                </div>
            `,
            buttons: [
                { id: "closeModal", text: "Закрыть", class: "btn-gray" }
            ]
        });

        console.log("Модальное окно настроек создано"); // Отладочный лог
        console.log("Кнопка 'Добавить сотрудника' должна быть видна:", document.getElementById("addEmployee")); // Отладочный лог
        console.log("Кнопка 'Добавить группу' должна быть видна:", document.getElementById("addGroup")); // Отладочный лог

        const closeModal = () => {
            // Удаляем обработчики событий перед удалением модального окна
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.removeEventListener('click', btn._listener);
            });
            modal.remove();
        };
        document.getElementById("closeModal").addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        // Переключение вкладок
        document.querySelectorAll('.tab-btn').forEach(btn => {
            const listener = () => {
                const employeesTab = document.getElementById("employeesTab");
                const groupsTab = document.getElementById("groupsTab");

                // Скрываем все вкладки
                if (employeesTab) {
                    employeesTab.classList.remove('active');
                }
                if (groupsTab) {
                    groupsTab.classList.remove('active');
                }

                // Показываем выбранную вкладку
                const targetTab = document.getElementById(`${btn.dataset.tab}Tab`);
                if (targetTab) {
                    targetTab.classList.add('active');
                }

                // Обновляем стили кнопок вкладок
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Отладка: проверяем вычисленные стили
                console.log(`Вкладка переключена на: ${btn.dataset.tab}`); // Отладочный лог
                console.log("Классы вкладки 'Сотрудники':", employeesTab ? employeesTab.className : "не найден"); // Отладочный лог
                console.log("Вычисленный стиль display для 'Сотрудники':", employeesTab ? window.getComputedStyle(employeesTab).display : "не найден"); // Отладочный лог
                console.log("Классы вкладки 'Группы':", groupsTab ? groupsTab.className : "не найден"); // Отладочный лог
                console.log("Вычисленный стиль display для 'Группы':", groupsTab ? window.getComputedStyle(groupsTab).display : "не найден"); // Отладочный лог
                console.log("Вычисленный стиль display для кнопки 'Добавить сотрудника':", document.getElementById("addEmployee") ? window.getComputedStyle(document.getElementById("addEmployee")).display : "не найден"); // Отладочный лог
                console.log("Вычисленный стиль display для кнопки 'Добавить группу':", document.getElementById("addGroup") ? window.getComputedStyle(document.getElementById("addGroup")).display : "не найден"); // Отладочный лог
            };
            btn._listener = listener; // Сохраняем обработчик для возможности удаления
            btn.addEventListener('click', listener);
        });

        // Добавление обработчиков для кнопок "Добавить"
        const addEmployeeButton = document.getElementById("addEmployee");
        const addGroupButton = document.getElementById("addGroup");
        const employeeListContainer = document.getElementById("employeeList");
        const groupListContainer = document.getElementById("groupList");

        if (addEmployeeButton) {
            addEmployeeButton.addEventListener("click", () => {
                console.log("Нажата кнопка 'Добавить сотрудника'");
                openEmployeeModal();
            });
        } else {
            console.error("Кнопка 'Добавить сотрудника' не найдена в DOM");
        }

        if (addGroupButton) {
            addGroupButton.addEventListener("click", () => {
                console.log("Нажата кнопка 'Добавить группу'");
                openGroupModal();
            });
        } else {
            console.error("Кнопка 'Добавить группу' не найдена в DOM");
        }

        await loadEmployeeList(employeeListContainer);
        await loadGroupList(groupListContainer);
    }

    // Модальное окно для сотрудника
    async function openEmployeeModal(employee = null) {
        const rates = await loadSalaryRates();
        const groups = rates.map(r => r.group);
        const modal = window.common.createModal({
            title: employee ? "Редактировать сотрудника" : "Добавить сотрудника",
            content: `
                <div class="mb-4">
                    <label class="block mb-1">Имя:</label>
                    <input type="text" id="employeeFirstName" class="border p-2 rounded w-full" value="${employee ? employee.firstName : ''}" required>
                </div>
                <div class="mb-4">
                    <label class="block mb-1">Фамилия:</label>
                    <input type="text" id="employeeLastName" class="border p-2 rounded w-full" value="${employee ? employee.lastName : ''}" required>
                </div>
                <div class="mb-4">
                    <label class="block mb-1">Группа:</label>
                    <select id="employeeGroup" class="border p-2 rounded w-full" required>
                        <option value="">Выберите группу</option>
                        ${groups.map(g => `<option value="${g}" ${employee && employee.group === g ? 'selected' : ''}>${g}</option>`).join('')}
                    </select>
                </div>
            `,
            buttons: [
                { id: "saveEmployee", text: "Сохранить", class: "btn-blue" },
                { id: "cancelEmployee", text: "Отмена", class: "btn-gray" }
            ]
        });

        document.getElementById("saveEmployee").addEventListener("click", async () => {
            const firstName = document.getElementById("employeeFirstName").value.trim();
            const lastName = document.getElementById("employeeLastName").value.trim();
            const group = document.getElementById("employeeGroup").value;

            if (!firstName || !lastName || !group) {
                showMessage("Ошибка", "Заполните все поля", "error");
                return;
            }

            const employeeData = {
                firstName,
                lastName,
                group,
                hours: employee ? employee.hours : {}
            };
            if (employee) {
                employeeData.id = employee.id;
            }

            try {
                await window.common.axiosWithRetry(() => window.common.axiosInstance.post("http://localhost:5000/api/employees", employeeData));
                showMessage("Успех", "Сотрудник сохранён", "success");
                const employeeListContainer = document.getElementById("employeeList");
                if (employeeListContainer) {
                    await loadEmployeeList(employeeListContainer);
                }
                modal.remove();
            } catch (error) {
                showMessage("Ошибка", `Ошибка сохранения сотрудника: ${error.response?.data?.error || error.message}`, "error");
            }
        });

        document.getElementById("cancelEmployee").addEventListener("click", () => modal.remove());
    }

    // Модальное окно для группы
    async function openGroupModal(rate = null) {
        const modal = window.common.createModal({
            title: rate ? "Редактировать группу" : "Добавить группу",
            content: `
                <div class="mb-4">
                    <label class="block mb-1">Группа:</label>
                    <input type="text" id="groupName" class="border p-2 rounded w-full" value="${rate ? rate.group : ''}" required>
                </div>
                <div class="mb-4">
                    <label class="block mb-1">Тип оплаты:</label>
                    <select id="paymentType" class="border p-2 rounded w-full" required>
                        <option value="hourly" ${rate && rate.paymentType === "hourly" ? 'selected' : ''}>Почасовая</option>
                        <option value="daily" ${rate && rate.paymentType === "daily" ? 'selected' : ''}>Дневная</option>
                    </select>
                </div>
                <div class="mb-4" id="hourlyRateField" style="display: ${rate && rate.paymentType === "hourly" ? 'block' : 'none'}">
                    <label class="block mb-1">Почасовая ставка (руб):</label>
                    <input type="number" id="hourlyRate" class="border p-2 rounded w-full" value="${rate && rate.paymentType === "hourly" ? rate.hourlyRate : '0'}" min="0">
                </div>
                <div class="mb-4" id="dailyRateField" style="display: ${rate && rate.paymentType === "daily" ? 'block' : 'none'}">
                    <label class="block mb-1">Дневная ставка (руб):</label>
                    <input type="number" id="dailyRate" class="border p-2 rounded w-full" value="${rate && rate.paymentType === "daily" ? rate.dailyRate : '0'}" min="0">
                </div>
            `,
            buttons: [
                { id: "saveGroup", text: "Сохранить", class: "btn-blue" },
                { id: "cancelGroup", text: "Отмена", class: "btn-gray" }
            ]
        });

        const paymentTypeSelect = document.getElementById("paymentType");
        const hourlyRateField = document.getElementById("hourlyRateField");
        const dailyRateField = document.getElementById("dailyRateField");

        paymentTypeSelect.addEventListener("change", () => {
            const value = paymentTypeSelect.value;
            hourlyRateField.style.display = value === "hourly" ? "block" : "none";
            dailyRateField.style.display = value === "daily" ? "block" : "none";
        });

        document.getElementById("saveGroup").addEventListener("click", async () => {
            const group = document.getElementById("groupName").value.trim();
            const paymentType = document.getElementById("paymentType").value;
            const hourlyRate = parseFloat(document.getElementById("hourlyRate").value) || 0;
            const dailyRate = parseFloat(document.getElementById("dailyRate").value) || 0;

            if (!group) {
                showMessage("Ошибка", "Название группы обязательно", "error");
                return;
            }

            if (paymentType === "hourly" && hourlyRate <= 0) {
                showMessage("Ошибка", "Почасовая ставка должна быть больше 0", "error");
                return;
            }

            if (paymentType === "daily" && dailyRate <= 0) {
                showMessage("Ошибка", "Дневная ставка должна быть больше 0", "error");
                return;
            }

            try {
                await window.common.axiosWithRetry(() => window.common.axiosInstance.post("http://localhost:5000/api/salary_rates", {
                    group,
                    paymentType,
                    hourlyRate: paymentType === "hourly" ? hourlyRate : 0,
                    dailyRate: paymentType === "daily" ? dailyRate : 0
                }));
                showMessage("Успех", "Группа сохранена", "success");
                const groupListContainer = document.getElementById("groupList");
                if (groupListContainer) {
                    await loadGroupList(groupListContainer);
                }
                modal.remove();
            } catch (error) {
                showMessage("Ошибка", `Ошибка сохранения группы: ${error.response?.data?.error || error.message}`, "error");
            }
        });

        document.getElementById("cancelGroup").addEventListener("click", () => modal.remove());
    }

    // Инициализация
    try {
        await window.common.getSid();
        if (window.common.getSidValue()) {
            await loadEmployeesAndRates();
            generateMonthOptions();
            // Загружаем данные за текущий месяц по умолчанию
            await loadSalaries();
        } else {
            showMessage("Ошибка", "Не удалось инициализировать SID", "error");
        }
    } catch (error) {
        console.error("Ошибка инициализации:", error);
        showMessage("Ошибка", `Ошибка инициализации: ${error.message}`, "error");
    }

    // Обработчики кнопок
    document.getElementById("applySalaryFilters").addEventListener("click", () => {
        console.log("Нажата кнопка 'Показать'");
        loadSalaries();
    });
    document.getElementById("exportSalariesToExcel").addEventListener("click", () => {
        console.log("Нажата кнопка 'Экспорт в Excel'");
        exportSalariesToExcel();
    });
    document.getElementById("openSalarySettings").addEventListener("click", () => {
        console.log("Нажата кнопка 'Настройки'");
        openSettingsModal();
    });
    document.getElementById("approveHours").addEventListener("click", () => {
        console.log("Нажата кнопка 'Сохранить'");
        saveEmployeeHours();
    });
});