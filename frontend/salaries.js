document.addEventListener("DOMContentLoaded", async function () {
    // Инициализация календаря
    flatpickr("#salaryFilterDateRange", {
        mode: "range",
        dateFormat: "Y-m-d",
        maxDate: "today",
        defaultDate: [
            new Date().toISOString().split('T')[0],
            new Date().toISOString().split('T')[0]
        ]
    });

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

    // Получение списка дат в периоде
    function getDateRange(start, end) {
        const dates = [];
        let current = new Date(start);
        const endDate = new Date(end);
        while (current <= endDate) {
            dates.push(current.toISOString().split('T')[0]);
            current.setDate(current.getDate() + 1);
        }
        return dates;
    }

    // Отображение таблицы зарплат
    async function loadSalaries() {
        try {
            const dateRange = document.getElementById("salaryFilterDateRange").value;
            const [dateFrom, dateTo] = dateRange ? dateRange.split(" to ") : [new Date().toISOString().split('T')[0], new Date().toISOString().split('T')[0]];
            const employees = await loadEmployees();
            const rates = await loadSalaryRates();
            const rateMap = rates.reduce((map, rate) => {
                map[rate.group] = { paymentType: rate.paymentType, hourly: rate.hourlyRate, daily: rate.dailyRate };
                return map;
            }, {});
            const dates = getDateRange(dateFrom, dateTo);
            const tableBody = document.getElementById("salaryData");
            tableBody.innerHTML = "";

            if (!employees || employees.length === 0) {
                tableBody.innerHTML = "<tr><td colspan='10'>Нет данных о сотрудниках</td></tr>";
                return;
            }

            // Заголовок таблицы
            const headerRow = document.createElement("tr");
            headerRow.innerHTML = `
                <th class="border p-2">Имя</th>
                <th class="border p-2">Фамилия</th>
                <th class="border p-2">Группа</th>
                ${dates.map(date => `<th class="border p-2">${date}</th>`).join('')}
                <th class="border p-2">Итоговая зарплата</th>
            `;
            tableBody.appendChild(headerRow);

            // Данные сотрудников
            employees.forEach(employee => {
                const row = document.createElement("tr");
                const rate = rateMap[employee.group] || { paymentType: "hourly", hourly: 0, daily: 0 };
                let totalSalary = 0;
                const inputs = [];

                const cells = `
                    <td class="border p-2">${employee.firstName}</td>
                    <td class="border p-2">${employee.lastName}</td>
                    <td class="border p-2">${employee.group}</td>
                    ${dates.map(date => {
                        const hoursData = employee.hours && employee.hours[date] || { hours: 0, worked: false };
                        const inputId = `input_${employee.id}_${date}`;
                        let salary = 0;
                        if (rate.paymentType === "hourly" && hoursData.hours > 0) {
                            salary = hoursData.hours * rate.hourly;
                        } else if (rate.paymentType === "daily" && hoursData.worked) {
                            salary = rate.daily;
                        }
                        totalSalary += salary;
                        const inputElement = rate.paymentType === "hourly" ?
                            `<input type="number" id="${inputId}" class="border p-1 w-16 text-sm" value="${hoursData.hours}" min="0">` :
                            `<input type="checkbox" id="${inputId}" class="ml-2" ${hoursData.worked ? 'checked' : ''}>`;
                        inputs.push({ id: inputId, element: null, date }); // Будем добавлять element позже
                        return `<td class="border p-2">${inputElement}</td>`;
                    }).join('')}
                    <td class="border p-2">${totalSalary}</td>
                `;
                row.innerHTML = cells;
                tableBody.appendChild(row);

                // Обновляем inputs с элементом после добавления в DOM
                inputs.forEach(input => {
                    input.element = document.getElementById(input.id);
                    if (rate.paymentType === "hourly") {
                        input.element.addEventListener("input", () => updateEmployeeSalary(employee, dates, inputs, rateMap));
                    } else {
                        input.element.addEventListener("change", () => updateEmployeeSalary(employee, dates, inputs, rateMap));
                    }
                });
            });

            // Кнопка Утвердить часы
            const approveButton = document.getElementById("approveHours");
            // Удаляем старые обработчики, если они есть
            approveButton.removeEventListener("click", approveButton._listener);
            const listener = async () => {
                const updatedEmployees = [];
                for (const employee of employees) {
                    const hours = {};
                    const rate = rateMap[employee.group] || { paymentType: "hourly" };
                    dates.forEach(date => {
                        const input = document.getElementById(`input_${employee.id}_${date}`);
                        if (rate.paymentType === "hourly") {
                            const hoursValue = parseInt(input.value) || 0;
                            if (hoursValue > 0) {
                                hours[date] = { hours: hoursValue, worked: false };
                            }
                        } else {
                            const workedValue = input.checked;
                            if (workedValue) {
                                hours[date] = { hours: 0, worked: workedValue };
                            }
                        }
                    });
                    updatedEmployees.push({
                        id: employee.id,
                        firstName: employee.firstName,
                        lastName: employee.lastName,
                        group: employee.group,
                        hours
                    });
                }

                try {
                    for (const employee of updatedEmployees) {
                        await window.common.axiosWithRetry(() => window.common.axiosInstance.post("http://localhost:5000/api/employees", employee));
                    }
                    showMessage("Успех", "Часы утверждены", "success");
                    await loadSalaries();
                } catch (error) {
                    console.error("Ошибка при утверждении часов:", error);
                    showMessage("Ошибка", `Ошибка при утверждении часов: ${error.response?.data?.error || error.message}`, "error");
                }
            };
            approveButton._listener = listener;
            approveButton.addEventListener("click", listener);
        } catch (error) {
            console.error("Ошибка при загрузке зарплат:", error);
            showMessage("Ошибка", `Ошибка загрузки зарплат: ${error.response?.data?.error || error.message}`, "error");
        }
    }

    // Обновление зарплаты сотрудника
    function updateEmployeeSalary(employee, dates, inputs, rateMap) {
        let totalSalary = 0;
        const rate = rateMap[employee.group] || { paymentType: "hourly", hourly: 0, daily: 0 };
        dates.forEach(date => {
            const input = document.getElementById(`input_${employee.id}_${date}`);
            let salary = 0;
            if (rate.paymentType === "hourly") {
                const hours = parseInt(input.value) || 0;
                if (hours > 0) {
                    salary = hours * rate.hourly;
                }
            } else if (rate.paymentType === "daily" && input.checked) {
                salary = rate.daily;
            }
            totalSalary += salary;
        });
        const row = inputs[0].element.closest('tr');
        row.cells[row.cells.length - 1].textContent = totalSalary;
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

        // Загрузка сотрудников
        async function loadEmployeeList() {
            const employees = await loadEmployees();
            const employeeList = document.getElementById("employeeList");
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
                        await loadEmployeeList();
                    } catch (error) {
                        showMessage("Ошибка", `Ошибка удаления сотрудника: ${error.response?.data?.error || error.message}`, "error");
                    }
                });
            });

            console.log("Список сотрудников загружен, кнопки 'Редактировать' и 'Удалить' должны быть видны"); // Отладочный лог
        }

        // Загрузка групп
        async function loadGroupList() {
            const rates = await loadSalaryRates();
            const groupList = document.getElementById("groupList");
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
                        await loadGroupList();
                    } catch (error) {
                        showMessage("Ошибка", `Ошибка удаления группы: ${error.response?.data?.error || error.message}`, "error");
                    }
                });
            });

            console.log("Список групп загружен, кнопки 'Редактировать' и 'Удалить' должны быть видны"); // Отладочный лог
        }

        // Добавление обработчиков для кнопок "Добавить"
        const addEmployeeButton = document.getElementById("addEmployee");
        const addGroupButton = document.getElementById("addGroup");

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

        await loadEmployeeList();
        await loadGroupList();
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
                await loadEmployeeList();
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
                await loadGroupList();
                modal.remove();
            } catch (error) {
                showMessage("Ошибка", `Ошибка сохранения группы: ${error.response?.data?.error || error.message}`, "error");
            }
        });

        document.getElementById("cancelGroup").addEventListener("click", () => modal.remove());
    }

    // Экспорт в Excel
    async function exportSalariesToExcel() {
        try {
            const dateRange = document.getElementById("salaryFilterDateRange").value;
            const [dateFrom, dateTo] = dateRange ? dateRange.split(" to ") : [new Date().toISOString().split('T')[0], new Date().toISOString().split('T')[0]];
            const employees = await loadEmployees();
            const rates = await loadSalaryRates();
            const dates = getDateRange(dateFrom, dateTo);

            if (!employees || employees.length === 0) {
                showMessage("Ошибка", "Нет данных для экспорта", "error");
                return;
            }

            const data = [
                ["Имя", "Фамилия", "Группа", ...dates, "Итоговая зарплата"]
            ];

            const rateMap = rates.reduce((map, rate) => {
                map[rate.group] = { paymentType: rate.paymentType, hourly: rate.hourlyRate, daily: rate.dailyRate };
                return map;
            }, {});

            employees.forEach(employee => {
                let totalSalary = 0;
                const row = [
                    employee.firstName,
                    employee.lastName,
                    employee.group
                ];
                const rate = rateMap[employee.group] || { paymentType: "hourly", hourly: 0, daily: 0 };
                dates.forEach(date => {
                    const hoursData = employee.hours && employee.hours[date] || { hours: 0, worked: false };
                    let salary = 0;
                    let display = "";
                    if (rate.paymentType === "hourly" && hoursData.hours > 0) {
                        salary = hoursData.hours * rate.hourly;
                        display = `${hoursData.hours} ч`;
                    } else if (rate.paymentType === "daily" && hoursData.worked) {
                        salary = rate.daily;
                        display = "Работал";
                    }
                    totalSalary += salary;
                    row.push(display);
                });
                row.push(totalSalary);
                data.push(row);
            });

            const ws = XLSX.utils.aoa_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Salaries");
            XLSX.writeFile(wb, `salaries_${dateFrom}_${dateTo}.xlsx`);
            showMessage("Успех", "Зарплаты экспортированы в Excel", "success");
        } catch (error) {
            console.error("Ошибка экспорта зарплат:", error);
            showMessage("Ошибка", `Ошибка экспорта зарплат: ${error.response?.data?.error || error.message}`, "error");
        }
    }

    // Инициализация
    try {
        await window.common.getSid();
        if (window.common.getSidValue()) {
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
        console.log("Нажата кнопка 'Применить фильтры'");
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
});