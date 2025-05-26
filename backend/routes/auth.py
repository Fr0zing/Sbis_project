from flask import Blueprint, request, jsonify
import logging
from utils.auth_utils import check_auth_token

# Настройка логирования
logger = logging.getLogger(__name__)

auth_bp = Blueprint('auth', __name__)

def setup_routes(app, sbis_app):
    # Эндпоинт для получения API_TOKEN
    @auth_bp.route('/api/config', methods=['GET'])
    def get_config():
        return jsonify({"apiToken": app.config['API_TOKEN']})

    # Эндпоинт для авторизации и получения SID
    @auth_bp.route('/api/auth', methods=['GET'])
    def auth():
        if not check_auth_token(request, app.config['API_TOKEN']):
            return jsonify({"error": "Неавторизованный доступ"}), 401

        try:
            sid = sbis_app.auth()
            logger.info("Успешная авторизация через /api/auth")
            return jsonify({"sid": sid})
        except Exception as e:
            logger.error(f"Ошибка авторизации: {str(e)}")
            return jsonify({"error": f"Ошибка авторизации: {str(e)}"}), 500

    app.register_blueprint(auth_bp)