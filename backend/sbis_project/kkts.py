# kkts.py
import requests
import logging
from . import sbis_config as config
from logging.handlers import TimedRotatingFileHandler
import os

# Настройка логирования
log_dir = "logs"
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, "kkts.log")

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

def get_point_name(address):
    """
    Извлекает название точки продаж из адреса.
    Пример: "г. Астрахань, ул. Победы, стр. 53" → "Пекарня на Победе"
    """
    try:
        if "ул." in address:
            street_part = address.split("ул.")[1].split(",")[0].strip()
            return f"Пекарня на {street_part}"
        else:
            return address
    except Exception as e:
        logger.error(f"Ошибка при извлечении названия точки из адреса {address}: {str(e)}")
        return "Неизвестная точка"

def get_kkts_list(sid):
    """
    Получает список кассовых аппаратов (ККТ) по заданному ИНН.
    Возвращает только нужные поля: regId, fsNumber, pointName, address, kktSalesPoint, status.
    """
    org_url = f"https://api.sbis.ru/ofd/v1/orgs/{config.INN}/kkts?status=2"
    headers = {
        "Content-Type": "application/json",
        "X-SBISSessionID": sid
    }
    try:
        response = requests.get(org_url, headers=headers, timeout=10)
        response.raise_for_status()
        data = response.json()
        filtered_data = []
        for kkt in data:
            filtered_kkt = {
                "regId": kkt.get("regId"),
                "fsNumber": kkt.get("fsNumber"),
                "pointName": get_point_name(kkt.get("address", "Неизвестная точка")),
                "address": kkt.get("address"),
                "kktSalesPoint": kkt.get("kktSalesPoint"),
                "status": kkt.get("status")
            }
            filtered_data.append(filtered_kkt)
        logger.info(f"Получено {len(filtered_data)} кассовых аппаратов")
        return filtered_data
    except requests.exceptions.Timeout:
        logger.error("Таймаут при запросе списка KKT")
        return []
    except requests.exceptions.HTTPError as e:
        logger.error(f"HTTP ошибка при получении списка KKT: {e.response.status_code} - {e.response.text}")
        if e.response.status_code in [401, 403, 404, 500]:
            raise  # Поднимаем исключение для обновления SID
        return []
    except requests.exceptions.RequestException as e:
        logger.error(f"Ошибка при получении данных о KKT: {str(e)}", exc_info=True)
        return []

def get_cash_report(sid, reg_id, storage_id, date_from, date_to):
    """
    Получает отчеты о продажах для KKT за указанный период.
    """
    url = f"https://api.sbis.ru/ofd/v1/orgs/{config.INN}/kkts/{reg_id}/storages/{storage_id}/docs"
    headers = {
        "Content-Type": "application/json",
        "X-SBISSessionID": sid
    }
    params = {
        "dateFrom": date_from,
        "dateTo": date_to,
        "limit": 200
    }
    try:
        response = requests.get(url, headers=headers, params=params, timeout=10)
        logger.info(f"Запрос отчета для ККТ {reg_id} (ФН: {storage_id}) с {date_from} по {date_to}")
        response.raise_for_status()
        data = response.json()
        if data:
            logger.info(f"Данные получены! Количество записей: {len(data)}")
            return data
        else:
            logger.warning(f"Нет данных по ККТ {reg_id} за указанный период")
            return None
    except requests.exceptions.Timeout:
        logger.error(f"Таймаут при запросе отчета для ККТ {reg_id}")
        return None
    except requests.exceptions.HTTPError as e:
        logger.error(f"HTTP ошибка при получении отчета для ККТ {reg_id}: {e.response.status_code} - {e.response.text}")
        if e.response.status_code in [401, 403, 404, 500]:
            raise  # Поднимаем исключение для обновления SID
        return None
    except requests.exceptions.RequestException as e:
        logger.error(f"Ошибка при получении отчета для ККТ {reg_id}: {str(e)}", exc_info=True)
        return None

def process_receipt(receipt_data):
    """
    Обрабатывает данные чека или смены, извлекая информацию о продажах.
    """
    logger.debug(f"Обработка записи: {receipt_data}")

    # Проверяем тип операции (продажа, возврат и т.д.)
    operation_type = receipt_data.get("operationType", "unknown")
    if operation_type == "return":
        logger.info("Пропускаем возврат")
        return None

    if "receipt" in receipt_data:
        receipt = receipt_data["receipt"]
        # Проверяем, что это чек продажи (operationType = 1 в SBIS API обычно означает продажу)
        if receipt.get("operationType", 1) != 1:
            logger.info(f"Пропускаем чек с operationType={receipt.get('operationType')}")
            return None

        if receipt.get("totalSum", 0) > 0:
            items = receipt.get("items", [])
            if not items:
                logger.warning(f"Чек без товаров: {receipt}")
                return None
            processed_items = [
                {
                    "name": item.get("name", "Неизвестный товар"),
                    "quantity": item.get("quantity", 0),
                    "price": item.get("price", 0),
                    "sum": item.get("sum", 0)
                }
                for item in items
            ]
            return {
                "retailPlace": receipt.get("retailPlace", "Неизвестная точка"),
                "items": processed_items,
                "totalSum": receipt.get("totalSum", 0),
                "receiveDateTime": receipt.get("receiveDateTime", "Неизвестная дата")
            }
    elif "openShift" in receipt_data or "closeShift" in receipt_data:
        shift_data = receipt_data.get("openShift") or receipt_data.get("closeShift")
        total_sum = shift_data.get("fiscalDriveSumReports", {}).get("sellOper", {}).get("totalSum", 0)
        if total_sum > 0:
            return {
                "retailPlace": "Смена",
                "items": [],
                "totalSum": total_sum,
                "receiveDateTime": shift_data.get("receiveDateTime", "Неизвестная дата")
            }
    return None