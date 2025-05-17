// common.js

// Функция для задержки
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Функция для добавления одного дня к дате
function addOneDay(dateStr) {
    console.log(`addOneDay: входная дата=${dateStr}`);
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
        console.error(`Некорректная дата в addOneDay: ${dateStr}`);
        return dateStr; // Возвращаем исходную дату, чтобы избежать ошибки
    }
    date.setDate(date.getDate() + 1);
    const result = date.toISOString().split('T')[0]; // Формат YYYY-MM-DD
    console.log(`addOneDay: результат=${result}`);
    return result;
}

// Функция для добавления N дней к дате
function addDays(dateStr, days) {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
        console.error(`Некорректная дата в addDays: dateStr=${dateStr}, days=${days}`);
        return dateStr;
    }
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
}

// Функция для вычисления разницы в днях между двумя датами
function getDaysDifference(dateFrom, dateTo) {
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
        console.error(`Некорректные даты в getDaysDifference: dateFrom=${dateFrom}, dateTo=${dateTo}`);
        return 0;
    }
    const diffTime = Math.abs(to - from);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Функция для агрегации данных по всем точкам
function aggregateAllPoints(data) {
    const aggregated = {};
    let totalSum = 0;

    data.forEach(point => {
        point.items.forEach(item => {
            if (!aggregated[item.name]) {
                aggregated[item.name] = {
                    name: item.name,
                    quantity: 0,
                    total_sum: 0
                };
            }
            aggregated[item.name].quantity += item.quantity;
            aggregated[item.name].total_sum += item.total_sum;
        });
        totalSum += point.total_sum;
    });

    return {
        point_name: "Все точки",
        items: Object.values(aggregated),
        total_sum: totalSum
    };
}

// Функция для отображения модального окна
function showModal(title, message, type = 'error') {
    console.log(`showModal вызван: title=${title}, message=${message}, type=${type}`);

    // Удаляем существующее модальное окно, если оно есть
    const existingModal = document.querySelector('.modal');
    if (existingModal) {
        existingModal.remove();
    }

    // Определяем стили в зависимости от типа сообщения
    let bgColorClass, icon;
    switch (type) {
        case 'success':
            bgColorClass = 'bg-green-500';
            icon = '✔'; // Иконка успеха
            break;
        case 'warning':
            bgColorClass = 'bg-yellow-500';
            icon = '⚠'; // Иконка предупреждения
            break;
        case 'error':
        default:
            bgColorClass = 'bg-red-500';
            icon = '✖'; // Иконка ошибки
            break;
    }

    // Создаём модальное окно
    const modal = document.createElement('div');
    modal.className = 'modal fixed inset-0 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="fixed inset-0 bg-black opacity-50"></div>
        <div class="relative bg-white rounded-lg shadow-lg p-6 max-w-sm w-full">
            <div class="flex items-center mb-4">
                <span class="text-2xl mr-2">${icon}</span>
                <h2 class="text-xl font-semibold ${bgColorClass} text-white px-4 py-2 rounded">${title}</h2>
            </div>
            <p class="mb-4">${message}</p>
            <div class="flex justify-end">
                <button class="close-modal bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600">Закрыть</button>
            </div>
        </div>
    `;

    // Добавляем модальное окно в документ
    document.body.appendChild(modal);

    // Обработчик закрытия модального окна
    const closeModal = () => modal.remove();

    // Закрытие при клике на кнопку "Закрыть"
    modal.querySelector('.close-modal').addEventListener('click', closeModal);

    // Закрытие при клике вне модального окна
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
}

// Глобальные переменные
let sid = null;
let kktList = null;

// Инициализация Axios
const axiosInstance = axios.create({
    timeout: 120000, // Таймаут 120 секунд
    headers: {
        "Authorization": `Bearer ${window.config.API_TOKEN}`
    }
});

// Функция для повторных попыток
async function axiosWithRetry(requestFunc, retries = 3, delayMs = 2000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await requestFunc();
        } catch (error) {
            if (i === retries - 1) throw error; // Последняя попытка
            console.log(`Попытка ${i + 1} не удалась, повтор через ${delayMs} мс:`, error.message);
            await delay(delayMs);
        }
    }
}

// Получение SID
async function getSid() {
    try {
        console.log("Запрашиваем SID...");
        console.log("Адрес API:", "http://localhost:5000/api/auth");
        console.log("Заголовки:", { "Authorization": `Bearer ${window.config.API_TOKEN}` });
        const response = await axiosWithRetry(() => axiosInstance.get("http://localhost:5000/api/auth"));
        sid = response.data.sid;
        console.log("SID получен:", sid);
        return sid;
    } catch (error) {
        console.error("Ошибка при получении SID:", {
            message: error.message,
            code: error.code,
            response: error.response ? { status: error.response.status, data: error.response.data } : null
        });
        throw error;
    }
}

// Загрузка списка KKT
async function loadKktList() {
    const cachedKktList = localStorage.getItem("kktList");
    if (cachedKktList) {
        kktList = JSON.parse(cachedKktList);
        console.log("Список KKT загружен из кэша:", kktList);
        return kktList;
    }

    try {
        console.log("Запрашиваем список KKT...");
        const response = await axiosWithRetry(() => axiosInstance.get("http://localhost:5000/api/kkts", {
            headers: { "X-SBISSessionID": sid }
        }));
        kktList = response.data.kkts;
        localStorage.setItem("kktList", JSON.stringify(kktList));
        console.log("Список KKT загружен:", kktList);
        return kktList;
    } catch (error) {
        console.error("Ошибка при загрузке списка KKT:", {
            message: error.message,
            code: error.code,
            response: error.response ? { status: error.response.status, data: error.response.data } : null
        });
        throw error;
    }
}

// Экспорт функций для использования в других файлах
window.common = {
    delay,
    addOneDay,
    addDays,
    getDaysDifference,
    aggregateAllPoints,
    showModal, // Добавляем функцию showModal
    axiosInstance,
    axiosWithRetry,
    getSid,
    loadKktList,
    getSidValue: () => sid,
    getKktList: () => kktList
};