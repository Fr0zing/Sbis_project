import os
import logging
import requests
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime, timedelta
import numpy as np
from sklearn.linear_model import LinearRegression
from sbis_project.sbis_app import SBISApp
from logging.handlers import TimedRotatingFileHandler
from filelock import FileLock

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

# Путь к файлам для хранения данных
WRITE_OFFS_FILE = "writeoffs.json"
STOCKS_FILE = "stocks.json"
PRODUCTS_FILE = "products.json"
EMPLOYEES_FILE = "employees.json"
SALARY_RATES_FILE = "salary_rates.json"

# Проверка токена
def check_auth_token():
    token = request.headers.get('Authorization')
    if not token or token != f"Bearer {API_TOKEN}":
        return False
    return True

# Инициализация файла employees.json
def init_employees_file():
    if not os.path.exists(EMPLOYEES_FILE):
        default_employees = [
            {"id": 1, "firstName": "Иван", "lastName": "Иванов", "group": "Повар", "hours": {}},
            {"id": 2, "firstName": "Мария", "lastName": "Петрова", "group": "Кондитер", "hours": {}}
        ]
        with open(EMPLOYEES_FILE, 'w', encoding='utf-8') as f:
            json.dump(default_employees, f, ensure_ascii=False)
        logger.info("Файл employees.json инициализирован")

# Инициализация файла salary_rates.json
def init_salary_rates_file():
    if not os.path.exists(SALARY_RATES_FILE):
        default_rates = [
            {"group": "Повар", "paymentType": "hourly", "hourlyRate": 100, "dailyRate": 0},
            {"group": "Помощник повара", "paymentType": "daily", "hourlyRate": 0, "dailyRate": 800},
            {"group": "Кондитер", "paymentType": "hourly", "hourlyRate": 120, "dailyRate": 0}
        ]
        with open(SALARY_RATES_FILE, 'w', encoding='utf-8') as f:
            json.dump(default_rates, f, ensure_ascii=False)
        logger.info("Файл salary_rates.json инициализирован")

# Инициализация существующих файлов
def init_products_file():
    if not os.path.exists(PRODUCTS_FILE):
        with open(PRODUCTS_FILE, 'w', encoding='utf-8') as f:
            json.dump([], f, ensure_ascii=False)
        logger.info("Файл products.json инициализирован")

def init_stocks_file():
    if not os.path.exists(STOCKS_FILE):
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
        with open(STOCKS_FILE, 'w', encoding='utf-8') as f:
            json.dump(stock_data, f, ensure_ascii=False)
        logger.info("Файл stocks.json инициализирован с начальными данными")

init_products_file()
init_stocks_file()
init_employees_file()
init_salary_rates_file()

# Обновление списка товаров на основе данных из СБИС
def update_products_from_data(data):
    try:
        if os.path.exists(PRODUCTS_FILE):
            with open(PRODUCTS_FILE, 'r', encoding='utf-8') as f:
                products = json.load(f)
        else:
            products = []

        product_names = set()
        for point in data:
            for item in point['items']:
                product_names.add(item['name'])

        existing_names = {product["name"] for product in products}
        max_id = max([p["id"] for p in products], default=0) if products else 0

        new_products = []
        for name in product_names:
            if name not in existing_names:
                max_id += 1
                new_products.append({"id": max_id, "name": name})

        if new_products:
            products.extend(new_products)
            with open(PRODUCTS_FILE, 'w', encoding='utf-8') as f:
                json.dump(products, f, ensure_ascii=False)
            logger.info(f"Добавлено {len(new_products)} новых товаров в products.json")
    except Exception as e:
        logger.error(f"Ошибка при обновлении списка товаров: {str(e)}")

# Инициализация SBISApp
sbis_app = SBISApp(
    client_id=os.getenv("SBIS_APP_CLIENT_ID", "1025293145607151"),
    login=os.getenv("SBIS_LOGIN", "privet2023"),
    password=os.getenv("SBIS_PASSWORD", "privet2023"),
    inn=os.getenv("SBIS_INN", "301806206800")
)

@app.route('/api/config', methods=['GET'])
def get_config():
    return jsonify({"apiToken": API_TOKEN})

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

        update_products_from_data(receipts)
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

    try:
        end_date = datetime.strptime(planning_date, '%Y-%m-%d')
        start_date = end_date - timedelta(days=30)
        date_from = start_date.strftime('%Y-%m-%d')
        date_to = (end_date + timedelta(days=1)).strftime('%Y-%m-%d')
    except ValueError as e:
        logger.error(f"Ошибка парсинга даты планирования: {str(e)}")
        return jsonify({"error": "Некорректный формат даты планирования. Используйте формат YYYY-MM-DD"}), 400

    logger.info(f"Запрашиваем данные для плана производства с {date_from} по {date_to}")

    try:
        receipts = sbis_app.get_receipts(sid, date_from, date_to, point_name)
        logger.info(f"Получено чеков: {len(receipts)}")
        update_products_from_data(receipts)
    except Exception as e:
        logger.error(f"Ошибка получения данных о продажах: {str(e)}")
        return jsonify({"error": f"Ошибка получения данных о продажах: ${str(e)}"}), 500

    if not receipts:
        logger.info("Чеки отсутствуют, возвращаем пустой план производства")
        return jsonify({"data": []}), 200

    # Загрузка остатков из stocks.json
    try:
        if os.path.exists(STOCKS_FILE):
            with open(STOCKS_FILE, 'r', encoding='utf-8') as f:
                stock_data = json.load(f)
        else:
            stock_data = {}
        logger.info(f"Остатки загружены из {STOCKS_FILE}: {stock_data}")
    except Exception as e:
        logger.error(f"Ошибка загрузки остатков из {STOCKS_FILE}: {str(e)}")
        return jsonify({"error": f"Ошибка загрузки остатков: {str(e)}"}), 500

    sales_by_day_of_week = {}
    try:
        for point in receipts:
            logger.info(f"Обрабатываем точку: {point['point_name']}, элементов: {len(point['items'])}")
            for item in point['items']:
                try:
                    date = datetime.strptime(item['receiveDateTime'].split('T')[0], '%Y-%m-%d')
                    day_of_week = date.weekday()
                    key = f"{day_of_week}_{item['name']}_{point['point_name']}"

                    if key not in sales_by_day_of_week:
                        sales_by_day_of_week[key] = {
                            'day_of_week': day_of_week,
                            'name': item['name'],
                            'point_name': point['point_name'],
                            'sales': []
                        }

                    first_date = start_date
                    diff_days = (date - first_date).days
                    week_number = diff_days // 7

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

    forecast_by_day_of_week = {}
    try:
        for key, item in sales_by_day_of_week.items():
            sales = item['sales']
            logger.info(f"Прогнозируем спрос для {key}, данные продаж: {sales}")

            sales_data = [[i, qty] for i, qty in enumerate(sales)]
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

            X = np.array([x[0] for x in sales_data]).reshape(-1, 1)
            y = np.array([x[1] for x in sales_data])
            model = LinearRegression()
            model.fit(X, y)
            next_week = len(sales) - 1 + 1
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

    planning_day = end_date.weekday()
    production_plan = {}
    try:
        for key, item in forecast_by_day_of_week.items():
            if item['day_of_week'] == planning_day and (not point_name or item['point_name'] == point_name):
                stock = stock_data.get(item['point_name'], {}).get(item['name'], 0)
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

@app.route('/api/products', methods=['GET'])
def get_products():
    if not check_auth_token():
        return jsonify({"error": "Неавторизованный доступ"}), 401

    try:
        if os.path.exists(PRODUCTS_FILE):
            with open(PRODUCTS_FILE, 'r', encoding='utf-8') as f:
                products = json.load(f)
        else:
            products = []
        return jsonify({"products": products})
    except Exception as e:
        logger.error(f"Ошибка получения списка товаров: {str(e)}")
        return jsonify({"error": f"Ошибка получения списка товаров: {str(e)}"}), 500

@app.route('/api/writeoffs', methods=['GET'])
def get_writeoffs():
    if not check_auth_token():
        return jsonify({"error": "Неавторизованный доступ"}), 401

    try:
        if os.path.exists(WRITE_OFFS_FILE):
            with open(WRITE_OFFS_FILE, 'r', encoding='utf-8') as f:
                writeoffs = json.load(f)
        else:
            writeoffs = []

        if os.path.exists(PRODUCTS_FILE):
            with open(PRODUCTS_FILE, 'r', encoding='utf-8') as f:
                products = json.load(f)
        else:
            products = []

        product_map = {str(product["id"]): product["name"] for product in products}
        for writeoff in writeoffs:
            if "product_id" in writeoff:
                writeoff["product"] = product_map.get(str(writeoff["product_id"]), "Неизвестный товар")
            else:
                writeoff["product"] = writeoff.get("product", "Неизвестный товар")

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

        if isinstance(data, list):
            writeoffs_to_add = data
        else:
            writeoffs_to_add = [data]

        if os.path.exists(PRODUCTS_FILE):
            with open(PRODUCTS_FILE, 'r', encoding='utf-8') as f:
                products = json.load(f)
        else:
            products = []

        product_ids = {product["id"] for product in products}
        required_fields = ["date", "point", "product_id", "quantity"]
        new_writeoffs = []
        for writeoff_data in writeoffs_to_add:
            for field in required_fields:
                if field not in writeoff_data or not writeoff_data[field]:
                    return jsonify({"error": f"Поле {field} обязательно"}), 400

            try:
                datetime.strptime(writeoff_data["date"], "%Y-%m-%d")
            except ValueError:
                return jsonify({"error": "Некорректный формат даты. Используйте формат YYYY-MM-DD (например, 2025-05-08)"}), 400

            product_id = int(writeoff_data["product_id"])
            if product_id not in product_ids:
                return jsonify({"error": f"Товар с id {product_id} не найден"}), 400

            quantity = int(writeoff_data["quantity"])
            if quantity <= 0:
                return jsonify({"error": "Количество должно быть больше 0"}), 400

            new_writeoffs.append({
                "date": writeoff_data["date"],
                "point": writeoff_data["point"],
                "product_id": product_id,
                "quantity": quantity
            })

        if os.path.exists(WRITE_OFFS_FILE):
            with open(WRITE_OFFS_FILE, 'r', encoding='utf-8') as f:
                writeoffs = json.load(f)
        else:
            writeoffs = []

        lock = FileLock(WRITE_OFFS_FILE + ".lock")
        with lock:
            max_id = max([w["id"] for w in writeoffs], default=0) if writeoffs else 0
            for i, writeoff in enumerate(new_writeoffs):
                writeoff["id"] = max_id + 1 + i
                writeoffs.append(writeoff)

            with open(WRITE_OFFS_FILE, 'w', encoding='utf-8') as f:
                json.dump(writeoffs, f, ensure_ascii=False)

        logger.info(f"Добавлено {len(new_writeoffs)} списаний")
        return jsonify({"message": f"Добавлено {len(new_writeoffs)} списаний", "writeoffs": new_writeoffs}), 201
    except Exception as e:
        logger.error(f"Ошибка добавления списаний: {str(e)}")
        return jsonify({"error": f"Ошибка добавления списаний: {str(e)}"}), 500

@app.route('/api/writeoffs/<int:id>', methods=['DELETE'])
def delete_writeoff(id):
    if not check_auth_token():
        return jsonify({"error": "Неавторизованный доступ"}), 401

    try:
        if os.path.exists(WRITE_OFFS_FILE):
            with open(WRITE_OFFS_FILE, 'r', encoding='utf-8') as f:
                writeoffs = json.load(f)
        else:
            writeoffs = []

        writeoff_index = next((index for (index, w) in enumerate(writeoffs) if w["id"] == id), None)
        if writeoff_index is None:
            return jsonify({"error": f"Списание с id {id} не найдено"}), 404

        lock = FileLock(WRITE_OFFS_FILE + ".lock")
        with lock:
            deleted_writeoff = writeoffs.pop(writeoff_index)
            with open(WRITE_OFFS_FILE, 'w', encoding='utf-8') as f:
                json.dump(writeoffs, f, ensure_ascii=False)

        logger.info(f"Списание с id {id} успешно удалено")
        return jsonify({"message": f"Списание с id {id} успешно удалено", "writeoff": deleted_writeoff}), 200
    except Exception as e:
        logger.error(f"Ошибка удаления списания с id {id}: {str(e)}")
        return jsonify({"error": f"Ошибка удаления списания: {str(e)}"}), 500

@app.route('/api/stocks', methods=['GET'])
def get_stocks():
    if not check_auth_token():
        return jsonify({"error": "Неавторизованный доступ"}), 401

    try:
        if os.path.exists(STOCKS_FILE):
            with open(STOCKS_FILE, 'r', encoding='utf-8') as f:
                stocks = json.load(f)
        else:
            stocks = {}
        return jsonify({"stocks": stocks})
    except Exception as e:
        logger.error(f"Ошибка получения остатков: {str(e)}")
        return jsonify({"error": f"Ошибка получения остатков: {str(e)}"}), 500

@app.route('/api/stocks', methods=['POST'])
def update_stock():
    if not check_auth_token():
        return jsonify({"error": "Неавторизованный доступ"}), 401

    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Данные не переданы"}), 400

        required_fields = ["point", "product", "quantity", "operation"]
        for field in required_fields:
            if field not in data or not data[field]:
                return jsonify({"error": f"Поле {field} обязательно"}), 400

        point = data["point"]
        product = data["product"]
        quantity = int(data["quantity"])
        operation = data["operation"]

        if quantity < 0:
            return jsonify({"error": "Количество не может быть меньше 0"}), 400

        if operation not in ["add", "subtract", "set"]:
            return jsonify({"error": "Операция должна быть 'add', 'subtract' или 'set'"}), 400

        if os.path.exists(STOCKS_FILE):
            with open(STOCKS_FILE, 'r', encoding='utf-8') as f:
                stocks = json.load(f)
        else:
            stocks = {}

        lock = FileLock(STOCKS_FILE + ".lock")
        with lock:
            if point not in stocks:
                stocks[point] = {}
            if product not in stocks[point]:
                stocks[point][product] = 0

            if operation == "add":
                stocks[point][product] += quantity
            elif operation == "subtract":
                new_quantity = stocks[point][product] - quantity
                if new_quantity < 0:
                    return jsonify({"error": "Количество не может быть меньше 0"}), 400
                stocks[point][product] = new_quantity
            elif operation == "set":
                stocks[point][product] = quantity

            with open(STOCKS_FILE, 'w', encoding='utf-8') as f:
                json.dump(stocks, f, ensure_ascii=False)

        logger.info(f"Остатки обновлены: {point}, {product}, {operation}, {quantity}")
        return jsonify({"message": "Остатки обновлены", "point": point, "product": product, "quantity": stocks[point][product]}), 200
    except Exception as e:
        logger.error(f"Ошибка обновления остатков: {str(e)}")
        return jsonify({"error": f"Ошибка обновления остатков: {str(e)}"}), 500

@app.route('/api/employees', methods=['GET'])
def get_employees():
    if not check_auth_token():
        return jsonify({"error": "Неавторизованный доступ"}), 401

    try:
        if os.path.exists(EMPLOYEES_FILE):
            with open(EMPLOYEES_FILE, 'r', encoding='utf-8') as f:
                employees = json.load(f)
        else:
            employees = []
        return jsonify({"employees": employees})
    except Exception as e:
        logger.error(f"Ошибка получения списка сотрудников: {str(e)}")
        return jsonify({"error": f"Ошибка получения списка сотрудников: {str(e)}"}), 500

@app.route('/api/employees', methods=['POST'])
def add_employee():
    if not check_auth_token():
        return jsonify({"error": "Неавторизованный доступ"}), 401

    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Данные не переданы"}), 400

        required_fields = ["firstName", "lastName", "group"]
        for field in required_fields:
            if field not in data or not data[field]:
                return jsonify({"error": f"Поле {field} обязательно"}), 400

        employee = {
            "firstName": data["firstName"],
            "lastName": data["lastName"],
            "group": data["group"],
            "hours": data.get("hours", {})
        }

        if os.path.exists(EMPLOYEES_FILE):
            with open(EMPLOYEES_FILE, 'r', encoding='utf-8') as f:
                employees = json.load(f)
        else:
            employees = []

        lock = FileLock(EMPLOYEES_FILE + ".lock")
        with lock:
            if "id" in data:
                employee["id"] = data["id"]
                employee_index = next((i for i, e in enumerate(employees) if e["id"] == employee["id"]), None)
                if employee_index is not None:
                    employees[employee_index] = employee
                    logger.info(f"Сотрудник с id {employee['id']} обновлён")
                else:
                    return jsonify({"error": f"Сотрудник с id {employee['id']} не найден"}), 404
            else:
                max_id = max([e["id"] for e in employees], default=0) if employees else 0
                employee["id"] = max_id + 1
                employees.append(employee)
                logger.info(f"Добавлен новый сотрудник с id {employee['id']}")

            with open(EMPLOYEES_FILE, 'w', encoding='utf-8') as f:
                json.dump(employees, f, ensure_ascii=False)

        return jsonify({"message": "Сотрудник сохранён", "employee": employee}), 201
    except Exception as e:
        logger.error(f"Ошибка сохранения сотрудника: {str(e)}")
        return jsonify({"error": f"Ошибка сохранения сотрудника: {str(e)}"}), 500

@app.route('/api/employees/<int:id>', methods=['DELETE'])
def delete_employee(id):
    if not check_auth_token():
        return jsonify({"error": "Неавторизованный доступ"}), 401

    try:
        if os.path.exists(EMPLOYEES_FILE):
            with open(EMPLOYEES_FILE, 'r', encoding='utf-8') as f:
                employees = json.load(f)
        else:
            employees = []

        employee_index = next((i for i, e in enumerate(employees) if e["id"] == id), None)
        if employee_index is None:
            return jsonify({"error": f"Сотрудник с id {id} не найден"}), 404

        lock = FileLock(EMPLOYEES_FILE + ".lock")
        with lock:
            deleted_employee = employees.pop(employee_index)
            with open(EMPLOYEES_FILE, 'w', encoding='utf-8') as f:
                json.dump(employees, f, ensure_ascii=False)

        logger.info(f"Сотрудник с id {id} удалён")
        return jsonify({"message": f"Сотрудник с id {id} удалён", "employee": deleted_employee}), 200
    except Exception as e:
        logger.error(f"Ошибка удаления сотрудника с id {id}: {str(e)}")
        return jsonify({"error": f"Ошибка удаления сотрудника: {str(e)}"}), 500

@app.route('/api/salary_rates', methods=['GET'])
def get_salary_rates():
    if not check_auth_token():
        return jsonify({"error": "Неавторизованный доступ"}), 401

    try:
        if os.path.exists(SALARY_RATES_FILE):
            with open(SALARY_RATES_FILE, 'r', encoding='utf-8') as f:
                rates = json.load(f)
        else:
            rates = []
        return jsonify({"rates": rates})
    except Exception as e:
        logger.error(f"Ошибка получения ставок: {str(e)}")
        return jsonify({"error": f"Ошибка получения ставок: {str(e)}"}), 500

@app.route('/api/salary_rates', methods=['POST'])
def update_salary_rates():
    if not check_auth_token():
        return jsonify({"error": "Неавторизованный доступ"}), 401

    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Данные не переданы"}), 400

        required_fields = ["group", "paymentType"]
        for field in required_fields:
            if field not in data or not data[field]:
                return jsonify({"error": f"Поле {field} обязательно"}), 400

        if data["paymentType"] not in ["hourly", "daily"]:
            return jsonify({"error": "paymentType должен быть 'hourly' или 'daily'"}), 400

        rate = {
            "group": data["group"],
            "paymentType": data["paymentType"],
            "hourlyRate": float(data.get("hourlyRate", 0)) if data["paymentType"] == "hourly" else 0,
            "dailyRate": float(data.get("dailyRate", 0)) if data["paymentType"] == "daily" else 0
        }

        if rate["paymentType"] == "hourly" and rate["hourlyRate"] <= 0:
            return jsonify({"error": "Почасовая ставка должна быть больше 0"}), 400
        if rate["paymentType"] == "daily" and rate["dailyRate"] <= 0:
            return jsonify({"error": "Дневная ставка должна быть больше 0"}), 400

        if os.path.exists(SALARY_RATES_FILE):
            with open(SALARY_RATES_FILE, 'r', encoding='utf-8') as f:
                rates = json.load(f)
        else:
            rates = []

        lock = FileLock(SALARY_RATES_FILE + ".lock")
        with lock:
            rate_index = next((i for i, r in enumerate(rates) if r["group"] == rate["group"]), None)
            if rate_index is not None:
                rates[rate_index] = rate
                logger.info(f"Ставка для группы {rate['group']} обновлена")
            else:
                rates.append(rate)
                logger.info(f"Добавлена новая ставка для группы {rate['group']}")

            with open(SALARY_RATES_FILE, 'w', encoding='utf-8') as f:
                json.dump(rates, f, ensure_ascii=False)

        return jsonify({"message": "Ставка сохранена", "rate": rate}), 201
    except Exception as e:
        logger.error(f"Ошибка сохранения ставки: {str(e)}")
        return jsonify({"error": f"Ошибка сохранения ставки: {str(e)}"}), 500

@app.route('/api/salary_rates/<group>', methods=['DELETE'])
def delete_salary_rate(group):
    if not check_auth_token():
        return jsonify({"error": "Неавторизованный доступ"}), 401

    try:
        if os.path.exists(SALARY_RATES_FILE):
            with open(SALARY_RATES_FILE, 'r', encoding='utf-8') as f:
                rates = json.load(f)
        else:
            rates = []

        rate_index = next((i for i, r in enumerate(rates) if r["group"] == group), None)
        if rate_index is None:
            return jsonify({"error": f"Группа {group} не найдена"}), 404

        # Проверка, используется ли группа сотрудниками
        if os.path.exists(EMPLOYEES_FILE):
            with open(EMPLOYEES_FILE, 'r', encoding='utf-8') as f:
                employees = json.load(f)
        else:
            employees = []

        if any(employee["group"] == group for employee in employees):
            return jsonify({"error": f"Группа {group} используется сотрудниками и не может быть удалена"}), 400

        lock = FileLock(SALARY_RATES_FILE + ".lock")
        with lock:
            deleted_rate = rates.pop(rate_index)
            with open(SALARY_RATES_FILE, 'w', encoding='utf-8') as f:
                json.dump(rates, f, ensure_ascii=False)

        logger.info(f"Группа {group} удалена")
        return jsonify({"message": f"Группа {group} удалена", "rate": deleted_rate}), 200
    except Exception as e:
        logger.error(f"Ошибка удаления группы {group}: {str(e)}")
        return jsonify({"error": f"Ошибка удаления группы: {str(e)}"}), 500

@app.route('/api/salaries', methods=['GET'])
def calculate_salaries():
    if not check_auth_token():
        return jsonify({"error": "Неавторизованный доступ"}), 401

    month = request.args.get('month')  # Ожидаем формат "YYYY-MM"

    if not month:
        return jsonify({"error": "Параметр month обязателен (формат: YYYY-MM)"}), 400

    try:
        year, month_num = map(int, month.split('-'))
        start = datetime(year, month_num, 1)
        # Последний день месяца
        next_month = start.replace(day=28) + timedelta(days=4)
        end = next_month - timedelta(days=next_month.day)
    except ValueError:
        return jsonify({"error": "Некорректный формат параметра month. Используйте YYYY-MM (например, 2025-05)"}), 400

    try:
        if os.path.exists(EMPLOYEES_FILE):
            with open(EMPLOYEES_FILE, 'r', encoding='utf-8') as f:
                employees = json.load(f)
        else:
            employees = []

        if os.path.exists(SALARY_RATES_FILE):
            with open(SALARY_RATES_FILE, 'r', encoding='utf-8') as f:
                rates = json.load(f)
        else:
            rates = []

        rate_map = {r["group"]: {"paymentType": r["paymentType"], "hourly": r["hourlyRate"], "daily": r["dailyRate"]} for r in rates}
        salaries = []

        # Возвращаем данные для всех сотрудников, даже если зарплата равна 0
        for employee in employees:
            total_salary = 0
            current_date = start
            while current_date <= end:
                date_str = current_date.strftime('%Y-%m-%d')
                hours_data = employee.get("hours", {}).get(date_str, {})
                hours = hours_data.get("hours", 0) if hours_data else 0
                worked = hours_data.get("worked", False) if hours_data else False
                group = employee["group"]
                rate = rate_map.get(group, {"paymentType": "hourly", "hourly": 0, "daily": 0})

                salary = 0
                if rate["paymentType"] == "hourly" and hours > 0:
                    salary = hours * rate["hourly"]
                elif rate["paymentType"] == "daily" and worked:
                    salary = rate["daily"]
                total_salary += salary
                current_date += timedelta(days=1)

            salaries.append({
                "id": employee["id"],
                "firstName": employee["firstName"],
                "lastName": employee["lastName"],
                "group": group,
                "totalSalary": total_salary
            })

        logger.info(f"Рассчитаны зарплаты для {len(salaries)} сотрудников за месяц {month}")
        return jsonify({"salaries": salaries})
    except Exception as e:
        logger.error(f"Ошибка расчёта зарплат: {str(e)}")
        return jsonify({"error": f"Ошибка расчёта зарплат: {str(e)}"}), 500

# Вывод зарегистрированных маршрутов
logger.info("Зарегистрированные маршруты:")
for rule in app.url_map.iter_rules():
    logger.info(rule)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)