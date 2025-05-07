# auth.py
import requests
import logging
from sbis_project import sbis_config as config
from sbis_project.auth_cache import save_sid, load_sid, clear_sid
from logging.handlers import TimedRotatingFileHandler
import os

# Настройка логирования
log_dir = "logs"
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, "auth.log")

handler = TimedRotatingFileHandler(
    log_file,
    when="midnight",
    interval=1,
    backupCount=30
)
handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger = logging.getLogger('sbis_app')
logger.setLevel(logging.INFO)
logger.addHandler(handler)

def get_sid_and_token():
    """
    Функция авторизуется в API СБИС, отправляя логин, пароль и client_id.
    Проверяет кэш, если SID валиден, возвращает его. Иначе запрашивает новый.
    Возвращает кортеж (sid, token) или (None, None) при ошибке.
    """
    # Проверяем кэш
    sid, token = load_sid()
    if sid and token:
        logger.info("Используется SID из кэша")
        return sid, token

    # Если кэша нет или SID устарел, запрашиваем новый
    auth_payload = {
        "app_client_id": config.APP_CLIENT_ID,
        "login": config.LOGIN,
        "password": config.PASSWORD
    }
    auth_headers = {"Content-Type": "application/json"}

    try:
        response = requests.post(config.AUTH_URL, headers=auth_headers, json=auth_payload, timeout=10)
        response.raise_for_status()
        auth_data = response.json()

        sid = auth_data.get("sid")
        token = auth_data.get("token")

        if sid and token:
            logger.info(f"Авторизация успешна! SID: {sid[:5]}... (скрыт), Token: {token[:5]}... (скрыт)")
            save_sid(sid, token)
            return sid, token
        else:
            logger.error("Ошибка: SID или Token отсутствуют в ответе API")
            return None, None

    except requests.exceptions.Timeout:
        logger.error("Таймаут при запросе к API СБИС")
        return None, None
    except requests.exceptions.HTTPError as e:
        logger.error(f"HTTP ошибка при запросе к API СБИС: {e.response.status_code} - {e.response.text}")
        return None, None
    except requests.exceptions.RequestException as e:
        logger.error(f"Ошибка запроса к API СБИС: {str(e)}", exc_info=True)
        return None, None

if __name__ == "__main__":
    sid, token = get_sid_and_token()
    print(f"Тестовый запуск: SID={sid}, Token={token}")