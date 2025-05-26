from flask import Blueprint, request, jsonify
import logging
from utils.auth_utils import check_auth_token
from utils.product_utils import update_products_from_data

# Настройка логирования
logger = logging.getLogger(__name__)

receipts_bp = Blueprint('receipts', __name__)

def setup_routes(app, sbis_app):
    @receipts_bp.route('/api/kkts', methods=['GET'])
    def get_kkts():
        if not check_auth_token(request, app.config['API_TOKEN']):
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

    @receipts_bp.route('/api/receipts', methods=['GET'])
    def get_receipts():
        if not check_auth_token(request, app.config['API_TOKEN']):
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

    app.register_blueprint(receipts_bp)