# auth_cache.py
import os
import json
from datetime import datetime, timedelta
import logging
from logging.handlers import TimedRotatingFileHandler

# Настройка логирования
log_dir = "logs"
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, "auth_cache.log")

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

CACHE_FILE = os.path.join("data", "sid_cache.json")

def save_sid(sid, token):
    """Сохраняет SID и токен в файл с временной меткой."""
    data = {
        "sid": sid,
        "token": token,
        "timestamp": datetime.now().isoformat()
    }
    with open(CACHE_FILE, "w", encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    logger.info("SID сохранен в кэш")

def load_sid():
    """Загружает SID и токен из файла, проверяет срок действия (6 дней)."""
    if not os.path.exists(CACHE_FILE):
        return None, None

    with open(CACHE_FILE, "r", encoding='utf-8') as f:
        data = json.load(f)

    timestamp = datetime.fromisoformat(data["timestamp"])
    if datetime.now() - timestamp > timedelta(days=6):
        logger.info("SID устарел, требуется обновление")
        return None, None

    return data["sid"], data["token"]

def clear_sid():
    """Очищает кэш SID."""
    if os.path.exists(CACHE_FILE):
        os.remove(CACHE_FILE)
        logger.info("Кэш SID очищен")