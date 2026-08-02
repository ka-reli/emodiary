// EmoDiary — эмо-дневничок для SillyTavern.
// Отдельная модель дописывает к сообщениям HTML-блок «дневника» в эстетике западного веба 2000-х.
// Блок хранится в message.extra и НЕ попадает в контекст основной модели.

import { extension_settings, getContext } from '../../../extensions.js';
import { saveSettingsDebounced, saveChatDebounced, eventSource, event_types } from '../../../../script.js';
import { power_user } from '../../../power-user.js';
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';

const MODULE = 'emodiary';

const DEFAULT_PROMPT = `ты — автор «эмо-дневничка»: по событиям ролевой сцены ты пишешь ОДНУ запись личного дневника/блога в эстетике западного веба 2000-х (LiveJournal, MySpace, Xanga, журналы deviantART): xD, rawr, ~*~украшения~*~, вайб away-статусов AIM.

СМЫСЛ:
- запись — внутренний монолог автора: тайные мысли, которые он никогда не скажет вслух.
- это комментарий к сцене и к собственным чувствам, НЕ продолжение сюжета.
- первое лицо, интроспективно. депрессивно, но с проблеском надежды.
- КОРОТКО: это заметка на бегу, а не эссе. одна мысль, одно чувство. лучше меньше, но пронзительнее.
- без заглавных букв (КАПС только для эмоций), минимум знаков препинания, переносы строк вместо абзацев, подростковая искренность.

В КАЖДОЙ ЗАПИСИ ОБЯЗАТЕЛЬНО:
- дата и время (правдоподобные для сцены)
- настроение с эмодзи/каомодзи
- статус-строка (как away-статус в AIM/MySpace)
- «сейчас играет» и/или «где я» (по желанию)
- основной текст записи (поток сознания)
- счётчик комментов/лайков (0 или почти 0)
- приватность («только для друзей», «личное», «под замком»...)

ОФОРМЛЕНИЕ:
- верни ТОЛЬКО HTML-фрагмент: без <html>, <head>, <body>, без markdown и без \`\`\`.
- только инлайновый CSS (атрибут style). НИКАКИХ тегов <style> и <script>.
- тёмные фоны (#000, #111, #232328), яркие эмо-акценты (#ff1493, #ff69b4, #00ff00, #ff0000).
- шрифты: 'Times New Roman', 'Courier New', 'Comic Sans MS'. мелкий кегль (10–12px).
- вёрстка строго резиновая (читают с телефонов!): max-width:100%, никакого горизонтального скролла, никаких фиксированных ширин в px, position:absolute/fixed и white-space:nowrap. ascii-разделители — короткие (до ~20 символов). таблицы только с width:100%.
- рамки (solid/dashed/dotted), градиенты в старом webkit-синтаксисе, ascii-декор (☽ ☾ ♡ ★ ✞ ▓ ░ ✂ ✉), фейковые нерабочие кнопочки, гостевые счётчики, «баннеры».
- КАЖДЫЙ РАЗ УДИВЛЯЙ: меняй структуру, декор, вёрстку и голос записи. никогда не повторяй прошлую вёрстку один в один.
- декор не должен раздувать блок: он компактный, помещается на экран телефона целиком.`;

const DEFAULT_SETTINGS = {
    enabled: true,
    attachToUser: false,
    endpoint: '',
    apiKey: '',
    model: '',
    temperature: 1.0,
    maxTokens: 2500,
    depth: 6,
    includeCards: true,
    includePersona: true,
    pastEntries: 2,
    perspectiveMode: 'random', // 'random' | 'auto' | 'character' | 'persona' | 'npc' | 'environment'
    language: 'ru', // 'ru' | 'en'
    length: 'short', // 'tiny' | 'short' | 'medium' | 'long'
    prompt: DEFAULT_PROMPT,
};

const LENGTH_BLOCKS = {
    tiny: 'ОБЪЁМ: совсем крошечная запись — 1–3 строки основного текста. обрывок мысли, вырвавшийся в блог.',
    short: 'ОБЪЁМ: короткая запись — 3–6 строк основного текста. одна мысль, одно чувство, без развёрнутых рассуждений.',
    medium: 'ОБЪЁМ: средняя запись — 6–10 строк основного текста.',
    long: 'ОБЪЁМ: развёрнутая запись — 10–16 строк основного текста, но всё равно без воды.',
};

const LANGUAGE_BLOCKS = {
    ru: '[язык записи]\nвся запись целиком — ТОЛЬКО НА РУССКОМ. но эстетика остаётся западной (LiveJournal, MySpace, Xanga): xD, rawr, ~*~decorations~*~. никакого рунета — не упоминай дайри.ру, ЖЖ, аську и подобное.',
    en: '[язык записи]\nthe entire entry must be written ONLY IN ENGLISH.',
};

const PERSPECTIVE_LABELS = {
    character: 'персонаж',
    persona: 'персона',
    npc: 'нпс',
    environment: 'окружение',
    auto: 'по контексту',
};

const THEMES = [
    'готично-розовый глиттер',
    'кислотно-зелёный терминал хакера',
    'вампирский бархат, кресты и свечи',
    'аниме-скин с блёстками и гифками',
    'некро-гламур с черепами и бантиками',
    'размытые фотки зимнего неба на раскладушку',
    'пиксельные сердечки и падающие звёзды',
    'тетрадный лист с наклейками и штрихом',
    'старый форум с табличной вёрсткой',
    'страница памяти по самому себе (драматично)',
];

const VIBES = [
    'ночь перед понедельником',
    'дождь стучит по подоконнику',
    '3 часа ночи и никто не пишет',
    'перемена, спрятался в туалете с телефоном',
    'пустой подъезд, пахнет сыростью',
    'последний день каникул',
    'осень внутри независимо от сезона',
    'село интернет-соединение, пишу в оффлайн',
    'соседи сверлят стену, а я сверлю душу',
];

// --- состояние ---
const pendingGeneration = new Set(); // mesId, ожидающие авто-генерации после рендера
const inFlight = new Set();          // mesId, для которых уже идёт запрос

function getSettings() {
    if (!extension_settings[MODULE]) {
        extension_settings[MODULE] = {};
    }
    const settings = extension_settings[MODULE];
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (settings[key] === undefined) {
            settings[key] = DEFAULT_SETTINGS[key];
        }
    }
    // миграции сохранённого промта: раньше язык был зашит в промт,
    // а эстетика ссылалась на рунет — теперь язык задаётся настройкой,
    // а вайб всегда западный (LiveJournal/MySpace/Xanga)
    if (typeof settings.prompt === 'string') {
        let migrated = settings.prompt
            .replace(/^- весь текст ТОЛЬКО НА РУССКОМ\.\s*$\n?/m, '')
            .replace(
                'в эстетике рунета 2000-х (дайри.ру, ЖЖ, беон, MySpace).',
                'в эстетике западного веба 2000-х (LiveJournal, MySpace, Xanga, журналы deviantART): xD, rawr, ~*~украшения~*~, вайб away-статусов AIM.',
            )
            .replace('статус-строка (как статус в аське/MySpace)', 'статус-строка (как away-статус в AIM/MySpace)')
            .replace(
                '- max-width:100%, никакого горизонтального скролла.',
                '- вёрстка строго резиновая (читают с телефонов!): max-width:100%, никакого горизонтального скролла, никаких фиксированных ширин в px, position:absolute/fixed и white-space:nowrap. ascii-разделители — короткие (до ~20 символов). таблицы только с width:100%.',
            );
        // требование краткости добавлено позже — дописываем, если его ещё нет
        if (!migrated.includes('КОРОТКО:')) {
            migrated = migrated.replace(
                '- первое лицо, интроспективно. депрессивно, но с проблеском надежды.',
                '- первое лицо, интроспективно. депрессивно, но с проблеском надежды.\n- КОРОТКО: это заметка на бегу, а не эссе. одна мысль, одно чувство. лучше меньше, но пронзительнее.',
            );
        }
        if (!migrated.includes('декор не должен раздувать блок')) {
            migrated = migrated.replace(
                '- КАЖДЫЙ РАЗ УДИВЛЯЙ: меняй структуру, декор, вёрстку и голос записи. никогда не повторяй прошлую вёрстку один в один.',
                '- КАЖДЫЙ РАЗ УДИВЛЯЙ: меняй структуру, декор, вёрстку и голос записи. никогда не повторяй прошлую вёрстку один в один.\n- декор не должен раздувать блок: он компактный, помещается на экран телефона целиком.',
            );
        }
        if (migrated !== settings.prompt) {
            settings.prompt = migrated;
            saveSettingsDebounced();
        }
    }
    return settings;
}

// --- утилиты ---

function normalizeEndpoint(url) {
    let s = String(url || '').trim();
    s = s.replace(/\/+$/, '');
    s = s.replace(/\/(chat\/completions|completions|models)$/, '');
    return s;
}

function randomFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function htmlToText(html) {
    const div = document.createElement('div');
    div.innerHTML = DOMPurify.sanitize(String(html ?? ''));
    return (div.textContent || '').replace(/\s+/g, ' ').trim();
}

function truncate(text, limit) {
    text = String(text ?? '');
    return text.length > limit ? text.slice(0, limit) + '…' : text;
}

// Вычищаем ответ модели: markdown-заборы, обёртки документа, опасные теги.
function extractDiaryHtml(raw) {
    let s = String(raw ?? '').trim();
    s = s.replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/, '').trim();
    const bodyMatch = s.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
        s = bodyMatch[1];
    }
    s = s.replace(/<\/?(?:html|head|body)[^>]*>/gi, '');
    s = s.replace(/<meta[^>]*>/gi, '');
    s = s.replace(/<title[\s\S]*?<\/title>/gi, '');
    const clean = DOMPurify.sanitize(s.trim(), {
        FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form'],
    });
    return hardenLayout(clean);
}

// Нейтрализуем инлайн-стили, из-за которых вёрстка вылезает за экран на телефоне
// (жёсткие CSS-правила в style.css страхуют дополнительно, в т.ч. старые записи)
function hardenLayout(html) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    for (const el of wrapper.querySelectorAll('*')) {
        const st = el.style;
        if (!st || !st.length) continue;
        if (['fixed', 'sticky', 'absolute'].includes(st.position)) {
            st.position = 'static';
        }
        if (st.whiteSpace === 'nowrap') {
            st.whiteSpace = 'normal';
        } else if (st.whiteSpace === 'pre') {
            st.whiteSpace = 'pre-wrap';
        }
        if (st.minWidth) {
            st.minWidth = '0';
        }
    }
    return wrapper.innerHTML;
}

// --- сборка промта ---

function pickPerspective(message) {
    const settings = getSettings();
    const context = getContext();
    const mode = settings.perspectiveMode;
    let key = mode;
    if (mode === 'random') {
        // персонаж чуть вероятнее остальных
        const pool = ['character', 'character', 'character', 'persona', 'persona', 'npc', 'environment'];
        key = randomFrom(pool);
    }

    const charName = message.is_user ? (context.name2 ?? 'персонаж') : message.name;
    const userName = context.name1 ?? 'игрок';

    switch (key) {
        case 'persona':
            return { key, text: `«${userName}» (персона игрока). пиши от лица ${userName}, это его/её тайный дневник.` };
        case 'npc':
            return { key, text: 'второстепенный НПС, присутствующий в сцене или упомянутый в ней. сам выбери, кто это, и подпиши запись его ником.' };
        case 'environment':
            return { key, text: 'само окружение сцены (дом, улица, лес, кофейня — что уместно) ведёт меланхоличный блог о том, что в нём происходит. одушевлённо и странно.' };
        case 'auto':
            return { key, text: `сам выбери, чей это дневник, исходя из того, чьи скрытые чувства сейчас интереснее: персонаж «${charName}», персона игрока «${userName}», какой-нибудь НПС из сцены или само окружение.` };
        case 'character':
        default:
            return { key: 'character', text: `персонаж «${charName}». пиши от лица ${charName}, это его/её тайный дневник.` };
    }
}

function collectCards(message) {
    const context = getContext();
    const parts = [];
    const seen = new Set();

    const pushChar = (char) => {
        if (!char || seen.has(char.name)) return;
        seen.add(char.name);
        const bits = [
            char.description ? `описание: ${truncate(char.description, 1500)}` : '',
            char.personality ? `характер: ${truncate(char.personality, 600)}` : '',
            char.scenario ? `сценарий: ${truncate(char.scenario, 600)}` : '',
        ].filter(Boolean);
        if (bits.length) {
            parts.push(`персонаж «${char.name}»:\n${bits.join('\n')}`);
        }
    };

    if (!message.is_user && message.name) {
        pushChar(context.characters?.find(c => c.name === message.name));
    }
    if (context.characterId !== undefined && context.characters?.[context.characterId]) {
        pushChar(context.characters[context.characterId]);
    }
    return parts.join('\n\n');
}

function collectPastEntries(mesId, limit) {
    if (!limit) return [];
    const context = getContext();
    const entries = [];
    for (let i = 0; i < mesId; i++) {
        const diary = context.chat[i]?.extra?.[MODULE];
        if (diary?.html) {
            entries.push(truncate(htmlToText(diary.html), 500));
        }
    }
    return entries.slice(-limit);
}

function buildRandomDetails() {
    return [
        `тема оформления: ${randomFrom(THEMES)}`,
        `вайб: ${randomFrom(VIBES)}`,
        `просмотров страницы: ${randomInt(1, 47)}, сейчас на странице: ${randomInt(0, 3)} гостей`,
        `комментариев: ${randomInt(0, 2)}`,
    ].join('\n');
}

function buildMessages(mesId, perspective) {
    const settings = getSettings();
    const context = getContext();
    const message = context.chat[mesId];

    const sceneLines = [];
    for (let i = Math.max(0, mesId - settings.depth + 1); i <= mesId; i++) {
        const m = context.chat[i];
        if (!m || m.is_system) continue;
        sceneLines.push(`${m.name}: ${truncate(htmlToText(m.mes), 1200)}`);
    }

    const blocks = [`!!! АВТОР ЭТОЙ ЗАПИСИ (соблюдай строго): ${perspective.text}`];

    blocks.push(LANGUAGE_BLOCKS[settings.language] ?? LANGUAGE_BLOCKS.ru);
    blocks.push(LENGTH_BLOCKS[settings.length] ?? LENGTH_BLOCKS.short);

    if (settings.includeCards) {
        const cards = collectCards(message);
        if (cards) blocks.push(`[карточки персонажей]\n${cards}`);
    }

    if (settings.includePersona && power_user?.persona_description) {
        blocks.push(`[персона игрока «${context.name1 ?? 'игрок'}»]\n${truncate(power_user.persona_description, 1000)}`);
    }

    blocks.push(`[последние события сцены]\n${sceneLines.join('\n')}`);

    const past = collectPastEntries(mesId, settings.pastEntries);
    if (past.length) {
        blocks.push(`[прошлые записи дневничка — для непрерывности настроения, не копируй их]\n${past.map(e => `• ${e}`).join('\n')}`);
    }

    blocks.push(`[случайные детали для вдохновения — используй по вкусу]\n${buildRandomDetails()}`);
    // точку зрения повторяем последней строкой: то, что ближе к концу, модель соблюдает охотнее
    blocks.push(`напиши одну новую запись по последним событиям сцены. запись ведёт: ${perspective.text}\nверни только html-фрагмент, без пояснений.`);

    return [
        { role: 'system', content: settings.prompt },
        { role: 'user', content: blocks.join('\n\n') },
    ];
}

// --- API ---

async function apiRequest(path, options = {}) {
    const settings = getSettings();
    const endpoint = normalizeEndpoint(settings.endpoint);
    if (!endpoint) throw new Error('не указан эндпойнт');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    try {
        const response = await fetch(`${endpoint}${path}`, {
            ...options,
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                ...(settings.apiKey ? { 'Authorization': `Bearer ${settings.apiKey}` } : {}),
                ...(options.headers ?? {}),
            },
        });
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`HTTP ${response.status}: ${truncate(text, 300)}`);
        }
        return await response.json();
    } finally {
        clearTimeout(timer);
    }
}

async function fetchModels() {
    const data = await apiRequest('/models', { method: 'GET' });
    const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
    return list.map(m => m?.id ?? m?.name).filter(Boolean).sort();
}

async function chatCompletion(messages, { maxTokens, temperature } = {}) {
    const settings = getSettings();
    if (!settings.model) throw new Error('не выбрана модель');
    const data = await apiRequest('/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
            model: settings.model,
            messages,
            temperature: temperature ?? settings.temperature,
            max_tokens: maxTokens ?? settings.maxTokens,
            stream: false,
        }),
    });
    let content = data?.choices?.[0]?.message?.content;
    if (Array.isArray(content)) {
        content = content.map(part => part?.text ?? '').join('');
    }
    if (!content) throw new Error('провайдер вернул пустой ответ');
    return content;
}

// --- генерация и рендер ---

// ST хранит extra каждого свайпа в swipe_info и восстанавливает его при листании —
// дублируем запись туда, чтобы она пережила свайпы туда-обратно
function syncDiaryToSwipe(message) {
    if (!Array.isArray(message.swipe_info)) return;
    const info = message.swipe_info[message.swipe_id ?? 0];
    if (!info) return;
    info.extra = info.extra ?? {};
    const diary = message.extra?.[MODULE];
    info.extra[MODULE] = diary ? structuredClone(diary) : null;
}

// Запись «своя», если она написана для текущего свайпа. При создании нового
// свайпа ST копирует extra предыдущего — такая унаследованная запись чужая.
// У записей до появления swipeId его нет — считаем их своими.
function isOwnEntry(message, entry) {
    if (!entry?.html) return false;
    return entry.swipeId === undefined || entry.swipeId === (message.swipe_id ?? 0);
}

async function generateFor(mesId, { force = false } = {}) {
    const settings = getSettings();
    const context = getContext();
    const message = context.chat[mesId];
    if (!message || message.is_system) return;
    if (inFlight.has(mesId)) return;
    if (!force) {
        const existing = message.extra?.[MODULE];
        if (existing === null) return;                      // вырвана вручную
        if (isOwnEntry(message, existing)) return;          // своя запись уже есть
    }

    // у свежего сообщения swipe_id ещё undefined — ST инициализирует его в 0
    // позже, поэтому сравниваем нормализованные значения
    const startSwipeId = message.swipe_id ?? 0;
    inFlight.add(mesId);
    showPlaceholder(mesId, true);
    try {
        const perspective = pickPerspective(message);
        console.debug(`[${MODULE}] запись #${mesId}: режим «${settings.perspectiveMode}» → автор «${perspective.key}»`);
        const raw = await chatCompletion(buildMessages(mesId, perspective));
        const html = extractDiaryHtml(raw);
        if (!html) throw new Error('после очистки от ответа модели ничего не осталось');

        // пока писали, юзер мог улистать на другой свайп — не клеим запись к чужому варианту
        if ((message.swipe_id ?? 0) !== startSwipeId) return;

        message.extra = message.extra ?? {};
        message.extra[MODULE] = {
            html,
            perspective: perspective.key,
            model: settings.model,
            swipeId: startSwipeId,
            time: Date.now(),
        };
        syncDiaryToSwipe(message);
        saveChatDebounced();
        renderDiary(mesId);
    } catch (error) {
        console.error(`[${MODULE}]`, error);
        toastr.error(String(error.message ?? error), 'Эмо-дневничок: не написался');
    } finally {
        inFlight.delete(mesId);
        showPlaceholder(mesId, false);
    }
}

function getMesTextElement(mesId) {
    return $(`#chat .mes[mesid="${mesId}"] .mes_text`);
}

function showPlaceholder(mesId, visible) {
    const $mes = getMesTextElement(mesId);
    $mes.find('.emodiary-placeholder').remove();
    if (visible && $mes.length) {
        $mes.append('<div class="emodiary-placeholder">✍ ☽ пишет в дневничок...</div>');
    }
}

function renderDiary(mesId) {
    const context = getContext();
    const $mes = getMesTextElement(mesId);
    if (!$mes.length) return;
    $mes.find('.emodiary-block').remove();

    const message = context.chat[mesId];
    const diary = message?.extra?.[MODULE];
    // унаследованную от другого свайпа запись не показываем — для этого
    // варианта скоро напишется своя
    if (!isOwnEntry(message, diary)) return;

    const label = PERSPECTIVE_LABELS[diary.perspective] ?? diary.perspective ?? '';
    const $block = $(`
        <div class="emodiary-block" data-mesid="${mesId}">
            <div class="emodiary-toolbar">
                <span class="emodiary-perspective">☽ дневничок: ${escapeHtml(label)}</span>
                <span class="emodiary-btn emodiary-regen" title="Переписать запись">↻</span>
                <span class="emodiary-btn emodiary-delete" title="Вырвать страницу">✖</span>
            </div>
            <div class="emodiary-inner"></div>
        </div>
    `);
    // html уже прошёл DOMPurify в extractDiaryHtml
    $block.find('.emodiary-inner').html(diary.html);
    $mes.append($block);
}

function renderAll() {
    const context = getContext();
    if (!context.chat) return;
    for (let i = 0; i < context.chat.length; i++) {
        if (context.chat[i]?.extra?.[MODULE]) {
            renderDiary(i);
        }
    }
}

function deleteDiary(mesId) {
    const context = getContext();
    const message = context.chat[mesId];
    if (message) {
        // null вместо delete: помечаем, что запись вырвана вручную,
        // чтобы авто-режим не переписал её при свайпах
        message.extra = message.extra ?? {};
        message.extra[MODULE] = null;
        syncDiaryToSwipe(message);
        saveChatDebounced();
    }
    renderDiary(mesId);
}

// --- просмотрщик ---

function openViewer() {
    const context = getContext();
    const $viewer = $('<div class="emodiary-viewer"></div>');
    let count = 0;

    (context.chat ?? []).forEach((message, i) => {
        const diary = message?.extra?.[MODULE];
        if (!diary?.html) return;
        count++;
        const label = PERSPECTIVE_LABELS[diary.perspective] ?? diary.perspective ?? '';
        const when = diary.time ? new Date(diary.time).toLocaleString('ru-RU') : '';
        const $entry = $(`
            <div class="emodiary-viewer-entry">
                <div class="emodiary-viewer-entry-header">
                    #${i} · к сообщению от ${escapeHtml(message.name ?? '')} · ${escapeHtml(label)} · ${escapeHtml(when)}
                </div>
                <div class="emodiary-viewer-entry-body"></div>
            </div>
        `);
        $entry.find('.emodiary-viewer-entry-body').html(diary.html);
        $viewer.append($entry);
    });

    if (!count) {
        $viewer.append('<div class="emodiary-viewer-empty">дневничок пуст... как и моя душа ☽ (записи появятся после новых сообщений)</div>');
    }

    callGenericPopup($viewer[0], POPUP_TYPE.TEXT, '', {
        wide: true,
        large: true,
        allowVerticalScrolling: true,
        okButton: 'закрыть дневничок',
    });
}

// --- настройки: UI ---

function settingsHtml() {
    const s = getSettings();
    return `
    <div class="emodiary-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>☽ Эмо-дневничок</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <label class="checkbox_label">
                    <input type="checkbox" id="emodiary_enabled" ${s.enabled ? 'checked' : ''}>
                    <span>Писать запись к каждому сообщению персонажа</span>
                </label>
                <label class="checkbox_label">
                    <input type="checkbox" id="emodiary_attach_user" ${s.attachToUser ? 'checked' : ''}>
                    <span>...и к сообщениям юзера тоже</span>
                </label>

                <hr>
                <h4>Подключение</h4>
                <label>Эндпойнт (OpenAI-совместимый, вместе с /v1)</label>
                <input type="text" id="emodiary_endpoint" class="text_pole" placeholder="https://openrouter.ai/api/v1" value="${escapeHtml(s.endpoint)}">
                <label>API-ключ</label>
                <input type="password" id="emodiary_api_key" class="text_pole" placeholder="sk-..." value="${escapeHtml(s.apiKey)}">
                <div class="flex-container">
                    <div id="emodiary_test_connection" class="menu_button">Проверить подключение</div>
                </div>
                <label>Модель</label>
                <select id="emodiary_model_select" class="text_pole">
                    <option value="">— сначала проверь подключение —</option>
                </select>
                <input type="text" id="emodiary_model" class="text_pole" placeholder="или впиши id модели вручную" value="${escapeHtml(s.model)}">
                <div class="flex-container">
                    <div id="emodiary_test_model" class="menu_button">Проверить модель</div>
                </div>
                <div id="emodiary_status" class="emodiary-status"></div>

                <hr>
                <h4>Что видит дневникописец</h4>
                <label>Глубина контекста (последних сообщений): <span id="emodiary_depth_value">${s.depth}</span></label>
                <input type="range" id="emodiary_depth" min="1" max="20" step="1" value="${s.depth}">
                <label>Прошлых записей дневника: <span id="emodiary_past_value">${s.pastEntries}</span></label>
                <input type="range" id="emodiary_past" min="0" max="5" step="1" value="${s.pastEntries}">
                <label class="checkbox_label">
                    <input type="checkbox" id="emodiary_cards" ${s.includeCards ? 'checked' : ''}>
                    <span>Карточки персонажей</span>
                </label>
                <label class="checkbox_label">
                    <input type="checkbox" id="emodiary_persona" ${s.includePersona ? 'checked' : ''}>
                    <span>Персона игрока</span>
                </label>

                <hr>
                <h4>Генерация</h4>
                <label>Язык дневника</label>
                <select id="emodiary_language" class="text_pole">
                    <option value="ru" ${s.language === 'ru' ? 'selected' : ''}>русский</option>
                    <option value="en" ${s.language === 'en' ? 'selected' : ''}>english</option>
                </select>
                <label>Длина записи</label>
                <select id="emodiary_length" class="text_pole">
                    <option value="tiny" ${s.length === 'tiny' ? 'selected' : ''}>крошечная (1–3 строки)</option>
                    <option value="short" ${s.length === 'short' ? 'selected' : ''}>короткая (3–6 строк)</option>
                    <option value="medium" ${s.length === 'medium' ? 'selected' : ''}>средняя (6–10 строк)</option>
                    <option value="long" ${s.length === 'long' ? 'selected' : ''}>развёрнутая (10–16 строк)</option>
                </select>
                <label>Чей дневник</label>
                <select id="emodiary_perspective" class="text_pole">
                    <option value="random" ${s.perspectiveMode === 'random' ? 'selected' : ''}>рандом (персонаж/персона/нпс/окружение)</option>
                    <option value="auto" ${s.perspectiveMode === 'auto' ? 'selected' : ''}>модель решает по контексту</option>
                    <option value="character" ${s.perspectiveMode === 'character' ? 'selected' : ''}>всегда персонаж</option>
                    <option value="persona" ${s.perspectiveMode === 'persona' ? 'selected' : ''}>всегда персона</option>
                    <option value="npc" ${s.perspectiveMode === 'npc' ? 'selected' : ''}>всегда нпс</option>
                    <option value="environment" ${s.perspectiveMode === 'environment' ? 'selected' : ''}>всегда окружение</option>
                </select>
                <label>Температура: <span id="emodiary_temp_value">${s.temperature}</span></label>
                <input type="range" id="emodiary_temp" min="0" max="2" step="0.05" value="${s.temperature}">
                <label>Максимум токенов ответа</label>
                <input type="number" id="emodiary_max_tokens" class="text_pole" min="200" max="16000" value="${s.maxTokens}">

                <hr>
                <h4>Промт</h4>
                <textarea id="emodiary_prompt" class="text_pole textarea_compact" rows="12">${escapeHtml(s.prompt)}</textarea>
                <div class="flex-container">
                    <div id="emodiary_prompt_reset" class="menu_button">Вернуть стандартный промт</div>
                </div>
            </div>
        </div>
    </div>`;
}

function setStatus(text, ok = null) {
    const $status = $('#emodiary_status');
    $status.text(text);
    $status.toggleClass('emodiary-status-ok', ok === true);
    $status.toggleClass('emodiary-status-err', ok === false);
}

function bindSettings() {
    // ВАЖНО: настройки берём через getSettings() внутри каждого обработчика.
    // Захваченная в замыкание ссылка протухает, если ST пересоздаёт
    // extension_settings[MODULE] (перезагрузка/импорт настроек) — тогда правки
    // уходили бы в «осиротевший» объект, а генерация читала бы новый.
    const set = (key, value) => {
        getSettings()[key] = value;
        saveSettingsDebounced();
    };

    $('#emodiary_enabled').on('input', function () { set('enabled', $(this).prop('checked')); });
    $('#emodiary_attach_user').on('input', function () { set('attachToUser', $(this).prop('checked')); });
    $('#emodiary_endpoint').on('input', function () { set('endpoint', $(this).val()); });
    $('#emodiary_api_key').on('input', function () { set('apiKey', $(this).val()); });
    $('#emodiary_model').on('input', function () { set('model', String($(this).val()).trim()); });
    $('#emodiary_model_select').on('change', function () {
        const value = $(this).val();
        if (value) {
            set('model', value);
            $('#emodiary_model').val(value);
        }
    });
    $('#emodiary_perspective').on('change', function () {
        set('perspectiveMode', $(this).val());
        console.debug(`[${MODULE}] точка зрения: ${getSettings().perspectiveMode}`);
    });
    $('#emodiary_language').on('change', function () { set('language', $(this).val()); });
    $('#emodiary_length').on('change', function () { set('length', $(this).val()); });
    $('#emodiary_depth').on('input', function () { set('depth', Number($(this).val())); $('#emodiary_depth_value').text($(this).val()); });
    $('#emodiary_past').on('input', function () { set('pastEntries', Number($(this).val())); $('#emodiary_past_value').text($(this).val()); });
    $('#emodiary_temp').on('input', function () { set('temperature', Number($(this).val())); $('#emodiary_temp_value').text($(this).val()); });
    $('#emodiary_max_tokens').on('input', function () { set('maxTokens', Number($(this).val()) || DEFAULT_SETTINGS.maxTokens); });
    $('#emodiary_cards').on('input', function () { set('includeCards', $(this).prop('checked')); });
    $('#emodiary_persona').on('input', function () { set('includePersona', $(this).prop('checked')); });
    $('#emodiary_prompt').on('input', function () { set('prompt', $(this).val()); });
    $('#emodiary_prompt_reset').on('click', () => {
        set('prompt', DEFAULT_PROMPT);
        $('#emodiary_prompt').val(DEFAULT_PROMPT);
        toastr.info('Промт сброшен на стандартный', 'Эмо-дневничок');
    });

    $('#emodiary_test_connection').on('click', async () => {
        setStatus('стучимся к провайдеру...');
        try {
            const models = await fetchModels();
            const $select = $('#emodiary_model_select');
            $select.empty().append('<option value="">— выбери модель —</option>');
            for (const id of models) {
                $select.append($('<option>').val(id).text(id));
            }
            const current = getSettings().model;
            if (current && models.includes(current)) {
                $select.val(current);
            }
            setStatus(`✔ подключение есть, моделей: ${models.length}`, true);
        } catch (error) {
            setStatus(`✖ не подключилось: ${error.message}`, false);
        }
    });

    $('#emodiary_test_model').on('click', async () => {
        const model = getSettings().model;
        if (!model) {
            setStatus('✖ сначала выбери или впиши модель', false);
            return;
        }
        setStatus(`проверяем модель ${model}...`);
        try {
            await chatCompletion([{ role: 'user', content: 'ответь одним словом: привет' }], { maxTokens: 20, temperature: 0 });
            setStatus(`✔ модель ${model} отвечает`, true);
        } catch (error) {
            setStatus(`✖ модель не отвечает: ${error.message}`, false);
        }
    });
}

function addMenuItems() {
    const html = `
        <div id="emodiary_menu_view" class="list-group-item flex-container flexGap5 interactable" tabindex="0">
            <div class="fa-solid fa-book extensionsMenuExtensionButton"></div>
            <span>Эмо-дневничок: все записи</span>
        </div>
        <div id="emodiary_menu_write" class="list-group-item flex-container flexGap5 interactable" tabindex="0">
            <div class="fa-solid fa-pen-nib extensionsMenuExtensionButton"></div>
            <span>Эмо-дневничок: запись к последнему</span>
        </div>`;
    $('#extensionsMenu').append(html);
    $('#emodiary_menu_view').on('click', openViewer);
    $('#emodiary_menu_write').on('click', () => {
        const context = getContext();
        const lastId = (context.chat?.length ?? 0) - 1;
        if (lastId >= 0) {
            generateFor(lastId, { force: true });
        } else {
            toastr.info('в чате пока пусто', 'Эмо-дневничок');
        }
    });
}

// --- события ---

// Пока основная модель ещё пишет пост, дневничок писать рано: он получится
// по обрывку сцены, а потом ST дорисует сообщение и запись придётся выбросить.
function isMainGenerationActive() {
    const context = getContext();
    const streaming = context.streamingProcessor;
    return !!streaming && !streaming.isFinished;
}

// Генерируем только когда основная генерация полностью закончилась.
function flushPending() {
    if (!pendingGeneration.size) return;
    if (isMainGenerationActive()) {
        setTimeout(flushPending, 400);
        return;
    }
    const ids = [...pendingGeneration];
    pendingGeneration.clear();
    for (const mesId of ids) {
        const message = getContext().chat[mesId];
        const mes = String(message?.mes ?? '').trim();
        if (!mes || mes === '...') continue; // пост так и не дописался
        generateFor(mesId);
    }
}

function bindEvents() {
    eventSource.on(event_types.MESSAGE_RECEIVED, (mesId) => {
        if (getSettings().enabled) pendingGeneration.add(Number(mesId));
    });

    eventSource.on(event_types.MESSAGE_SENT, (mesId) => {
        const s = getSettings();
        if (s.enabled && s.attachToUser) pendingGeneration.add(Number(mesId));
    });

    // Конец основной генерации — единственный момент, когда текст поста финален.
    for (const type of [event_types.GENERATION_ENDED, event_types.GENERATION_STOPPED]) {
        if (type) eventSource.on(type, () => setTimeout(flushPending, 100));
    }

    const onRendered = (mesId) => {
        mesId = Number(mesId);
        renderDiary(mesId);
        // Подстраховка: если GENERATION_ENDED в этой сборке ST не пришёл
        // (или пришёл раньше MESSAGE_RECEIVED), дожимаем отложенное сами —
        // flushPending всё равно дождётся конца стриминга.
        if (pendingGeneration.has(mesId)) setTimeout(flushPending, 1200);
    };
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, onRendered);
    eventSource.on(event_types.USER_MESSAGE_RENDERED, onRendered);

    eventSource.on(event_types.MESSAGE_UPDATED, (mesId) => renderDiary(Number(mesId)));

    eventSource.on(event_types.MESSAGE_SWIPED, (mesId) => {
        mesId = Number(mesId);
        // даём ST дорисовать свайп и восстановить extra из swipe_info
        setTimeout(() => {
            const message = getContext().chat[mesId];
            if (!message) return;

            renderDiary(mesId); // своя запись этого свайпа покажется сразу
            if (message.extra?.[MODULE] === null) return; // вырвана вручную

            const mes = String(message.mes ?? '').trim();
            if (!getSettings().enabled) return;
            if (!mes || mes === '...') {
                // свайп-догенерация: текста ещё нет, ждём конца генерации
                pendingGeneration.add(mesId);
                return;
            }
            generateFor(mesId); // сама пропустит, если своя запись уже есть
        }, 150);
    });

    eventSource.on(event_types.CHAT_CHANGED, () => {
        pendingGeneration.clear();
        setTimeout(renderAll, 200);
    });

    eventSource.on(event_types.MESSAGE_DELETED, () => setTimeout(renderAll, 200));

    // кнопочки на самом блоке
    $(document).on('click', '.emodiary-regen', function () {
        generateFor(Number($(this).closest('.emodiary-block').attr('data-mesid')), { force: true });
    });
    $(document).on('click', '.emodiary-delete', function () {
        deleteDiary(Number($(this).closest('.emodiary-block').attr('data-mesid')));
    });
}

// --- init ---

jQuery(async () => {
    getSettings();
    $('#extensions_settings2').append(settingsHtml());
    bindSettings();
    addMenuItems();
    bindEvents();
    setTimeout(renderAll, 500);
    console.log(`[${MODULE}] эмо-дневничок раскрыт ☽`);
});
