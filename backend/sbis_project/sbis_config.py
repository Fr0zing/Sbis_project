import os
from dotenv import load_dotenv
import logging
from logging.handlers import TimedRotatingFileHandler

# Настройка логирования
log_dir = "logs"
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, "sbis_config.log")

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

# Загружаем переменные из .env-файла
load_dotenv()

# Конфигурационные данные для API СБИС
AUTH_URL = "https://api.sbis.ru/oauth/service/"
APP_CLIENT_ID = os.getenv("SBIS_APP_CLIENT_ID")
LOGIN = os.getenv("SBIS_LOGIN")
PASSWORD = os.getenv("SBIS_PASSWORD")
INN = os.getenv("SBIS_INN")

# Отладка: проверяем, что переменные загружены
logger.info(f"SBIS_APP_CLIENT_ID: {APP_CLIENT_ID}")
logger.info(f"SBIS_LOGIN: {LOGIN}")
logger.info(f"SBIS_PASSWORD: {PASSWORD}")
logger.info(f"SBIS_INN: {INN}")

# Проверяем, что все переменные загружены
if not all([APP_CLIENT_ID, LOGIN, PASSWORD, INN]):
    logger.error("Одна или несколько переменных окружения не загружены! Проверьте файл .env")