# EnergoBoard

Простое клиент-серверное приложение для учёта показаний коммунальных счётчиков с аналитикой и прогнозом начислений.

## Архитектура
- Фронтенд: React + TypeScript (Vite SPA, Recharts, React Router).
- Бэкенд: Django 5 + DRF + JWT (SimpleJWT).
- База данных: PostgreSQL (по умолчанию), SQLite в dev при отсутствии переменных окружения.
- Оркестрация: Docker Compose (отдельные сервисы для фронтенда, бэкенда и БД).

## Быстрый запуск без Docker
1. **Backend**
   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   python manage.py migrate
   python manage.py runserver 0.0.0.0:7011
   ```
   По умолчанию используется SQLite. Для PostgreSQL задайте переменные окружения:
   ```bash
   export DB_ENGINE=postgres
   export POSTGRES_DB=energo
   export POSTGRES_USER=energo
   export POSTGRES_PASSWORD=energo
   export POSTGRES_HOST=localhost
   export POSTGRES_PORT=7010
   ```
2. **Frontend**
   ```bash
   cd frontend
   npm install
   npm run dev -- --host --port 7012
   ```
   По умолчанию фронтенд ожидает API по адресу `http://localhost:7011/api/`. При необходимости задайте `VITE_API_URL`.

## Запуск через Docker Compose
```bash
docker compose up --build
```
- Backend: http://localhost:7011 (проксируется на 8100 внутри контейнера)
- Frontend: http://localhost:7012
- PostgreSQL: порт 7010 на хосте (5432 внутри контейнера), учётные данные в `docker-compose.yml` или `backend/.env.example`.

## Основные эндпоинты
- `POST /api/auth/register/` — регистрация пользователя с мгновенной выдачей токенов.
- `POST /api/auth/login/` — получение JWT.
- CRUD: `/api/properties/`, `/api/meters/`, `/api/readings/`, `/api/tariffs/`, `/api/payments/`.
- `GET /api/monthly-charges/` — начисления (read-only).
- `GET /api/analytics/` — агрегированные данные для графиков.
- `GET /api/analytics/forecast/` — прогноз суммы за текущий месяц.

## Бизнес-логика
- При создании показания рассчитывается дельта по предыдущему чтению, подбирается актуальный тариф и обновляется соответствующая запись `MonthlyCharge`.
- Прогноз вычисляется как среднее начислений за последние несколько полных месяцев.

## Тестирование
### Тесты и тесткейсы
- **Backend (Django tests)**: регистрация/логин с JWT; создание объекта владельцем; запрет счётчиков к чужим объектам; фильтрация счётчиков по `property`; добавление показания с пересчётом `MonthlyCharge`; валидация чужого счётчика; агрегаты аналитики по периоду; forecast: 400 без параметра, 404 по чужому объекту, 200 по своему; платежи: запрет на чужой объект, успешное создание для владельца.
- **Frontend (Vitest + RTL + jsdom)**: AuthPage — успешный логин, обработка ошибки, переключение в режим регистрации с вызовом `onRegister`; Dashboard — загрузка прогноза и аналитики, отображение заголовков; ReadingsPage — загрузка счётчиков/показаний, добавление записи, статус «Показание сохранено»; AnalyticsPage — отображение суммарных метрик и прогноза.

### Что покрыто
- **Backend (Django tests):** регистрация и логин, создание объектов, валидация привязки счётчиков/показаний к владельцу, пересчёт начислений при новых показаниях, ответ аналитических агрегатов.
- **Frontend (Vitest + React Testing Library):** авторизация, дашборд (подтяжка прогноза и аналитики), лента показаний (загрузка, добавление записи), исследователь/аналитика (рендер ключевых метрик). API вызовы замоканы.

### Локальный запуск тестов
- Backend:
  ```bash
  cd backend
  python -m venv .venv && source .venv/bin/activate
  pip install -r requirements.txt
  # Для PostgreSQL задайте DB_ENGINE/POSTGRES_* (см. .env.example), иначе будет SQLite
  python manage.py test
  ```
- Frontend:
  ```bash
  cd frontend
  npm install
  npm run test
  ```

### Запуск тестов через Docker Compose (профиль `test`)
- Полная матрица (приложение + тестовые контейнеры). Дождитесь завершения обоих контейнеров (`backend-tests`, `frontend-tests`):
  ```bash
  docker compose --profile test up --build
  ```
- Только бэкенд-тесты с PostgreSQL из docker-compose:
  ```bash
  docker compose --profile test run --rm backend-tests
  ```
- Только фронтенд-тесты без подъёма приложения:
  ```bash
  docker compose --profile test run --rm frontend-tests
  ```
- Ожидаемый итог после общего прогона: в логах `frontend-tests` — `Test Files 4 passed (4), Tests 5 passed`; в логах `backend-tests` — `Ran 6 tests ... OK`. Оба контейнера завершаются с кодом 0.

## UI-страницы
- Авторизация/регистрация.
- Дашборд с выбором объекта, прогнозом и последними показаниями.
- Объекты, счётчики, показания.
- Аналитика с графиками начислений и потребления (Recharts).
