import os
import json
import logging

# Настройка логирования
logger = logging.getLogger(__name__)

def init_employees_file():
    """Инициализация файла employees.json с тестовыми данными."""
    file_path = os.path.join("data", "employees.json")
    if not os.path.exists(file_path):
        default_employees = [
            {"id": 1, "firstName": "Иван", "lastName": "Иванов", "group": "Повар", "hours": {}},
            {"id": 2, "firstName": "Мария", "lastName": "Петрова", "group": "Кондитер", "hours": {}}
        ]
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(default_employees, f, ensure_ascii=False)
        logger.info("Файл employees.json инициализирован")

def init_salary_rates_file():
    """Инициализация файла salary_rates.json с тестовыми данными."""
    file_path = os.path.join("data", "salary_rates.json")
    if not os.path.exists(file_path):
        default_rates = [
            {"group": "Повар", "paymentType": "hourly", "hourlyRate": 100, "dailyRate": 0},
            {"group": "Помощник повара", "paymentType": "daily", "hourlyRate": 0, "dailyRate": 800},
            {"group": "Кондитер", "paymentType": "hourly", "hourlyRate": 120, "dailyRate": 0}
        ]
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(default_rates, f, ensure_ascii=False)
        logger.info("Файл salary_rates.json инициализирован")

def init_products_file():
    """Инициализация файла products.json."""
    file_path = os.path.join("data", "products.json")
    if not os.path.exists(file_path):
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump([], f, ensure_ascii=False)
        logger.info("Файл products.json инициализирован")

def init_stocks_file():
    """Инициализация файла stocks.json с тестовыми данными."""
    file_path = os.path.join("data", "stocks.json")
    if not os.path.exists(file_path):
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
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(stock_data, f, ensure_ascii=False)
        logger.info("Файл stocks.json инициализирован с начальными данными")