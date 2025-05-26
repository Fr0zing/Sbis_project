from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
import logging
import numpy as np
from sklearn.linear_model import LinearRegression
from utils.auth_utils import check_auth_token
from utils.product_utils import update_products_from_data
import os
import json

# Настройка логирования
logger = logging.getLogger(__name__)

production_bp = Blueprint('production', __name__)

def setup_routes(app, sbis_app):
    @production_bp.route('/api/production_plan', methods=['GET'])
    def get_production_plan():
        if not check_auth_token(request, app.config['API_TOKEN']):
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
            stocks_file_path = os.path.join("data", "stocks.json")
            if os.path.exists(stocks_file_path):
                with open(stocks_file_path, 'r', encoding='utf-8') as f:
                    stock_data = json.load(f)
            else:
                stock_data = {}
            logger.info(f"Остатки загружены из stocks.json: {stock_data}")
        except Exception as e:
            logger.error(f"Ошибка загрузки остатков из stocks.json: {str(e)}")
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

    app.register_blueprint(production_bp)