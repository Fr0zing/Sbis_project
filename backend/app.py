from flask import Flask, jsonify, request
from flask_cors import CORS
import logging
import os
from datetime import datetime, timedelta
import numpy as np
from sklearn.linear_model import LinearRegression
from sbis_project.sbis_app import SBISApp
import json
from logging.handlers import TimedRotatingFileHandler

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
API_TOKEN = os.getenv("API_TOKEN", "your-secret-token-12345")

# Путь к файлам для хранения данных
WRITE_OFFS_FILE = "writeoffs.json"

# Проверка токена
def check_auth_token():
    token = request.headers.get('Authorization')
    if not token or token != f"Bearer {API_TOKEN}":
        return False
    return True

# Заглушка для остатков на складе
stock_data = {
    "Пекарня на Победы": {
        "Пирожок с мясом": 200,
        "Пицца пепперони": 50,
        "Пирожок с капустой (печеный)": 150,
        "треугольник с курицей": 100,
        "сосиска в тесте": 80
    },
    "Пекарня на Бакинская": {
        "Пирожок с мясом": 150,
        "Пицца пепперони": 30,
        "Пирожок с капустой (печеный)": 120,
        "треугольник с курицей": 90,
        "сосиска в тесте": 70
    },
    "Пекарня на Ташкентская": {
        "Пирожок с мясом": 180,
        "Пицца пепперони": 40,
        "Пирожок с капустой (печеный)": 130,
        "треугольник с курицей": 110,
        "сосиска в тесте": 60
    }
}

# Инициализация SBISApp
sbis_app = SBISApp(
    client_id=os.getenv("SBIS_APP_CLIENT_ID", "1025293145607151"),
    login=os.getenv("SBIS_LOGIN", "privet2023"),
    password=os.getenv("SBIS_PASSWORD", "privet2023"),
    inn=os.getenv("SBIS_INN", "301806206800")
)

@app.route('/api/auth', methods=['GET'])
def auth():
    if not check_auth_token():
        return jsonify({"error": "Неавторизованный доступ"}), 401

    try:
        sid = sbis_app.auth()
        logger.info("Успешная авторизация через /api/auth")
        return jsonify({"sid": sid})
    except Exception as e:
        logger.error(f"Ошибка авторизации: {str(e)}")
        return jsonify({"error": f"Ошибка авторизации: {str(e)}"}), 500

@app.route('/api/kkts', methods=['GET'])
def get_kkts():
    if not check_auth_token():
        return jsonify({"error": "Неавторизованный доступ"}), 401

    sid = request.headers.get('X-SBISSessionID')
    if not sid:
        return jsonify({"error": "X-SBISSessionID header is required"}), 400
    try:
        kkts = sbis_app.get_kkts(sid)
        logger.info(f"Успешно получено {len(kkts)} KKT")
        return jsonify({"kkts": kkts})
    except Exception as e:
        logger.error(f"Ошибка получения списка KKT: {str(e)}")
        return jsonify({"error": f"Ошибка получения списка KKT: {str(e)}"}), 500

@app.route('/api/receipts', methods=['GET'])
def get_receipts():
    if not check_auth_token():
        return jsonify({"error": "Неавторизованный доступ"}), 401

    sid = request.headers.get('X-SBISSessionID')
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    point_name = request.args.get('point_name')
    
    if not sid or not date_from or not date_to:
        return jsonify({"error": "X-SBISSessionID, date_from, and date_to are required"}), 400
    
    try:
        receipts = sbis_app.get_receipts(sid, date_from, date_to, point_name)
        logger.info(f"Всего обработано чеков: {len(receipts)}, агрегировано точек: {len(set(r['point_name'] for r in receipts))}")
        return jsonify({"data": receipts})
    except Exception as e:
        logger.error(f"Ошибка получения чеков: {str(e)}")
        return jsonify({"error": f"Ошибка получения чеков: {str(e)}"}), 500

@app.route('/api/production_plan', methods=['GET'])
def get_production_plan():
    if not check_auth_token():
        return jsonify({"error": "Неавторизованный доступ"}), 401

    sid = request.headers.get('X-SBISSessionID')
    point_name = request.args.get('point_name')
    planning_date = request.args.get('planning_date')

    if not sid or not planning_date:
        return jsonify({"error": "X-SBISSessionID and planning_date are required"}), 400

    # Автоматически определяем период анализа (последние 30 дней)
    try:
        end_date = datetime.strptime(planning_date, '%Y-%m-%d')
        start_date = end_date - timedelta(days=30)  # Период анализа: 30 дней
        date_from = start_date.strftime('%Y-%m-%d')
        date_to = (end_date + timedelta(days=1)).strftime('%Y-%m-%d')
    except ValueError as e:
        logger.error(f"Ошибка парсинга даты планирования: {str(e)}")
        return jsonify({"error": "Некорректный формат даты планирования. Используйте формат YYYY-MM-DD"}), 400

    logger.info(f"Запрашиваем данные для плана производства с {date_from} по {date_to}")

    # Запрашиваем данные о продажах
    try:
        receipts = sbis_app.get_receipts(sid, date_from, date_to, point_name)
        logger.info(f"Получено чеков: {len(receipts)}")
    except Exception as e:
        logger.error(f"Ошибка получения данных о продажах: {str(e)}")
        return jsonify({"error": f"Ошибка получения данных о продажах: {str(e)}"}), 500

    if not receipts:
        logger.info("Чеки отсутствуют, возвращаем пустой план производства")
        return jsonify({"data": []}), 200

    # Собираем данные о продажах по дням недели
    sales_by_day_of_week = {}
    try:
        for point in receipts:
            logger.info(f"Обрабатываем точку: {point['point_name']}, элементов: {len(point['items'])}")
            for item in point['items']:
                try:
                    date = datetime.strptime(item['receiveDateTime'].split('T')[0], '%Y-%m-%d')
                    day_of_week = date.weekday()  # 0 - понедельник, 1 - вторник, ..., 6 - воскресенье
                    key = f"{day_of_week}_{item['name']}_{point['point_name']}"

                    if key not in sales_by_day_of_week:
                        sales_by_day_of_week[key] = {
                            'day_of_week': day_of_week,
                            'name': item['name'],
                            'point_name': point['point_name'],
                            'sales': []  # Массив для хранения продаж по неделям
                        }

                    # Определяем номер недели (относительно первой даты в данных)
                    first_date = start_date
                    diff_days = (date - first_date).days
                    week_number = diff_days // 7

                    # Добавляем продажи в массив
                    if len(sales_by_day_of_week[key]['sales']) <= week_number:
                        sales_by_day_of_week[key]['sales'].extend([0] * (week_number + 1 - len(sales_by_day_of_week[key]['sales'])))
                    sales_by_day_of_week[key]['sales'][week_number] += item['quantity']
                except KeyError as ke:
                    logger.error(f"Ошибка обработки элемента чека: отсутствует ключ {ke}")
                    continue
                except ValueError as ve:
                    logger.error(f"Ошибка парсинга даты в чеке: {str(ve)}")
                    continue
    except Exception as e:
        logger.error(f"Ошибка обработки чеков: {str(e)}")
        return jsonify({"error": f"Ошибка обработки чеков: {str(e)}"}), 500

    # Прогнозируем спрос с помощью линейной регрессии
    forecast_by_day_of_week = {}
    try:
        for key, item in sales_by_day_of_week.items():
            sales = item['sales']
            logger.info(f"Прогнозируем спрос для {key}, данные продаж: {sales}")

            # Заполняем пропущенные недели нулями
            max_week = len(sales) - 1
            sales_data = [[i, qty] for i, qty in enumerate(sales)]

            # Если данных меньше 2 точек, используем среднее
            if len(sales_data) < 2:
                total_sales = sum(qty for _, qty in sales_data)
                avg_demand = round(total_sales / len(sales_data)) if sales_data else 0
                forecast_by_day_of_week[key] = {
                    'day_of_week': item['day_of_week'],
                    'name': item['name'],
                    'point_name': item['point_name'],
                    'forecast_demand': avg_demand
                }
                continue

            # Применяем линейную регрессию
            X = np.array([x[0] for x in sales_data]).reshape(-1, 1)
            y = np.array([x[1] for x in sales_data])
            model = LinearRegression()
            model.fit(X, y)
            next_week = max_week + 1
            forecast_demand = max(0, round(model.predict([[next_week]])[0]))

            forecast_by_day_of_week[key] = {
                'day_of_week': item['day_of_week'],
                'name': item['name'],
                'point_name': item['point_name'],
                'forecast_demand': forecast_demand
            }
    except Exception as e:
        logger.error(f"Ошибка прогнозирования спроса: {str(e)}")
        return jsonify({"error": f"Ошибка прогнозирования спроса: {str(e)}"}), 500

    # Определяем день недели для планируемого дня
    planning_day = end_date.weekday()

    # Формируем план производства
    production_plan = {}
    try:
        for key, item in forecast_by_day_of_week.items():
            if item['day_of_week'] == planning_day and (not point_name or item['point_name'] == point_name):
                # Получаем остатки на складе для точки
                stock = stock_data.get(item['point_name'], {}).get(item['name'], 0)

                # Количество к производству
                to_produce = max(0, item['forecast_demand'] - stock)

                point = item['point_name']
                if point not in production_plan:
                    production_plan[point] = []
                production_plan[point].append({
                    'name': item['name'],
                    'demand': item['forecast_demand'],
                    'stock': stock,
                    'to_produce': to_produce
                })

        # Если выбраны "Все точки", агрегируем данные
        if not point_name:
            aggregated_plan = {}
            for point, items in production_plan.items():
                for item in items:
                    key = item['name']
                    if key not in aggregated_plan:
                        aggregated_plan[key] = {
                            'name': item['name'],
                            'demand': 0,
                            'stock': 0,
                            'to_produce': 0
                        }
                    aggregated_plan[key]['demand'] += item['demand']
                    aggregated_plan[key]['stock'] += item['stock']
                    aggregated_plan[key]['to_produce'] += item['to_produce']
            production_plan['Все точки'] = list(aggregated_plan.values())

        # Формируем ответ
        result = []
        for point_name, items in production_plan.items():
            total_to_produce = sum(item['to_produce'] for item in items)
            result.append({
                'point_name': point_name,
                'items': items,
                'total_to_produce': total_to_produce
            })

        logger.info(f"План производства сформирован для {len(result)} точек")
        return jsonify({"data": result})
    except Exception as e:
        logger.error(f"Ошибка формирования плана производства: {str(e)}")
        return jsonify({"error": f"Ошибка формирования плана производства: {str(e)}"}), 500

@app.route('/api/writeoffs', methods=['GET'])
def get_writeoffs():
    if not check_auth_token():
        return jsonify({"error": "Неавторизованный доступ"}), 401

    try:
        # Читаем списания из файла
        if os.path.exists(WRITE_OFFS_FILE):
            with open(WRITE_OFFS_FILE, 'r', encoding='utf-8') as f:
                writeoffs = json.load(f)
        else:
            writeoffs = []
        return jsonify({"writeoffs": writeoffs})
    except Exception as e:
        logger.error(f"Ошибка получения списаний: {str(e)}")
        return jsonify({"error": f"Ошибка получения списаний: {str(e)}"}), 500

@app.route('/api/writeoffs', methods=['POST'])
def add_writeoff():
    if not check_auth_token():
        return jsonify({"error": "Неавторизованный доступ"}), 401

    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Данные не переданы"}), 400

        # Валидация данных
        required_fields = ["date", "point", "product", "quantity", "reason"]
        for field in required_fields:
            if field not in data or not data[field]:
                return jsonify({"error": f"Поле {field} обязательно"}), 400

        # Валидация формата даты
        try:
            datetime.strptime(data["date"], "%Y-%m-%d")
        except ValueError:
            return jsonify({"error": "Некорректный формат даты. Используйте формат YYYY-MM-DD (например, 2025-05-08)"}), 400

        quantity = int(data["quantity"])
        if quantity <= 0:
            return jsonify({"error": "Количество должно быть больше 0"}), 400

        # Читаем текущие списания
        if os.path.exists(WRITE_OFFS_FILE):
            with open(WRITE_OFFS_FILE, 'r', encoding='utf-8') as f:
                writeoffs = json.load(f)
        else:
            writeoffs = []

        # Создаём новое списание с уникальным id
        writeoff = {
            "id": len(writeoffs) + 1,  # Автоинкрементный id
            "date": data["date"],
            "point": data["point"],
            "product": data["product"],
            "quantity": quantity,
            "reason": data["reason"]
        }

        # Добавляем новое списание
        writeoffs.append(writeoff)

        # Сохраняем в файл
        with open(WRITE_OFFS_FILE, 'w', encoding='utf-8') as f:
            json.dump(writeoffs, f, ensure_ascii=False)

        logger.info("Списание успешно добавлено")
        return jsonify({"message": "Списание успешно добавлено", "writeoff": writeoff}), 201
    except Exception as e:
        logger.error(f"Ошибка добавления списания: {str(e)}")
        return jsonify({"error": f"Ошибка добавления списания: {str(e)}"}), 500

# Вывод зарегистрированных маршрутов
logger.info("Зарегистрированные маршруты:")
for rule in app.url_map.iter_rules():
    logger.info(rule)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)