def check_auth_token(request, api_token):
    """Проверяет токен авторизации в заголовке запроса."""
    token = request.headers.get('Authorization')
    if not token or token != f"Bearer {api_token}":
        return False
    return True