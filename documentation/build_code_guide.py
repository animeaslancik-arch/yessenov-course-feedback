from pathlib import Path
from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
OUT = Path(__file__).with_name("Yessenov_Course_Feedback_Code_Guide_RU_KZ.docx")


def shade(cell_or_paragraph, fill):
    target = cell_or_paragraph._tc if hasattr(cell_or_paragraph, "_tc") else cell_or_paragraph._p
    props = target.get_or_add_tcPr() if hasattr(cell_or_paragraph, "_tc") else target.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), fill)
    props.append(shd)


def set_cell_margin(cell, top=90, start=110, bottom=90, end=110):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcMar = tcPr.first_child_found_in("w:tcMar")
    if tcMar is None:
        tcMar = OxmlElement("w:tcMar")
        tcPr.append(tcMar)
    for side, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tcMar.find(qn(f"w:{side}"))
        if node is None:
            node = OxmlElement(f"w:{side}")
            tcMar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_font(run, name="Aptos", size=11, bold=False, color=None):
    run.font.name = name
    run._element.rPr.rFonts.set(qn("w:ascii"), name)
    run._element.rPr.rFonts.set(qn("w:hAnsi"), name)
    run._element.rPr.rFonts.set(qn("w:eastAsia"), name)
    run.font.size = Pt(size)
    run.font.bold = bold
    if color:
        run.font.color.rgb = RGBColor(*color)


def setup_styles(doc):
    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Aptos"
    normal._element.rPr.rFonts.set(qn("w:ascii"), "Aptos")
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Aptos")
    normal.font.size = Pt(10.5)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.08
    for name, size in (("Title", 22), ("Heading 1", 16), ("Heading 2", 12.5)):
        s = styles[name]
        s.font.name = "Aptos Display" if name == "Title" else "Aptos"
        s._element.rPr.rFonts.set(qn("w:ascii"), s.font.name)
        s._element.rPr.rFonts.set(qn("w:hAnsi"), s.font.name)
        s.font.size = Pt(size)
        s.font.bold = True
        s.font.color.rgb = RGBColor(0, 0, 0)
        s.paragraph_format.space_before = Pt(16 if name != "Title" else 0)
        s.paragraph_format.space_after = Pt(7)
    # Word's built-in Title style may contain a blue bottom border.
    title_props = styles["Title"]._element.get_or_add_pPr()
    border = title_props.find(qn("w:pBdr"))
    if border is not None:
        title_props.remove(border)


def add_text(doc, text, bold=False, italic=False, size=10.5):
    p = doc.add_paragraph()
    r = p.add_run(text)
    set_font(r, size=size, bold=bold)
    r.italic = italic
    return p


def add_code(doc, code):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(8)
    p.paragraph_format.left_indent = Inches(0.12)
    p.paragraph_format.right_indent = Inches(0.12)
    shade(p, "F2F4F6")
    for index, line in enumerate(code.strip().splitlines()):
        r = p.add_run(line)
        set_font(r, name="Consolas", size=7.7, color=(35, 43, 51))
        if index < len(code.strip().splitlines()) - 1:
            r.add_break()
    return p


def add_table(doc, rows, widths=(1.7, 4.7)):
    table = doc.add_table(rows=1, cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"
    hdr = table.rows[0].cells
    hdr[0].text, hdr[1].text = rows[0]
    for cell in hdr:
        shade(cell, "263B52")
        for run in cell.paragraphs[0].runs:
            set_font(run, size=9, bold=True, color=(255, 255, 255))
        set_cell_margin(cell)
    for first, second in rows[1:]:
        cells = table.add_row().cells
        cells[0].text, cells[1].text = first, second
        for cell in cells:
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            set_cell_margin(cell)
            for p in cell.paragraphs:
                for run in p.runs:
                    set_font(run, size=8.7)
    for row in table.rows:
        row.cells[0].width = Inches(widths[0])
        row.cells[1].width = Inches(widths[1])
    doc.add_paragraph()
    return table


def section_heading(doc, text, level=1):
    doc.add_paragraph(text, style=f"Heading {level}")


CODE = {
    "preferences": """function applyPreferences(){
  const p=S.preferences, root=document.documentElement;
  root.dataset.theme=p.theme; root.dataset.accent=p.accent;
  if(p.accent==='custom' && /^#[0-9a-f]{6}$/i.test(p.customAccent)){
    root.style.setProperty('--accent', p.customAccent);
  }
  root.classList.toggle('reduce-motion', p.reducedMotion);
  root.classList.toggle('high-contrast', p.highContrast);
}""",
    "api": """async function api(path,{method='GET',data}={}){
  const response=await fetch('/api'+path,{
    method, credentials:'same-origin',
    headers:data?{'Content-Type':'application/json'}:{},
    body:data?JSON.stringify(data):undefined
  });
  const out=await response.json().catch(()=>({error:'invalid_response'}));
  if(!response.ok){ const e=new Error(out.error||'request_failed');
    e.status=response.status; throw e; }
  return out;
}""",
    "roles": """function navItems(){
  const base=[['dashboard','house','dashboard'],['courses','courses','courses'],
    ['feedback','feedback','feedback'],['notifications','bell','notifications']];
  if(['teacher','admin'].includes(S.session?.user?.role))
    base.push(['teacher','messages','teacher']);
  if(S.session?.user?.role==='admin') base.push(['admin','admin','admin']);
  return base;
}""",
    "passkey_client": """async function passkeyLogin(){
  if(!window.PublicKeyCredential || !navigator.credentials)
    throw new Error('passkeys_not_supported');
  const email=$('#loginForm input[name="email"]');
  const options=await passkeyOptions(email.value);
  await confirmPasskey(options,'/auth/passkey/verify');
}
function devicePasskeyName(){
  const ua=navigator.userAgent;
  if(/iPhone|iPad|Macintosh/.test(ua)) return 'Apple Face ID / Touch ID';
  if(/Android/.test(ua)) return 'Android biometric passkey';
  if(/Windows/.test(ua)) return 'Windows Hello';
  return 'Device biometric passkey';
}""",
    "password": """async function derivePassword(password, salt, iterations = 100000) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password),
    'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {name:'PBKDF2', hash:'SHA-256', salt, iterations}, key, 256);
  return b64(new Uint8Array(bits));
}
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0; for (let i=0;i<a.length;i++) diff |= a.charCodeAt(i)^b.charCodeAt(i);
  return diff === 0;
}""",
    "origin": """function expectedOrigin(request) {
  const url = new URL(request.url);
  if (url.protocol === 'https:') return url.origin;
  if (['localhost','127.0.0.1'].includes(url.hostname) && url.protocol === 'http:')
    return url.origin;
  fail('invalid_origin',403);
}
if(method!=='GET' && request.headers.get('Origin')!==origin)
  fail('invalid_origin',403);""",
    "rate": """async function limited(db, userId, path) {
  const limit = path.includes('passkeys') ? 20 : 90;
  const id=`${userId}:${path}:${Math.floor(now()/60000)}`;
  const row = await db.prepare(
    'INSERT INTO rate_limits (id,hits,expires) VALUES (?,1,?) '
    + 'ON CONFLICT(id) DO UPDATE SET hits=hits+1 RETURNING hits'
  ).bind(id, now()+120000).first();
  if(row.hits>limit) fail('rate_limited',429);
}""",
    "feedback": """if(path==='/feedback' && (method==='POST'||method==='PATCH')) {
  if(user.role!=='student') fail('forbidden',403);
  const b=await body(request), course=await getCourse(db,text(b.courseId,100,true));
  if(!isOpen(course)) fail('course_closed',409);
  if(!await db.prepare('SELECT id FROM enrollments WHERE course_id=? AND user_id=?')
    .bind(course.id,user.id).first()) fail('not_enrolled',403);
  const ratings=['clarity','materials','support'].map(k=>b[k]);
  if(ratings.some(n=>!Number.isInteger(n)||n<1||n>5)||typeof b.anonymous!=='boolean')
    fail('invalid_input');
  await db.prepare('INSERT INTO feedback (...) VALUES (...)').bind(...).run();
  return json({ok:true});
}""",
    "teacher": """if(path==='/teacher/feedback' && method==='GET') {
  staff(user);
  const rows=(await db.prepare(`SELECT f.id,f.clarity,f.materials,f.support,
    f.comment,f.anonymous,f.status,f.response,c.title,c.code,
    CASE WHEN f.anonymous=1 THEN NULL ELSE u.name END AS student
    FROM feedback f JOIN courses c ON c.id=f.course_id
    JOIN users u ON u.id=f.user_id
    WHERE (?='admin' OR c.teacher_id=?) ORDER BY f.created DESC LIMIT 1000`)
    .bind(user.role,user.id).all()).results;
  return json({feedback:rows});
}""",
    "notification": """await db.batch([
  db.prepare("UPDATE feedback SET response=?,status='reviewed',updated=? WHERE id=?")
    .bind(response,now(),f.id),
  db.prepare("INSERT INTO notifications (id,user_id,kind,course,is_read,created) "
    + "VALUES (?,?,'reviewed',?,0,?)")
    .bind(uid(),f.user_id,course.title,now())
]);""",
    "schema": """CREATE TABLE `feedback` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `course_id` text NOT NULL REFERENCES `courses`(`id`),
  `clarity` integer NOT NULL, `materials` integer NOT NULL, `support` integer NOT NULL,
  `comment` text DEFAULT '' NOT NULL, `anonymous` integer DEFAULT 1 NOT NULL,
  `status` text DEFAULT 'submitted' NOT NULL, `response` text DEFAULT '' NOT NULL,
  `created` integer NOT NULL, `updated` integer NOT NULL
);
CREATE UNIQUE INDEX `feedback_user_course` ON `feedback` (`user_id`,`course_id`);""",
    "worker": """export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    if (url.pathname === '/' || url.pathname === '/portal') return pageResponse();
    if (url.pathname === '/portal.js') return assetResponse(portalJs, 'application/javascript');
    if (url.pathname === '/portal.css') return assetResponse(portalCss, 'text/css');
    return new Response('Not found', {status:404});
  }
};""",
    "analytics": """def summarize_feedback(rows: list[dict[str, Any]]) -> dict[str, Any]:
    ratings = [float(row["rating"]) for row in rows if row.get("rating") is not None]
    statuses = Counter(str(row.get("status", "unknown")) for row in rows)
    return {
        "feedback_count": len(rows),
        "average_rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
        "status_counts": dict(sorted(statuses.items())),
    }""",
    "responsive": """@media(max-width:580px){
  .catalog-grid{grid-template-columns:1fr}
  .stats-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .stats-grid .stat-card:last-child{grid-column:1/-1}
  .settings-grid{gap:0}
  dialog{padding:20px}
}""",
}


FILES = [
    ("app/portal.html", "HTML-разметка публичной страницы, модального входа и кабинета"),
    ("public/portal.js", "Интерфейс, языки, роли, запросы API, отзывы и Passkey"),
    ("public/styles.css", "Базовые стили, цветовые переменные и адаптивная оболочка"),
    ("public/portal.css", "Стили кабинета, карточек, форм, модальных окон и mobile layout"),
    ("server/api.mjs", "API, роли, сессии, D1-запросы, отзывы, уведомления и защита"),
    ("server/webauthn.mjs", "Проверка WebAuthn для Face ID, Touch ID, Android и Windows Hello"),
    ("drizzle/0000_course_feedback.sql", "Основная схема базы D1"),
    ("drizzle/0001_email_auth.sql", "Таблицы учётных данных и сессий email-входа"),
    ("drizzle/0002_seed_courses.sql", "Начальные курсы и преподаватели"),
    ("drizzle/0003_admin_allowlist.sql", "Ограничение ролей администратора"),
    ("standalone/build.mjs", "Сборка Worker из исходных файлов"),
    ("standalone/integration.mjs", "Интеграционная проверка ключевых сценариев"),
    ("standalone/validate.mjs", "Проверка итоговой сборки"),
    ("tools/feedback_analytics.py", "Python-анализ экспортированных отзывов"),
    ("wrangler.jsonc", "Настройка Cloudflare Worker и D1"),
]

FILES_KK = [
    ("app/portal.html", "Жария бет, кіру модалы және кабинет HTML белгілеуі"),
    ("public/portal.js", "Интерфейс, тілдер, рөлдер, API сұраулары, пікірлер және Passkey"),
    ("public/styles.css", "Негізгі стильдер, түсті айнымалылар және бейімделген қабық"),
    ("public/portal.css", "Кабинет, карточкалар, формалар, модал терезелер және mobile layout стильдері"),
    ("server/api.mjs", "API, рөлдер, сессиялар, D1 сұраулары, пікірлер, хабарламалар және қорғаныс"),
    ("server/webauthn.mjs", "Face ID, Touch ID, Android және Windows Hello үшін WebAuthn тексеруі"),
    ("drizzle/0000_course_feedback.sql", "D1 дерекқорының негізгі сызбасы"),
    ("drizzle/0001_email_auth.sql", "Email арқылы кірудің тіркелгі деректері мен сессия кестелері"),
    ("drizzle/0002_seed_courses.sql", "Бастапқы курстар мен оқытушылар"),
    ("drizzle/0003_admin_allowlist.sql", "Әкімші рөлін шектеу"),
    ("standalone/build.mjs", "Бастапқы файлдардан Worker жинағы"),
    ("standalone/integration.mjs", "Негізгі сценарийлердің интеграциялық тексеруі"),
    ("standalone/validate.mjs", "Дайын жинақты тексеру"),
    ("tools/feedback_analytics.py", "Экспортталған пікірлердің Python-талдауы"),
    ("wrangler.jsonc", "Cloudflare Worker және D1 баптауы"),
]


MODULES_RU = [
    ("1. Настройки интерфейса и цвет акцента", "public/portal.js", CODE["preferences"],
     "Функция берёт сохранённые настройки пользователя из объекта состояния S и записывает их в DOM. CSS затем считывает data-theme, data-accent и переменную --accent.",
     "Это даёт светлую, мягкую, тёмную и системную тему, пользовательский цвет, уменьшение анимации и повышенную контрастность без дублирования стилей.",
     "Если убрать проверку цвета, в CSS может попасть некорректная строка. Если изменить имя --accent, его нужно одновременно изменить во всех CSS-правилах."),
    ("2. Единая функция запросов к API", "public/portal.js", CODE["api"],
     "Функция api отправляет GET, POST, PATCH и другие HTTP-запросы на /api. Она сериализует JSON, сохраняет cookies текущего домена и превращает ошибочный ответ в исключение.",
     "Один общий слой не позволяет каждой странице по-разному обрабатывать ошибки и авторизацию.",
     "Если убрать credentials: 'same-origin', браузер перестанет передавать cookies сессии. Если не проверять response.ok, интерфейс сможет показать ошибочный ответ как успешный."),
    ("3. Роли и навигация", "public/portal.js", CODE["roles"],
     "navItems собирает пункты меню. Общие страницы доступны всем, а раздел отзывов студентов добавляется только учителю и администратору. Админ-раздел видит только администратор.",
     "Так интерфейс не показывает кнопки, которые пользователю не нужны.",
     "Изменение условия влияет только на видимость в интерфейсе. Защита на сервере всё равно обязательна и реализована отдельно."),
    ("4. Вход по Face ID и биометрии", "public/portal.js", CODE["passkey_client"],
     "Клиент проверяет поддержку стандарта WebAuthn, получает challenge от сервера и запускает системное окно биометрии. На iPhone это Face ID или Touch ID, на Android - biometric passkey, на Windows - Windows Hello.",
     "Биометрические данные не отправляются сайту: браузер возвращает только криптографическое подтверждение.",
     "Если убрать проверку PublicKeyCredential, неподдерживаемый браузер выдаст техническую ошибку. Если изменить путь verify, его нужно синхронизировать с серверным API."),
    ("5. Пароль и безопасное сравнение", "server/api.mjs", CODE["password"],
     "Пароль не записывается в базу в открытом виде. PBKDF2 создаёт производный хеш с уникальной солью и 100 000 итераций. safeEqual сравнивает строки без раннего выхода по первому отличию.",
     "Это уменьшает риск утечки паролей и атак по времени ответа.",
     "Не снижайте iterations ради скорости. При изменении алгоритма нужна миграция, иначе старые пользователи не смогут войти."),
    ("6. Проверка происхождения запроса", "server/api.mjs", CODE["origin"],
     "Сервер принимает HTTPS-источник сайта либо localhost для локальной разработки. Для запросов, меняющих данные, Origin должен совпадать с ожидаемым адресом.",
     "Это снижает риск CSRF: чужой сайт не должен отправить запрос от имени уже вошедшего пользователя.",
     "Если разрешить любой origin, защита ослабнет. При добавлении собственного домена правила нужно проверить после публикации."),
    ("7. Ограничение частоты запросов", "server/api.mjs", CODE["rate"],
     "limited считает запросы пользователя по маршруту и минутному окну в таблице rate_limits. Для Passkey установлен более строгий лимит.",
     "Ограничение защищает вход, регистрацию и API от перебора и случайных циклических запросов.",
     "Слишком маленькое значение будет блокировать обычных пользователей; слишком большое сделает защиту слабее."),
    ("8. Отправка отзыва", "server/api.mjs", CODE["feedback"],
     "Маршрут принимает отзыв только от студента, проверяет открытость курса и запись на него, затем проверяет оценки от 1 до 5 и флаг анонимности.",
     "Так отзыв связан с конкретным курсом, не создаётся после даты закрытия и не может быть отправлен посторонним человеком.",
     "Если убрать проверку enrollment, студент сможет оценивать любой курс. Если разрешить значения вне 1-5, средняя оценка перестанет быть корректной."),
    ("9. Анонимность преподавательского кабинета", "server/api.mjs", CODE["teacher"],
     "SQL-запрос возвращает имя студента только когда anonymous равно 0. Для анонимного отзыва поле student становится NULL.",
     "Преподаватель получает содержание и оценки, но не личность студента при выбранной анонимности.",
     "Если удалить CASE WHEN, анонимность будет нарушена. Ограничение WHERE дополнительно не даёт учителю читать отзывы чужих курсов."),
    ("10. Ответ преподавателя и уведомление", "server/api.mjs", CODE["notification"],
     "Операции выполняются пакетом: отзыв получает ответ и статус reviewed, а студенту создаётся непрочитанное уведомление.",
     "Пакет не даёт оставить систему в половинчатом состоянии, когда ответ есть, а уведомления нет.",
     "Если разделить операции без транзакционного пакета, временная ошибка может привести к несогласованным данным."),
    ("11. Структура базы данных", "drizzle/0000_course_feedback.sql", CODE["schema"],
     "Таблица feedback хранит оценки, комментарий, анонимность, статус и ответ. Внешние ключи связывают отзыв со студентом и курсом. Уникальный индекс оставляет один отзыв на курс для одного студента.",
     "Такая схема сохраняет целостность данных и делает выборки быстрыми.",
     "Если убрать уникальный индекс, появятся дубликаты. Изменение имени столбца требует изменить SQL-запросы и клиентский код."),
    ("12. Маршрутизация Cloudflare Worker", "standalone/build.mjs", CODE["worker"],
     "Worker принимает каждый HTTP-запрос. API передаётся в handleApi, а HTML, JavaScript и CSS возвращаются как статические ресурсы с правильным Content-Type.",
     "Это объединяет фронтенд и серверную часть в одной публикации Cloudflare.",
     "Если поменять путь /api/, надо изменить и функцию api на клиенте. При неправильном Content-Type браузер может не выполнить JavaScript или не применить CSS."),
    ("13. Аналитика на Python", "tools/feedback_analytics.py", CODE["analytics"],
     "Python-функция получает JSON-массив отзывов, считает число отзывов, среднюю оценку и количество по статусам. Она предназначена для офлайн-отчётов, а не для обработки пользовательских запросов в браузере.",
     "Этот код показывает использование Python в проекте и позволяет быстро подготовить статистику для защиты.",
     "Если JSON содержит строковые оценки, float их преобразует. Если сменить ключ rating, нужно синхронно изменить формат экспорта."),
    ("14. Адаптивная мобильная верстка", "public/portal.css", CODE["responsive"],
     "Медиа-запрос при ширине до 580px перестраивает сетки в одну колонку, уменьшает отступы и делает карточки статистики читаемыми на телефоне.",
     "Без этого десктопные блоки будут сжиматься и станут неудобны на iPhone и Android.",
     "Если поднять предел 580px, мобильный вид будет включаться раньше. Если убрать правило последней карточки, она потеряет визуальный акцент."),
]


MODULES_KK = [
    ("1. Интерфейс баптаулары және екпін түсі", "public/portal.js", CODE["preferences"],
     "Функция S күй объектісінен пайдаланушы баптауларын алып, DOM-ға жазады. CSS data-theme, data-accent және --accent айнымалысын оқиды.",
     "Осылайша стильдерді қайталамай, жарық, жұмсақ, қараңғы және жүйелік тақырыптар, жеке түс, қозғалысты азайту және контраст беріледі.",
     "Түс тексерісін алып тастаса, CSS-ке қате жол түсуі мүмкін. --accent атауын өзгертсеңіз, оны барлық CSS ережелерінде де өзгерту қажет."),
    ("2. API-ге бірыңғай сұрау функциясы", "public/portal.js", CODE["api"],
     "api функциясы /api мекенжайына GET, POST, PATCH және басқа HTTP сұрауларын жібереді. Ол JSON-ды сериализациялайды, сол доменнің cookies мәндерін сақтайды және қате жауапты exception-ға айналдырады.",
     "Бір ортақ қабат әр бетте қателер мен авторизацияны әртүрлі өңдеуге жол бермейді.",
     "credentials: 'same-origin' жойылса, браузер сессия cookies-ін жібермейді. response.ok тексерілмесе, интерфейс қатені сәтті жауап ретінде көрсете алады."),
    ("3. Рөлдер және навигация", "public/portal.js", CODE["roles"],
     "navItems мәзір тармақтарын жинайды. Жалпы беттер барлығына ашық, ал студент пікірлері мұғалім мен әкімшіге ғана қосылады. Әкімші бөлімі тек әкімшіге көрінеді.",
     "Осылайша интерфейс пайдаланушыға қажет емес батырмаларды көрсетпейді.",
     "Шартты өзгерту тек интерфейстегі көрінуге әсер етеді. Серверлік қорғаныс міндетті түрде бөлек сақталуы керек."),
    ("4. Face ID және биометрия арқылы кіру", "public/portal.js", CODE["passkey_client"],
     "Клиент WebAuthn стандартының қолдауын тексереді, серверден challenge алады және жүйелік биометрия терезесін ашады. iPhone-да бұл Face ID не Touch ID, Android-та biometric passkey, Windows-та Windows Hello.",
     "Биометриялық деректер сайтқа жіберілмейді: браузер тек криптографиялық растауды қайтарады.",
     "PublicKeyCredential тексерісін жойсаңыз, қолдамайтын браузер техникалық қате береді. verify жолын өзгертсеңіз, оны серверлік API-мен бірге өзгерту керек."),
    ("5. Құпиясөз және қауіпсіз салыстыру", "server/api.mjs", CODE["password"],
     "Құпиясөз базаға ашық мәтінмен жазылмайды. PBKDF2 бірегей тұзбен және 100 000 итерациямен туынды хеш жасайды. safeEqual бірінші айырмашылықта ерте шықпай, жолдарды салыстырады.",
     "Бұл құпиясөздің ашылу және жауап уақыты арқылы жасалатын шабуыл қаупін азайтады.",
     "Жылдамдық үшін iterations санын азайтпаңыз. Алгоритмді өзгерту үшін миграция керек, әйтпесе ескі пайдаланушылар кіре алмайды."),
    ("6. Сұрау көзін тексеру", "server/api.mjs", CODE["origin"],
     "Сервер сайттың HTTPS көзін немесе жергілікті әзірлеу үшін localhost-ты қабылдайды. Деректі өзгертетін сұрауларда Origin күтілетін адреске сәйкес болуы тиіс.",
     "Бұл CSRF қаупін азайтады: бөгде сайт кірген пайдаланушы атынан сұрау жібере алмауы керек.",
     "Кез келген origin-ге рұқсат беру қорғанысты әлсіретеді. Жеке домен қосылғанда ережелерді жариялаудан кейін тексеру қажет."),
    ("7. Сұраулар жиілігін шектеу", "server/api.mjs", CODE["rate"],
     "limited пайдаланушының маршрут және минуттық терезе бойынша сұрауларын rate_limits кестесінде санайды. Passkey үшін қатаңырақ лимит берілген.",
     "Шектеу кіруді, тіркелуді және API-ді іріктеу шабуылынан және кездейсоқ циклдік сұраулардан қорғайды.",
     "Өте кіші мән әдеттегі пайдаланушыны бұғаттайды; өте үлкен мән қорғанысты әлсіретеді."),
    ("8. Пікір жіберу", "server/api.mjs", CODE["feedback"],
     "Маршрут пікірді тек студенттен қабылдайды, курстың ашықтығын және оған жазылуды тексереді, кейін 1-ден 5-ке дейінгі бағаларды және анонимдік жалаушасын тексереді.",
     "Осылайша пікір нақты курсқа байланады, жабылу күнінен кейін жасалмайды және бөгде адамнан қабылданбайды.",
     "enrollment тексерісін жойсаңыз, студент кез келген курсты бағалай алады. 1-5 шегінен тыс мәндер орташа бағаны бұзады."),
    ("9. Оқытушы кабинетінің анонимдігі", "server/api.mjs", CODE["teacher"],
     "SQL-сұрау student атын anonymous 0 болғанда ғана қайтарады. Анонимді пікірде student өрісі NULL болады.",
     "Оқытушы мазмұн мен бағаларды көреді, бірақ таңдалған анонимдік кезінде студенттің тұлғасын көрмейді.",
     "CASE WHEN жойылса, анонимдік бұзылады. WHERE шектеуі оқытушының басқа курстар пікірін оқуына жол бермейді."),
    ("10. Оқытушы жауабы және хабарлама", "server/api.mjs", CODE["notification"],
     "Операциялар пакетпен орындалады: пікір жауап пен reviewed мәртебесін алады, ал студентке оқылмаған хабарлама жасалады.",
     "Пакет жауап бар, бірақ хабарлама жоқ сияқты жартылай күйдің болуына жол бермейді.",
     "Операцияларды пакетсіз бөлу уақытша қатеде деректердің сәйкессіздігіне әкелуі мүмкін."),
    ("11. Дерекқор құрылымы", "drizzle/0000_course_feedback.sql", CODE["schema"],
     "feedback кестесі бағаларды, түсіндірмені, анонимдікті, мәртебені және жауапты сақтайды. Сыртқы кілттер пікірді студент және курсымен байланыстырады. Бірегей индекс бір студентке бір курс үшін бір пікір қалдырады.",
     "Бұл схема деректер тұтастығын сақтайды және сұрауларды жылдамдатады.",
     "Бірегей индексті жойсаңыз, көшірмелер пайда болады. Баған атауын өзгерту SQL-сұраулар мен клиент кодын бірге өзгертуді талап етеді."),
    ("12. Cloudflare Worker маршрутизациясы", "standalone/build.mjs", CODE["worker"],
     "Worker әр HTTP-сұрауды қабылдайды. API handleApi-ге беріледі, ал HTML, JavaScript және CSS дұрыс Content-Type-пен статикалық ресурс ретінде қайтарылады.",
     "Осылайша фронтенд пен сервер бөлігі Cloudflare-дың бір жарияланымында бірігеді.",
     "Егер /api/ жолын өзгертсеңіз, клиенттегі api функциясын да өзгерту керек. Content-Type қате болса, браузер JavaScript-ті орындамауы немесе CSS-ті қолданбауы мүмкін."),
    ("13. Python арқылы аналитика", "tools/feedback_analytics.py", CODE["analytics"],
     "Python функциясы пікірлердің JSON-массивін алып, пікір санын, орташа бағаны және мәртебелер санын есептейді. Ол браузердегі пайдаланушы сұрауларын емес, офлайн есептерді дайындауға арналған.",
     "Бұл код жобада Python қолданылатынын көрсетеді және қорғауға статистиканы тез дайындауға мүмкіндік береді.",
     "JSON жол түріндегі бағаны сақтаса, float оны түрлендіреді. rating кілтін өзгертсеңіз, экспорт пішімін де синхронды өзгерту керек."),
    ("14. Бейімделген мобильді беттеу", "public/portal.css", CODE["responsive"],
     "580px-ке дейінгі media query торларды бір бағанға ауыстырады, арақашықтықты азайтады және статистика карточкаларын телефонда оқылатын етеді.",
     "Онсыз desktop блоктары сығылып, iPhone және Android-та қолдануға ыңғайсыз болады.",
     "580px шегін арттырсаңыз, мобильді көрініс ертерек қосылады. Соңғы карточка ережесін жойсаңыз, ол визуалдық екпінін жоғалтады."),
]


def add_cover(doc):
    p = doc.add_paragraph(style="Title")
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("Yessenov Course Feedback System")
    set_font(r, name="Aptos Display", size=23, bold=True)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("Кодты түсіндіру құжаты\nДокумент с объяснением кода")
    set_font(r, size=13)
    p.paragraph_format.space_after = Pt(18)
    add_text(doc, "Құжатта сайттың нақты жұмыс кодынан алынған негізгі фрагменттер түсіндіріледі. Әр фрагмент үшін оның не істейтіні, не үшін қажет екені және өзгерткендегі ықтимал нәтиже берілген.", size=10.5)
    add_text(doc, "В документе разобраны реальные ключевые фрагменты рабочего кода сайта. Для каждого объяснены действие, назначение и последствия изменения.", size=10.5)
    add_text(doc, "Ескерту: құпия кілттер, токендер және жеке деректер құжатқа енгізілмеген.", italic=True, size=9.5)
    doc.add_page_break()


def add_intro(doc, lang):
    if lang == "ru":
        section_heading(doc, "Русская версия")
        add_text(doc, "Этот раздел нужен для защиты проекта: он связывает функции сайта с реальными файлами, объясняет логику и показывает, какие части нельзя менять без проверки.")
        add_table(doc, [("Файл", "Назначение")] + FILES)
        section_heading(doc, "Как читать фрагменты", 2)
        add_text(doc, "Каждый блок ниже взят из рабочего проекта или сокращён только в повторяющихся участках. Код не содержит пароли, токены и личные данные. После кода указаны три обязательные части: что делает блок, зачем он нужен и что произойдёт при изменении.")
    else:
        section_heading(doc, "Қазақша нұсқа")
        add_text(doc, "Бұл бөлім жобаны қорғауға арналған: сайт функцияларын нақты файлдармен байланыстырады, логиканы түсіндіреді және тексерусіз өзгертуге болмайтын бөліктерді көрсетеді.")
        kz_files = [("Файл", "Мақсаты")] + FILES_KK
        add_table(doc, kz_files)
        section_heading(doc, "Фрагменттерді оқу тәртібі", 2)
        add_text(doc, "Төмендегі әр блок жұмыс істейтін жобадан алынған немесе тек қайталанатын жерлері қысқартылған. Кодта құпиясөз, токен және жеке дерек жоқ. Кодтан кейін үш міндетті бөлік берілген: блок не істейді, не үшін қажет және өзгерткенде не болады.")


def add_modules(doc, modules, lang):
    labels = ("Не істейді", "Неге қажет", "Өзгертсе не болады") if lang == "kk" else ("Что делает", "Зачем нужно", "Что будет при изменении")
    for title, source, code, does, why, change in modules:
        section_heading(doc, title, 2)
        p = doc.add_paragraph()
        r = p.add_run(f"Исходный файл / Бастапқы файл: {source}")
        set_font(r, size=9, color=(76, 88, 104))
        r.italic = True
        add_code(doc, code)
        for label, text in zip(labels, (does, why, change)):
            p = doc.add_paragraph()
            r = p.add_run(label + ": ")
            set_font(r, bold=True, size=10.2)
            r = p.add_run(text)
            set_font(r, size=10.2)


def main():
    doc = Document()
    sec = doc.sections[0]
    sec.top_margin = Inches(0.65)
    sec.bottom_margin = Inches(0.65)
    sec.left_margin = Inches(0.7)
    sec.right_margin = Inches(0.7)
    setup_styles(doc)
    add_cover(doc)
    add_intro(doc, "ru")
    add_modules(doc, MODULES_RU, "ru")
    doc.add_page_break()
    add_intro(doc, "kk")
    add_modules(doc, MODULES_KK, "kk")
    doc.save(OUT)
    print(OUT)


if __name__ == "__main__":
    main()
