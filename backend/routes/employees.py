from flask import Blueprint, request, jsonify
import json
import logging
from datetime import datetime, timedelta
from filelock import FileLock
from utils.auth_utils import check_auth_token
import os

# Настройка логирования
logger = logging.getLogger(__name__)

employees_bp = Blueprint('employees', __name__)

def setup_routes(app):
    @employees_bp.route('/api/employees', methods=['GET'])
    def get_employees():
        if not check_auth_token(request, app.config['API_TOKEN']):
            return jsonify({"error": "Неавторизованный доступ"}), 401

        try:
            employees_file_path = os.path.join("data", "employees.json")
            if os.path.exists(employees_file_path):
                with open(employees_file_path, 'r', encoding='utf-8') as f:
                    employees = json.load(f)
            else:
                employees = []
            return jsonify({"employees": employees})
        except Exception as e:
            logger.error(f"Ошибка получения списка сотрудников: {str(e)}")
            return jsonify({"error": f"Ошибка получения списка сотрудников: {str(e)}"}), 500

    @employees_bp.route('/api/employees', methods=['POST'])
    def add_employee():
        if not check_auth_token(request, app.config['API_TOKEN']):
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

            employees_file_path = os.path.join("data", "employees.json")
            if os.path.exists(employees_file_path):
                with open(employees_file_path, 'r', encoding='utf-8') as f:
                    employees = json.load(f)
            else:
                employees = []

            lock = FileLock(employees_file_path + ".lock")
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

                with open(employees_file_path, 'w', encoding='utf-8') as f:
                    json.dump(employees, f, ensure_ascii=False)

            return jsonify({"message": "Сотрудник сохранён", "employee": employee}), 201
        except Exception as e:
            logger.error(f"Ошибка сохранения сотрудника: {str(e)}")
            return jsonify({"error": f"Ошибка сохранения сотрудника: {str(e)}"}), 500

    @employees_bp.route('/api/employees/<int:id>', methods=['DELETE'])
    def delete_employee(id):
        if not check_auth_token(request, app.config['API_TOKEN']):
            return jsonify({"error": "Неавторизованный доступ"}), 401

        try:
            employees_file_path = os.path.join("data", "employees.json")
            if os.path.exists(employees_file_path):
                with open(employees_file_path, 'r', encoding='utf-8') as f:
                    employees = json.load(f)
            else:
                employees = []

            employee_index = next((i for i, e in enumerate(employees) if e["id"] == id), None)
            if employee_index is None:
                return jsonify({"error": f"Сотрудник с id {id} не найден"}), 404

            lock = FileLock(employees_file_path + ".lock")
            with lock:
                deleted_employee = employees.pop(employee_index)
                with open(employees_file_path, 'w', encoding='utf-8') as f:
                    json.dump(employees, f, ensure_ascii=False)

            logger.info(f"Сотрудник с id {id} удалён")
            return jsonify({"message": f"Сотрудник с id {id} удалён", "employee": deleted_employee}), 200
        except Exception as e:
            logger.error(f"Ошибка удаления сотрудника с id {id}: {str(e)}")
            return jsonify({"error": f"Ошибка удаления сотрудника: {str(e)}"}), 500

    @employees_bp.route('/api/salary_rates', methods=['GET'])
    def get_salary_rates():
        if not check_auth_token(request, app.config['API_TOKEN']):
            return jsonify({"error": "Неавторизованный доступ"}), 401

        try:
            salary_rates_file_path = os.path.join("data", "salary_rates.json")
            if os.path.exists(salary_rates_file_path):
                with open(salary_rates_file_path, 'r', encoding='utf-8') as f:
                    rates = json.load(f)
            else:
                rates = []
            return jsonify({"rates": rates})
        except Exception as e:
            logger.error(f"Ошибка получения ставок: {str(e)}")
            return jsonify({"error": f"Ошибка получения ставок: {str(e)}"}), 500

    @employees_bp.route('/api/salary_rates', methods=['POST'])
    def update_salary_rates():
        if not check_auth_token(request, app.config['API_TOKEN']):
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

            salary_rates_file_path = os.path.join("data", "salary_rates.json")
            if os.path.exists(salary_rates_file_path):
                with open(salary_rates_file_path, 'r', encoding='utf-8') as f:
                    rates = json.load(f)
            else:
                rates = []

            lock = FileLock(salary_rates_file_path + ".lock")
            with lock:
                rate_index = next((i for i, r in enumerate(rates) if r["group"] == rate["group"]), None)
                if rate_index is not None:
                    rates[rate_index] = rate
                    logger.info(f"Ставка для группы {rate['group']} обновлена")
                else:
                    rates.append(rate)
                    logger.info(f"Добавлена новая ставка для группы {rate['group']}")

                with open(salary_rates_file_path, 'w', encoding='utf-8') as f:
                    json.dump(rates, f, ensure_ascii=False)

            return jsonify({"message": "Ставка сохранена", "rate": rate}), 201
        except Exception as e:
            logger.error(f"Ошибка сохранения ставки: {str(e)}")
            return jsonify({"error": f"Ошибка сохранения ставки: {str(e)}"}), 500

    @employees_bp.route('/api/salary_rates/<group>', methods=['DELETE'])
    def delete_salary_rate(group):
        if not check_auth_token(request, app.config['API_TOKEN']):
            return jsonify({"error": "Неавторизованный доступ"}), 401

        try:
            salary_rates_file_path = os.path.join("data", "salary_rates.json")
            if os.path.exists(salary_rates_file_path):
                with open(salary_rates_file_path, 'r', encoding='utf-8') as f:
                    rates = json.load(f)
            else:
                rates = []

            rate_index = next((i for i, r in enumerate(rates) if r["group"] == group), None)
            if rate_index is None:
                return jsonify({"error": f"Группа {group} не найдена"}), 404

            # Проверка, используется ли группа сотрудниками
            employees_file_path = os.path.join("data", "employees.json")
            if os.path.exists(employees_file_path):
                with open(employees_file_path, 'r', encoding='utf-8') as f:
                    employees = json.load(f)
            else:
                employees = []

            if any(employee["group"] == group for employee in employees):
                return jsonify({"error": f"Группа {group} используется сотрудниками и не может быть удалена"}), 400

            lock = FileLock(salary_rates_file_path + ".lock")
            with lock:
                deleted_rate = rates.pop(rate_index)
                with open(salary_rates_file_path, 'w', encoding='utf-8') as f:
                    json.dump(rates, f, ensure_ascii=False)

            logger.info(f"Группа {group} удалена")
            return jsonify({"message": f"Группа {group} удалена", "rate": deleted_rate}), 200
        except Exception as e:
            logger.error(f"Ошибка удаления группы {group}: {str(e)}")
            return jsonify({"error": f"Ошибка удаления группы: {str(e)}"}), 500

    @employees_bp.route('/api/salaries', methods=['GET'])
    def calculate_salaries():
        if not check_auth_token(request, app.config['API_TOKEN']):
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
            employees_file_path = os.path.join("data", "employees.json")
            if os.path.exists(employees_file_path):
                with open(employees_file_path, 'r', encoding='utf-8') as f:
                    employees = json.load(f)
            else:
                employees = []

            salary_rates_file_path = os.path.join("data", "salary_rates.json")
            if os.path.exists(salary_rates_file_path):
                with open(salary_rates_file_path, 'r', encoding='utf-8') as f:
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

    app.register_blueprint(employees_bp)