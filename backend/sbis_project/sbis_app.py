# sbis_project/sbis_app.py

import logging
import json
import os
from datetime import datetime, timedelta
from .auth import get_sid_and_token
from .kkts import get_kkts_list, get_cash_report, process_receipt
from logging.handlers import TimedRotatingFileHandler

# Настройка логирования
log_dir = "logs"
os.makedirs(log_dir, exist_ok=True)  # Создаём папку logs/, если её нет
log_file = os.path.join(log_dir, "sbis_app.log")

# Создаём TimedRotatingFileHandler для ротации логов
handler = TimedRotatingFileHandler(
    log_file,
    when="midnight",  # Ротация каждый день в полночь
    interval=1,       # Интервал ротации (1 день)
    backupCount=30    # Храним логи за последние 30 дней
)
handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger = logging.getLogger('sbis_app')
logger.setLevel(logging.INFO)
logger.addHandler(handler)

# Тестовые данные для заглушки
TEST_KKTS = [
    {"regId": "0008869499037417", "fsNumber": "7380440801926422", "pointName": "Пекарня на Победы"},
    {"regId": "0007498924001212", "fsNumber": "7380440801165774", "pointName": "Пекарня на Бакинская"},
    {"regId": "0008260147049848", "fsNumber": "7380440700545271", "pointName": "Пекарня на Ташкентская"}
]

TEST_RECEIPTS = [
    {
        "point_name": "Пекарня на Победы",
        "items": [
            {"name": "Пирожок с мясом", "quantity": 50, "total_sum": 2500, "receiveDateTime": "2025-03-01T10:00:00"},
            {"name": "Пицца пепперони", "quantity": 30, "total_sum": 3000, "receiveDateTime": "2025-03-01T10:00:00"}
        ],
        "total_sum": 5500
    },
    {
        "point_name": "Пекарня на Бакинская",
        "items": [
            {"name": "Пирожок с мясом", "quantity": 40, "total_sum": 2000, "receiveDateTime": "2025-03-01T10:00:00"},
            {"name": "треугольник с курицей", "quantity": 20, "total_sum": 1500, "receiveDateTime": "2025-03-01T10:00:00"}
        ],
        "total_sum": 3500
    },
    {
        "point_name": "Пекарня на Ташкентская",
        "items": [
            {"name": "Пирожок с капустой (печеный)", "quantity": 60, "total_sum": 1800, "receiveDateTime": "2025-03-01T10:00:00"},
            {"name": "сосиска в тесте", "quantity": 25, "total_sum": 1250, "receiveDateTime": "2025-03-01T10:00:00"}
        ],
        "total_sum": 3050
    }
]

class SBISApp:
    def __init__(self, client_id, login, password, inn):
        self.client_id = client_id
        self.login = login
        self.password = password
        self.inn = inn
        self.sid = None
        self.token = None
        self.cache_dir = os.path.join("cache", "receipts")  # Папка для хранения кэша
        os.makedirs(self.cache_dir, exist_ok=True)  # Создаём папку, если её нет

    def _load_cached_day(self, date_str):
        """Загружает данные за конкретный день из кэша."""
        cache_file = os.path.join(self.cache_dir, f"{date_str}.json")
        try:
            if os.path.exists(cache_file):
                with open(cache_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            return None
        except Exception as e:
            logger.error(f"Ошибка загрузки кэша для {date_str}: {str(e)}")
            return None

    def _save_cached_day(self, date_str, data):
        """Сохраняет данные за конкретный день в кэш."""
        cache_file = os.path.join(self.cache_dir, f"{date_str}.json")
        try:
            with open(cache_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False)
            logger.info(f"Данные сохранены в кэш для даты {date_str}")
        except Exception as e:
            logger.error(f"Ошибка сохранения кэша для {date_str}: {str(e)}")

    def _clean_cache(self, max_age_days=90):
        """Удаляет устаревшие файлы из кэша (старше max_age_days)."""
        current_date = datetime.now()
        for filename in os.listdir(self.cache_dir):
            if filename.endswith(".json"):
                try:
                    date_str = filename.replace(".json", "")
                    file_date = datetime.strptime(date_str, '%Y-%m-%d')
                    age = (current_date - file_date).days
                    if age > max_age_days:
                        file_path = os.path.join(self.cache_dir, filename)
                        os.remove(file_path)
                        logger.info(f"Удалён устаревший кэш-файл: {filename}")
                except Exception as e:
                    logger.error(f"Ошибка при очистке кэша для файла {filename}: {str(e)}")

    def auth(self):
        """Авторизация в SBIS API и получение SID."""
        try:
            self.sid, self.token = get_sid_and_token()
            if self.sid and self.token:
                return self.sid
            else:
                raise Exception("Не удалось авторизоваться в SBIS API")
        except Exception as e:
            logger.error(f"Ошибка авторизации: {e}, используем тестовый SID")
            self.sid = "test-sid-123"
            self.token = "test-token-123"
            return self.sid

    def get_kkts(self, sid):
        """Получение списка кассовых аппаратов (KKT)."""
        try:
            kkts = get_kkts_list(sid)
            if kkts:
                return kkts
            else:
                logger.warning("Список KKT пуст, используем тестовые данные")
                return TEST_KKTS
        except Exception as e:
            logger.error(f"Ошибка получения KKT: {e}, используем тестовые данные")
            return TEST_KKTS

    def get_receipts(self, sid, date_from, date_to, point_name=None):
        """Получение чеков за указанный период с разбивкой на периоды по 1 дню."""
        try:
            # Получаем список KKT
            kkts = self.get_kkts(sid)
            if not kkts:
                logger.warning("Список KKT пуст")
                return []

            # Преобразуем даты в объекты datetime
            start = datetime.strptime(date_from, '%Y-%m-%d')
            end = datetime.strptime(date_to, '%Y-%m-%d')

            # Разбиваем период на отрезки по 1 дню
            all_receipts = []
            current_start = start
            while current_start < end:
                current_end = min(current_start + timedelta(days=1), end)
                period_date_from = current_start.strftime('%Y-%m-%d')
                period_date_to = current_end.strftime('%Y-%m-%d')

                # Проверяем кэш для текущего дня
                cached_data = self._load_cached_day(period_date_from)
                if cached_data:
                    logger.info(f"Данные найдены в кэше для {period_date_from}")
                    # Фильтруем данные, если запрошена конкретная точка
                    if point_name:
                        cached_data = [r for r in cached_data if r["point_name"] == point_name]
                    all_receipts.extend(cached_data)
                    current_start = current_end
                    continue

                logger.info(f"Запрашиваем данные за период: {period_date_from} - {period_date_to}")

                # Собираем данные по всем KKT за текущий день
                daily_receipts = []
                for kkt in kkts:
                    reg_id = kkt.get("regId")
                    fs_number = kkt.get("fsNumber")
                    kkt_point_name = kkt.get("pointName")

                    if point_name and kkt_point_name != point_name:
                        continue  # Пропускаем KKT, если точка не совпадает

                    # Запрашиваем отчёт для KKT
                    try:
                        report = get_cash_report(sid, reg_id, fs_number, period_date_from, period_date_to)
                        if not report:
                            logger.info(f"Нет данных для ККТ {reg_id} за период {period_date_from} - {period_date_to}")
                            continue

                        # Обрабатываем чеки
                        for receipt_data in report:
                            processed = process_receipt(receipt_data)
                            if processed:
                                processed["point_name"] = kkt_point_name
                                daily_receipts.append(processed)
                    except Exception as e:
                        logger.error(f"Ошибка получения данных для ККТ {reg_id}: {str(e)}")
                        # Если ошибка, добавляем тестовые данные за этот день
                        test_data = [r for r in TEST_RECEIPTS if r["point_name"] == kkt_point_name]
                        daily_receipts.extend(test_data)

                # Сохраняем данные за день в кэш
                self._save_cached_day(period_date_from, daily_receipts)
                all_receipts.extend(daily_receipts)
                current_start = current_end

        except Exception as e:
            logger.error(f"Ошибка получения чеков: {e}, используем тестовые данные")
            # Фильтруем тестовые данные по точке продаж, если указана
            if point_name:
                return [r for r in TEST_RECEIPTS if r["point_name"] == point_name]
            return TEST_RECEIPTS

        # Агрегируем данные
        aggregated = {}
        for receipt in all_receipts:
            point = receipt.get("point_name", "Неизвестная точка")
            items = receipt.get("items", [])
            total_sum = receipt.get("totalSum", 0)

            if point not in aggregated:
                aggregated[point] = {
                    "point_name": point,
                    "items": [],
                    "total_sum": 0
                }

            for item in items:
                aggregated[point]["items"].append({
                    "name": item.get("name", "Неизвестный товар"),
                    "quantity": item.get("quantity", 0),
                    "total_sum": item.get("sum", 0),
                    "receiveDateTime": receipt.get("receiveDateTime", "")
                })
            aggregated[point]["total_sum"] += total_sum

        result = list(aggregated.values())
        logger.info(f"Получено {len(result)} записей для ККТ")

        # Очищаем устаревшие данные из кэша
        self._clean_cache(max_age_days=90)

        return result