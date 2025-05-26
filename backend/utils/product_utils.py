import os
import json
import logging

# Настройка логирования
logger = logging.getLogger(__name__)

def update_products_from_data(data):
    """Обновляет список товаров в products.json на основе данных из чеков."""
    file_path = os.path.join("data", "products.json")
    try:
        if os.path.exists(file_path):
            with open(file_path, 'r', encoding='utf-8') as f:
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
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(products, f, ensure_ascii=False)
            logger.info(f"Добавлено {len(new_products)} новых товаров в products.json")
    except Exception as e:
        logger.error(f"Ошибка при обновлении списка товаров: {str(e)}")