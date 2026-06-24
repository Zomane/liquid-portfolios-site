# Liquid Portfolio

Демонстрационная версия Discord based приложения для подачи и ревью портфолио внутри комьюнити. Проект показывает полный пользовательский сценарий: вход через Discord, выбор гильдии, отправку портфолио, просмотр статуса заявки и reviewer панель для одобрения или отклонения портфолио.

## Project Context and My Contribution

Изначально проект разрабатывался как часть экосистемы Liquid Trading / Hyperliquid community. В исходной версии в приложении было больше экспериментальной логики: wallet-интеграция, дополнительные guild-разделения, парламентское голосование и часть legacy-кода. Моей основной зоной ответственности была frontend-часть приложения: интерфейс подачи портфолио, отображение пользовательских статусов, страницы портфолио и страницы reviewer, а так же frontend логика приложения. 

Для публикации в портфолио проект был переработан в более понятную и поддерживаемую demo-версию. Основной фокус был на frontend части и приведении приложения к рабочему пользовательскому сценарию:

- очистка UI от wallet-интеграции и ненужных legacy-разделов
- упрощение guild до трёх направлений: Traders, Content и Designers
- настройка пользовательского сценария подачи портфолио без подключения кошелька
- доработка reviewer: просмотр заявок, открытие портфолио, approve/reject
- улучшение frontend-сборки: удаление JS-обфускации и переход к обычному Vite build

Backend в demo-версии сохранён как рабочий API для Discord OAuth2, хранения портфолио, reviewer-действий и назначения Discord roles. Для публикации проект очищен от лишних экспериментальных функций, но оставляет основной fullstack-сценарий рабочим.

## Demo

- Live: https://liquid-portfolios-site.vercel.app
- Backend/API: https://liquid-portfolios-site.onrender.com
- Repository: https://github.com/Zomane/liquid-portfolios-site

## Screenshots

Скриншоты интерфейса будут добавлены позже.

## Features

- Авторизация через Discord OAuth2
- Получение Discord-ролей пользователя с сервера
- Выбор одного из трёх guild-направлений для подачи портфолио
- Отправка portfolio application с описанием, ссылками и proof image
- Просмотр собственного портфолио и текущего статуса заявки
- Публичная страница портфолио пользователя
- Reviewer dashboard со списком заявок и их статусами
- Просмотр деталей каждой portfolio application
- Функция approve/reject для reviewer роли
- Автоматическая выдача следующей роли по тиру после approve
- Локальное хранение данных через SQLite
- Тесты для backend-логики и security checks

## Tech Stack

**Frontend:**

- React
- Vite
- JavaScript
- React Router
- CSS Modules / component-level CSS
- Fetch API

**Backend:**

- Python 3.12
- FastAPI
- Uvicorn
- SQLAlchemy async
- SQLite / aiosqlite
- Discord OAuth2 API
- Pytest
- Docker

## Project Structure

```text
liquid-portfolio/
├── backend/
│   ├── src/
│   │   ├── api/              Маршруты Backend API
│   │   ├── auth/             Логика Discord OAuth2 и JWT
│   │   ├── models/           Модели SQLAlchemy и настройка базы данных
│   │   ├── security/         CSRF, rate limits и вспомогательные функции безопасности
│   │   └── services/         Сервисы для Discord, портфолио и вспомогательной логики
│   ├── tests/                Тесты backend-части
│   ├── main.py               Точка входа FastAPI-приложения
│   ├── Dockerfile            Конфигурация контейнера backend-части
│   └── requirements.txt      Python-зависимости
├── liquidweb/
│   ├── public/               Статические файлы
│   ├── src/
│   │   ├── api/              Функции frontend API-клиента
│   │   ├── components/       Переиспользуемые React-компоненты
│   │   ├── contexts/         React-контексты для авторизации и состояния приложения
│   │   ├── hooks/            Переиспользуемые React-хуки
│   │   ├── pages/            Основные страницы приложения
│   │   └── utils/            Общие вспомогательные функции frontend-части
│   ├── package.json          Зависимости frontend-части и npm-скрипты
│   └── vite.config.js        Конфигурация Vite
├── config/
│   └── roles.yaml            Настройка Discord-сервера и соответствия ролей
└── README.md
```

## Getting Started

### Clone Repository

```bash
git clone https://github.com/your-username/liquid-portfolio.git
cd liquid-portfolio
```

### Backend Setup

Создайте виртуальное окружение и установите зависимости:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
```

Создайте backend env-файл:

```powershell
copy backend\.env.example backend\.env
```

Заполните `backend/.env` своими Discord credentials, server ID, bot token и JWT secret

### Frontend Setup

Установите frontend-зависимости:

```powershell
cd liquidweb
npm install
```

Создайте frontend env-файл:

```powershell
copy .env.example .env
```

## Environment Variables

Backend использует переменные из `backend/.env`:

```env
DATABASE_URL=sqlite+aiosqlite:///./data/app.db
ENVIRONMENT=development

DISCORD_TOKEN=
DISCORD_GUILD_ID=
DISCORD_GUILD_IDS=

DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_REDIRECT_URI=http://localhost:8000/api/auth/callback
FRONTEND_URL=http://localhost:5173

JWT_SECRET=

TWITTER_API_KEY=
MESSAGES_DB_PATH=./data/messages.db

RESUBMIT_COOLDOWN_MINUTES=0
PROMOTION_COOLDOWN_MINUTES=0
```

Frontend использует переменные из `liquidweb/.env`:

```env
VITE_API_URL=http://localhost:8000
VITE_ENABLE_TWEET_EMBEDS=false
```

## Run Project

Запустите backend из корня проекта:

```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

Запустите frontend во втором терминале:

```powershell
cd liquidweb
npm run dev
```

После запуска frontend будет доступен по адресу [http://localhost:5173](http://localhost:5173), backend — по адресу [http://localhost:8000](http://localhost:8000).

## Discord Setup

Для локальной работы нужно создать Discord Application в Developer Portal:

1. Создать application и bot.
2. Скопировать Application ID в `DISCORD_CLIENT_ID`.
3. Скопировать Client Secret в `DISCORD_CLIENT_SECRET`.
4. Скопировать Bot Token в `DISCORD_TOKEN`.
5. Добавить OAuth2 redirect URL:
6. Пригласить bot на Discord server.
7. Создать guild roles и tier roles.
8. Записать role IDs в `config/roles.yaml`.

Для reviewer-доступа пользователь должен иметь роль Guild Lead / Moderator, указанную в backend-конфигурации.

## Run with Docker

```bash
docker build -t liquid-portfolio-backend ./backend
docker run --rm -p 8000:8000 --env-file backend/.env liquid-portfolio-backend
```

## Scripts

Backend:

```powershell
python -m pytest backend\tests
python -m uvicorn main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

Frontend:

```powershell
npm run dev
npm run build
npm run preview
npm run lint
```

## Future Improvements

- Добавить upload-хранилище для proof images вместо локального filesystem.
- Добавить полноценные frontend-тесты для основных пользовательских сценариев.
- Расширить reviewer фильтры и поиск по portfolio applications.
- Добавить audit log действий пользователей c reviewer доступом.