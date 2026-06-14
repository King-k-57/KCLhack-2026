"""Render / Gunicorn 用のエントリーポイント"""
from app import app

if __name__ == "__main__":
    app.run()
