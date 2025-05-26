import os
import logging
from flask import Flask
from flask_cors import CORS
from sbis_project.sbis_app import SBISApp
from logging.handlers import TimedRotatingFileHandler
from utils.file_utils import init_employees_file, init_salary_rates_file, init_products_file, init_stocks_file
from routes.auth import setup_routes as setup_auth_routes
from routes.receipts import setup_routes as setup_receipts_routes
from routes.production import setup_routes as setup_production_routes
from routes.stocks import setup_routes as setup_stocks_routes
from routes.employees import setup_routes as setup_employees_routes

# Настройка логирования
log_dir = "logs"
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, "app.log")

handler = TimedRotatingFileHandler(
    log_file,
    when="midnight",
    interval=1,
    backupCount=30
)
handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
logger.addHandler(handler)

app = Flask(__name__)

# Настройка CORS
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Токен для авторизации
API_TOKEN = os.getenv("API_TOKEN")  # Загружаем из .env

if not API_TOKEN:
    raise ValueError("API_TOKEN не установлен в переменных окружения")

# Сохраняем API_TOKEN в конфигурации приложения
app.config['API_TOKEN'] = API_TOKEN

# Инициализация файлов
init_products_file()
init_stocks_file()
init_employees_file()
init_salary_rates_file()

# Инициализация SBISApp
sbis_app = SBISApp(
    client_id=os.getenv("SBIS_APP_CLIENT_ID", "1025293145607151"),
    login=os.getenv("SBIS_LOGIN", "privet2023"),
    password=os.getenv("SBIS_PASSWORD", "privet2023"),
    inn=os.getenv("SBIS_INN", "301806206800")
)

# Подключаем маршруты
setup_auth_routes(app, sbis_app)
setup_receipts_routes(app, sbis_app)
setup_production_routes(app, sbis_app)
setup_stocks_routes(app)
setup_employees_routes(app)

# Вывод зарегистрированных маршрутов
logger.info("Зарегистрированные маршруты:")
for rule in app.url_map.iter_rules():
    logger.info(rule)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)