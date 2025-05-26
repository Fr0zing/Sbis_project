from flask import Blueprint, request, jsonify
import json
import logging
import os  # Добавляем импорт модуля os
from datetime import datetime
from filelock import FileLock
from utils.auth_utils import check_auth_token

# Настройка логирования
logger = logging.getLogger(__name__)

stocks_bp = Blueprint('stocks', __name__)

def setup_routes(app):
    @stocks_bp.route('/api/products', methods=['GET'])
    def get_products():
        if not check_auth_token(request, app.config['API_TOKEN']):
            return jsonify({"error": "Неавторизованный доступ"}), 401

        try:
            file_path = os.path.join("data", "products.json")
            if os.path.exists(file_path):
                with open(file_path, 'r', encoding='utf-8') as f:
                    products = json.load(f)
            else:
                products = []
            return jsonify({"products": products})
        except Exception as e:
            logger.error(f"Ошибка получения списка товаров: {str(e)}")
            return jsonify({"error": f"Ошибка получения списка товаров: {str(e)}"}), 500

    @stocks_bp.route('/api/writeoffs', methods=['GET'])
    def get_writeoffs():
        if not check_auth_token(request, app.config['API_TOKEN']):
            return jsonify({"error": "Неавторизованный доступ"}), 401

        try:
            file_path = os.path.join("data", "writeoffs.json")
            if os.path.exists(file_path):
                with open(file_path, 'r', encoding='utf-8') as f:
                    writeoffs = json.load(f)
            else:
                writeoffs = []

            products_file_path = os.path.join("data", "products.json")
            if os.path.exists(products_file_path):
                with open(products_file_path, 'r', encoding='utf-8') as f:
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

    @stocks_bp.route('/api/writeoffs', methods=['POST'])
    def add_writeoff():
        if not check_auth_token(request, app.config['API_TOKEN']):
            return jsonify({"error": "Неавторизованный доступ"}), 401

        try:
            data = request.get_json()
            if not data:
                return jsonify({"error": "Данные не переданы"}), 400

            if isinstance(data, list):
                writeoffs_to_add = data
            else:
                writeoffs_to_add = [data]

            products_file_path = os.path.join("data", "products.json")
            if os.path.exists(products_file_path):
                with open(products_file_path, 'r', encoding='utf-8') as f:
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

            writeoffs_file_path = os.path.join("data", "writeoffs.json")
            if os.path.exists(writeoffs_file_path):
                with open(writeoffs_file_path, 'r', encoding='utf-8') as f:
                    writeoffs = json.load(f)
            else:
                writeoffs = []

            lock = FileLock(writeoffs_file_path + ".lock")
            with lock:
                max_id = max([w["id"] for w in writeoffs], default=0) if writeoffs else 0
                for i, writeoff in enumerate(new_writeoffs):
                    writeoff["id"] = max_id + 1 + i
                    writeoffs.append(writeoff)

                with open(writeoffs_file_path, 'w', encoding='utf-8') as f:
                    json.dump(writeoffs, f, ensure_ascii=False)

            logger.info(f"Добавлено {len(new_writeoffs)} списаний")
            return jsonify({"message": f"Добавлено {len(new_writeoffs)} списаний", "writeoffs": new_writeoffs}), 201
        except Exception as e:
            logger.error(f"Ошибка добавления списаний: {str(e)}")
            return jsonify({"error": f"Ошибка добавления списаний: {str(e)}"}), 500

    @stocks_bp.route('/api/writeoffs/<int:id>', methods=['DELETE'])
    def delete_writeoff(id):
        if not check_auth_token(request, app.config['API_TOKEN']):
            return jsonify({"error": "Неавторизованный доступ"}), 401

        try:
            writeoffs_file_path = os.path.join("data", "writeoffs.json")
            if os.path.exists(writeoffs_file_path):
                with open(writeoffs_file_path, 'r', encoding='utf-8') as f:
                    writeoffs = json.load(f)
            else:
                writeoffs = []

            writeoff_index = next((index for (index, w) in enumerate(writeoffs) if w["id"] == id), None)
            if writeoff_index is None:
                return jsonify({"error": f"Списание с id {id} не найдено"}), 404

            lock = FileLock(writeoffs_file_path + ".lock")
            with lock:
                deleted_writeoff = writeoffs.pop(writeoff_index)
                with open(writeoffs_file_path, 'w', encoding='utf-8') as f:
                    json.dump(writeoffs, f, ensure_ascii=False)

            logger.info(f"Списание с id {id} успешно удалено")
            return jsonify({"message": f"Списание с id {id} успешно удалено", "writeoff": deleted_writeoff}), 200
        except Exception as e:
            logger.error(f"Ошибка удаления списания с id {id}: {str(e)}")
            return jsonify({"error": f"Ошибка удаления списания: {str(e)}"}), 500

    @stocks_bp.route('/api/stocks', methods=['GET'])
    def get_stocks():
        if not check_auth_token(request, app.config['API_TOKEN']):
            return jsonify({"error": "Неавторизованный доступ"}), 401

        try:
            stocks_file_path = os.path.join("data", "stocks.json")
            if os.path.exists(stocks_file_path):
                with open(stocks_file_path, 'r', encoding='utf-8') as f:
                    stocks = json.load(f)
            else:
                stocks = {}
            return jsonify({"stocks": stocks})
        except Exception as e:
            logger.error(f"Ошибка получения остатков: {str(e)}")
            return jsonify({"error": f"Ошибка получения остатков: {str(e)}"}), 500

    @stocks_bp.route('/api/stocks', methods=['POST'])
    def update_stock():
        if not check_auth_token(request, app.config['API_TOKEN']):
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

            stocks_file_path = os.path.join("data", "stocks.json")
            if os.path.exists(stocks_file_path):
                with open(stocks_file_path, 'r', encoding='utf-8') as f:
                    stocks = json.load(f)
            else:
                stocks = {}

            lock = FileLock(stocks_file_path + ".lock")
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

                with open(stocks_file_path, 'w', encoding='utf-8') as f:
                    json.dump(stocks, f, ensure_ascii=False)

            logger.info(f"Остатки обновлены: {point}, {product}, {operation}, {quantity}")
            return jsonify({"message": "Остатки обновлены", "point": point, "product": product, "quantity": stocks[point][product]}), 200
        except Exception as e:
            logger.error(f"Ошибка обновления остатков: {str(e)}")
            return jsonify({"error": f"Ошибка обновления остатков: {str(e)}"}), 500

    app.register_blueprint(stocks_bp)