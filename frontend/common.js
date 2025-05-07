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
    axiosInstance,
    axiosWithRetry,
    getSid,
    loadKktList,
    getSidValue: () => sid,
    getKktList: () => kktList
};