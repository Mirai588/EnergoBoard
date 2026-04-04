FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --system

COPY . .

EXPOSE 8100

CMD ["sh", "-c", "python manage.py migrate && python manage.py seedtestdata && python manage.py runserver 0.0.0.0:8100"]
