async function loadConfig() {
    try {
        const response = await axios.get("http://localhost:5000/api/config");
        window.API_TOKEN = response.data.apiToken;
    } catch (error) {
        console.error("Ошибка загрузки конфигурации:", error);
        window.API_TOKEN = null;
    }
}

loadConfig();