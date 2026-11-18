# Yessenov Course Feedback System

Готовая версия проекта для работы в Visual Studio Code.

## Как открыть

1) Установите Node.js 22 или новее.
2) Откройте VS Code.
3) Нажмите **File → Open Folder**.
4) Выберите папку `Yessenov-Course-Feedback-VSCode`.
5) Откройте встроенный терминал VS Code: **Terminal → New Terminal**.

## Команды

```powershell
npm install
npm run build
npm run validate
npm test
npm run preview
```

После `npm run preview` откройте в браузере адрес, который выведет терминал — обычно `http://127.0.0.1:4173`.

## Что находится в проекте

1) `app/portal.html` — HTML-разметка сайта.
2) `public/portal.js` — интерфейс, роли, курсы, отзывы, уведомления, Face ID / Passkey и языки KZ/RU/EN/DE.
3) `public/styles.css` и `public/portal.css` — адаптивный дизайн и темы.
4) `server/api.mjs` — серверная логика: аккаунты, роли, отзывы, уведомления и защита API.
5) `server/webauthn.mjs` — проверка Face ID, Touch ID, Android-биометрии и Windows Hello через Passkey.
6) `drizzle/` — SQL-структура и начальные данные курсов.
7) `standalone/` — сборка, локальный предпросмотр и автоматические тесты.
8) `tools/feedback_analytics.py` — Python-утилита для подсчёта статистики из JSON-выгрузки.
9) `wrangler.jsonc` — настройка Cloudflare Worker и базы D1 для публикации.

## Проверка перед публикацией

```powershell
npm run validate
npm test
npm run build
npx wrangler deploy
```

Не добавляйте в репозиторий пароли, токены, ключи или файлы `.env`.
