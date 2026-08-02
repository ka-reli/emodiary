// EmoDiary — эмо-дневничок для SillyTavern.
// Отдельная модель дописывает к сообщениям HTML-блок «дневника» в эстетике западного веба 2000-х.
// Блок хранится в message.extra и НЕ попадает в контекст основной модели.

import { extension_settings, getContext } from '../../../extensions.js';
import { saveSettingsDebounced, saveChatDebounced, eventSource, event_types } from '../../../../script.js';
import { power_user } from '../../../power-user.js';
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';

const MODULE = 'emodiary';

const DEFAULT_PROMPT = `you write ONE personal diary/blog entry reacting to a roleplay scene, in the aesthetic of the 2000s western web (LiveJournal, MySpace, Xanga, deviantART journals): xD, rawr, ~*~decorations~*~, AIM away-message energy.

MEANING:
- the entry is the author's inner monologue: secret thoughts they would never say out loud.
- it comments on the scene and on their own feelings. it does NOT advance the plot.
- first person, introspective. depressive but with a spark of hope.
- SHORT: a note scribbled in a hurry, not an essay. one thought, one feeling. less but sharper.
- no capital letters (CAPS only for emphasis), minimal punctuation, line breaks instead of paragraphs, raw teenage honesty.

EVERY ENTRY MUST INCLUDE:
- date and time (plausible for the scene)
- mood with emoji/kaomoji
- a status line (like an AIM away message)
- "now playing" and/or "where i am" (optional)
- the main entry text (stream of consciousness)
- comment/like counter (0 or almost 0)
- privacy setting ("friends only", "private", "locked"...)

MARKUP:
- return ONLY an html fragment: no <html>, <head>, <body>, no markdown, no \`\`\`.
- inline CSS only (style attribute). NO <style> and NO <script> tags.
- dark backgrounds (#000, #111, #232328), bright emo accents (#ff1493, #ff69b4, #00ff00, #ff0000).
- fonts: 'Times New Roman', 'Courier New', 'Comic Sans MS'. small sizes (10-12px).
- layout must be strictly fluid (people read this on phones!): max-width:100%, no horizontal scroll, no fixed px widths, no position:absolute/fixed, no white-space:nowrap. keep ascii dividers short (~20 chars). tables only with width:100%.
- borders (solid/dashed/dotted), old webkit gradients, ascii decor (☽ ☾ ♡ ★ ✞ ▓ ░ ✂ ✉), fake buttons, guest counters, "banners".
- fake UI (buttons, inputs, "submit", nav links) is PURE DECORATION and does nothing. never put a real url in href. no <img> tags — there are no real images, fake them with ascii, emoji and gradients.
- SECRETS: hide 1-2 of the most private confessions inside <details><summary>lure</summary>the secret</details>, styled to match the block. this is the ONLY thing that reacts to a click. the lure is a warning, a dare or a plea, and it must be different every time: "do not open", "secret", "not for you", "read at your own risk", "i'll regret writing this", "click if you dare", "🔒 locked", "delete this later", "nobody look". NEVER use blogging jargon like "cut", "under the cut", "read more", "keep reading", "expand".
- SURPRISE EVERY TIME: vary structure, decor, layout and voice. never repeat the previous layout.
- decor must not bloat the block: it stays compact and fits a phone screen.`;

// Русский промт из прежних версий — нужен, чтобы отличить нетронутый
// дефолт (его молча меняем на английский) от промта, который правила пользователь.
const LEGACY_RU_PROMPT = `ты — автор «эмо-дневничка»: по событиям ролевой сцены ты пишешь ОДНУ запись личного дневника/блога в эстетике западного веба 2000-х (LiveJournal, MySpace, Xanga, журналы deviantART): xD, rawr, ~*~украшения~*~, вайб away-статусов AIM.

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
    apiSource: 'custom', // 'custom' | 'profile'
    profileId: '',
    profileModel: '', // пусто = модель, зашитая в профиль
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
    styleMode: 'random', // 'random' | ключ из STYLES
    enabledStyles: null, // массив ключей STYLES; null = все
    comments: true,
    commentsCount: 'auto', // 'auto' (2-3) | '1' | '2' | '3' | '4'
    prompt: DEFAULT_PROMPT,
};

const LENGTH_BLOCKS = {
    tiny: '[LENGTH]\ntiny entry: 1-3 lines of body text. a scrap of a thought that escaped into the blog.',
    short: '[LENGTH]\nshort entry: 3-6 lines of body text. one thought, one feeling, no long reasoning.',
    medium: '[LENGTH]\nmedium entry: 6-10 lines of body text.',
    long: '[LENGTH]\nlonger entry: 10-16 lines of body text, still no filler.',
};

const LANGUAGE_BLOCKS = {
    ru: '[LANGUAGE]\nevery word visible inside the block (entry, mood, status, tags, comments, buttons, counters) must be in RUSSIAN. the aesthetic stays western (LiveJournal, MySpace, Xanga) — never reference the russian web (diary.ru, LiveJournal-ru slang, ICQ).',
    en: '[LANGUAGE]\nevery word visible inside the block must be in ENGLISH.',
};

// Стили оформления. Каждый — отдельная «шкура» страницы, из которых
// расширение случайно выбирает одну на запись.
const STYLES = {
    emo2000s: {
        label: 'эмо-дневничок 2000-х',
        prompt: 'classic 2000s emo diary entry: near-black page, hot pink / acid green accents, glitter gradients, kaomoji, ascii hearts and stars, a "friends only" lock, a tiny hit counter. angsty and sincere.',
    },
    tumblr: {
        label: 'tumblr-блог (максимализм)',
        prompt: `a 2012-2014 tumblr blog page, maximalist and cluttered — build the WHOLE page chrome, not just the post:
- header banner with the blog title in a fancy oversized font, a round avatar, a fake "follow" button, and a tiny nav row (home / ask / archive / theme credit).
- a description block under the header with a quote and a divider like ◤◢◤◢ or ✧･ﾟ*.
- the entry itself framed as a tumblr text post, with a reblog/like row and a notes counter (keep it low: "7 notes").
- MANDATORY "now playing ♫" line: track and artist rendered as a tiny music player widget with a fake progress bar and ⏮ ▶ ⏭ controls.
- a run-on line of at least 5 lowercase #tags at the bottom in a muted color, self-deprecating (#personal #delete later #no one reads this ...).
- pile on the decoration: pastel-goth or grunge palette, sparkles (✧･ﾟ ⋆｡°✩), text-shadow glow, letter-spacing tricks, semi-transparent overlay boxes, gradient borders, tiny 9-10px text, a fake "cursor trail" note.`,
    },
    deviantart: {
        label: 'журнал deviantART',
        prompt: 'a deviantART journal skin: boxed journal frame with a decorated header, a watchers/pageviews row, fake "add to favourites" and "comment" buttons, a signature banner at the bottom, links to "my gallery" and "my prints" that go nowhere. slightly self-important artist voice.',
    },
    xanga: {
        label: 'Xanga + eProps',
        prompt: 'a Xanga post: a header strip with the username, an eProps counter and a fake "give eProps" button, explicit "current mood / current music / currently reading" rows at the top, a subscribe box, and a comment count. cluttered pastel-on-dark theme.',
    },
    geocities: {
        label: 'домашняя страничка GeoCities',
        prompt: 'a GeoCities-era personal homepage: "under construction" ascii/emoji banner, a visitor counter with odometer digits, "sign my guestbook" and "email me" buttons, a midi player note ("♫ midi: track.mid — turn your speakers on"), "best viewed in 800x600 with Netscape", tiled-looking background emulated with gradients, rainbow horizontal rules.',
    },
    aim: {
        label: 'away-сообщение AIM',
        prompt: 'an AIM away message window: a small chat-window frame with a title bar and fake ⊡ ✕ buttons, the screen name in bold, an away message that is mostly song lyrics plus one devastating line, a timestamp, and "auto-response sent to 0 people". keep it SMALL — this is a window, not a page.',
    },
    notebook: {
        label: 'тетрадный листок',
        prompt: 'a page torn from a school notebook: light lined/grid paper (emulate ruling with repeating-linear-gradient), handwriting-ish font, a red margin line, doodles and hearts in the margins, words crossed out with strikethrough and rewritten, ink smudges implied, a "DO NOT READ!!!" warning at the top. dark text on paper — this style is the one exception to dark backgrounds.',
    },
    forum: {
        label: 'пост на форуме',
        prompt: 'a 2000s forum post: table-ish layout with an author column on the left (avatar made of ascii, rank "Veteran", "Posts: 1337", join date) and the post body on the right, a subject line, a quote box quoting someone from the scene, and a signature block under a horizontal rule with an edgy quote. fake "quote / reply / report" buttons.',
    },
    myspace: {
        label: 'профиль MySpace',
        prompt: 'a MySpace profile: profile pic box, "in a mood: ..." line, an autoplay song widget note ("♫ this song plays automatically, sorry"), a "Top 8" friends grid where half the slots are empty or say "[deleted]", a blurbs/about-me section, and the blog entry itself pasted below. loud custom-css look: clashing colors, tiled background emulation, tiny unreadable text.',
    },
    playlist: {
        label: 'плейлист / микстейп',
        prompt: 'the entry disguised as a mixtape tracklist: a cassette/CD header with a handwritten-looking title, a numbered tracklist where each track has an artist, a title, a duration, and a one-line annotation confessing what that track is really about ("this one is about him"). the diary content lives in those annotations. a fake "burn to CD" button.',
    },
    grimoire: {
        label: 'гримуар / письмо счастья',
        prompt: 'a cursed chain-letter grimoire post: black page, blood-red and bone-white text, gothic dividers (✞ ☠ ✧), the entry written as a ritual or spell ("i am writing this at 3:33 am"), a warning that the reader must repost this within 13 minutes or something terrible happens, a fake counter of how many people have already reposted, and a small print disclaimer. melodramatic and superstitious.',
    },
};

const DEFAULT_ENABLED_STYLES = Object.keys(STYLES);

// Никнеймы постоянных комментаторов подбирает код, а не модель, — так состав
// «подписчиков» стабилен и его можно сохранить в записи.
const COMMENTER_NICKS = [
    'xXbleedingroseXx', 'sk8rboi_92', 'DarkAngel666', 'kawaii_ghost', 'notoktbh',
    'vampirekisses', 'glittercore', 'emo_kid_4ever', 'razorblade_romance', 'xXlostsoulXx',
    'cyber_tears', 'moonchild_1989', 'plushiedeath', 'static_hearts', 'anon_lurker',
    'brokenxdoll', 'neonpuke', 'gh0stgurl', 'iheartmychem', 'sadb0y2004',
    'crimson_lullaby', 'x_nevermore_x', 'pixelgrave', 'tearstainedxo', 'blink182fan4life',
];

const PERSPECTIVE_LABELS = {
    character: 'персонаж',
    persona: 'персона',
    npc: 'нпс',
    environment: 'окружение',
    auto: 'по контексту',
};

const THEMES = [
    'gothic pink glitter',
    'acid green hacker terminal',
    'vampire velvet, crosses and candles',
    'anime skin with sparkles and glitter gifs',
    'necro-glamour: skulls and bows',
    'blurry winter sky photos taken on a flip phone',
    'pixel hearts and falling stars',
    'stickers and correction fluid',
    'silver-black chrome and barbed wire',
    'a memorial page dedicated to yourself (dramatic)',
];

const VIBES = [
    'the night before monday',
    'rain tapping on the windowsill',
    '3 am and nobody is online',
    'hiding in a bathroom stall during break',
    'an empty stairwell that smells like damp',
    'the last day of the holidays',
    'autumn inside regardless of the season',
    'the connection dropped, writing this offline',
    'neighbours drilling the wall while i drill my soul',
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
        // промты переведены на английский ради экономии токенов: нетронутый
        // русский дефолт заменяем молча, отредактированный не трогаем
        if (migrated === LEGACY_RU_PROMPT) {
            migrated = DEFAULT_PROMPT;
        }
        // «под катом» и прочий блогерский жаргон заменён на живые заманухи
        if (migrated.includes('under the cut')) {
            migrated = migrated.replace(
                /^- SECRETS:.*$/m,
                DEFAULT_PROMPT.match(/^- SECRETS:.*$/m)[0],
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

    // Фейковый UI остаётся фейковым: никуда не ведёт, ничего не отправляет.
    // Единственный живой интерактив — секретики на <details>/<summary>.
    for (const el of wrapper.querySelectorAll('a, area, base')) {
        el.removeAttribute('href');
        el.removeAttribute('target');
        el.removeAttribute('ping');
    }
    for (const el of wrapper.querySelectorAll('input, button, select, textarea')) {
        el.setAttribute('disabled', 'disabled');
        el.removeAttribute('formaction');
    }
    // Внешние картинки не грузим: это и битые иконки, и утечка чата на чужой хост
    for (const img of wrapper.querySelectorAll('img, source, video, audio, track')) {
        const src = img.getAttribute('src') ?? '';
        if (!src.startsWith('data:')) img.remove();
    }

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
            return { key, text: `the player's persona "${userName}". write as ${userName} — this is their secret diary.` };
        case 'npc':
            return { key, text: 'a minor NPC present in the scene or mentioned in it. pick who it is yourself and sign the entry with their handle. NOT the main character, NOT the player.' };
        case 'environment':
            return { key, text: 'the setting itself (the house, the street, the woods, the cafe — whatever fits) keeps a melancholy blog about what happens inside it. animate and strange. it is NOT a person.' };
        case 'auto':
            return { key, text: `pick the author yourself, choosing whose hidden feelings are most interesting right now: the character "${charName}", the player's persona "${userName}", some NPC from the scene, or the setting itself.` };
        case 'character':
        default:
            return { key: 'character', text: `the character "${charName}". write as ${charName} — this is their secret diary.` };
    }
}

function pickStyle() {
    const settings = getSettings();
    if (settings.styleMode !== 'random' && STYLES[settings.styleMode]) {
        return settings.styleMode;
    }
    const enabled = (settings.enabledStyles ?? DEFAULT_ENABLED_STYLES).filter(key => STYLES[key]);
    return enabled.length ? randomFrom(enabled) : 'emo2000s';
}

// Постоянные комментаторы чата: берём состав из последней записи, где он был,
// иначе набираем новый. Так подписчики блога не меняются от поста к посту.
function pickCommenters(mesId, count) {
    const context = getContext();
    for (let i = mesId; i >= 0; i--) {
        const roster = context.chat[i]?.extra?.[MODULE]?.commenters;
        if (Array.isArray(roster) && roster.length) {
            // состав постоянный, но при желании показать больше — добираем новых
            if (roster.length >= count) return roster.slice(0, count);
            const extra = COMMENTER_NICKS.filter(nick => !roster.includes(nick));
            return [...roster, ...shuffle(extra).slice(0, count - roster.length)];
        }
    }
    return shuffle([...COMMENTER_NICKS]).slice(0, count);
}

function shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function collectCards(message) {
    const context = getContext();
    const parts = [];
    const seen = new Set();

    const pushChar = (char) => {
        if (!char || seen.has(char.name)) return;
        seen.add(char.name);
        const bits = [
            char.description ? `description: ${truncate(char.description, 1500)}` : '',
            char.personality ? `personality: ${truncate(char.personality, 600)}` : '',
            char.scenario ? `scenario: ${truncate(char.scenario, 600)}` : '',
        ].filter(Boolean);
        if (bits.length) {
            parts.push(`character "${char.name}":\n${bits.join('\n')}`);
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
        `color/decor theme: ${randomFrom(THEMES)}`,
        `vibe: ${randomFrom(VIBES)}`,
        `page views: ${randomInt(1, 47)}, currently online: ${randomInt(0, 3)} guests`,
        `likes: ${randomInt(0, 2)}`,
    ].join('\n');
}

function buildCommentsBlock(commenters) {
    return `[COMMENTS]
after the entry, add a comments section with exactly ${commenters.length} comment(s), in this order, using EXACTLY these nicknames: ${commenters.join(', ')}.
- these are random strangers who follow this blog. they are NOT characters from the scene, NOT NPCs, and they know nothing about the story world — never let them reference the plot as if they were there.
- each comment: nickname, a tiny fake avatar made of ascii/emoji, a timestamp, and 1-2 short lines.
- they mostly react to the feeling of the entry, but at least one of them misses the point completely, plugs their own blog, or leaves a bare "first!!" / "❤❤❤" / "add me on aim".
- keep each nickname's voice consistent; style the section to match the block.
- a fake "post a comment" box below is decoration only.`;
}

function buildMessages(mesId, perspective, styleKey, commenters) {
    const settings = getSettings();
    const context = getContext();
    const message = context.chat[mesId];

    const sceneLines = [];
    for (let i = Math.max(0, mesId - settings.depth + 1); i <= mesId; i++) {
        const m = context.chat[i];
        if (!m || m.is_system) continue;
        sceneLines.push(`${m.name}: ${truncate(htmlToText(m.mes), 1200)}`);
    }

    const blocks = [`!!! AUTHOR OF THIS ENTRY (follow strictly): ${perspective.text}`];

    blocks.push(LANGUAGE_BLOCKS[settings.language] ?? LANGUAGE_BLOCKS.ru);
    blocks.push(LENGTH_BLOCKS[settings.length] ?? LENGTH_BLOCKS.short);
    blocks.push(`[STYLE OF THE PAGE — build the block in this exact style]\n${STYLES[styleKey].prompt}`);

    if (commenters?.length) {
        blocks.push(buildCommentsBlock(commenters));
    }

    if (settings.includeCards) {
        const cards = collectCards(message);
        if (cards) blocks.push(`[CHARACTER CARDS]\n${cards}`);
    }

    if (settings.includePersona && power_user?.persona_description) {
        blocks.push(`[PLAYER PERSONA "${context.name1 ?? 'player'}"]\n${truncate(power_user.persona_description, 1000)}`);
    }

    blocks.push(`[RECENT SCENE]\n${sceneLines.join('\n')}`);

    const past = collectPastEntries(mesId, settings.pastEntries);
    if (past.length) {
        blocks.push(`[PREVIOUS ENTRIES — for continuity of mood, do not copy them]\n${past.map(e => `• ${e}`).join('\n')}`);
    }

    blocks.push(`[RANDOM SEEDS — use as you like]\n${buildRandomDetails()}`);
    // автора повторяем последней строкой: то, что ближе к концу, модель соблюдает охотнее
    blocks.push(`write one new entry reacting to the recent scene. the author is: ${perspective.text}\nreturn the html fragment only, no explanations.`);

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

async function chatCompletionCustom(messages, { maxTokens, temperature } = {}) {
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

// --- профили подключения самой таверны ---

function getProfiles() {
    const context = getContext();
    return context.extensionSettings?.connectionManager?.profiles ?? [];
}

function getProfileById(id) {
    return getProfiles().find(profile => profile.id === id);
}

// Списки моделей уже загружены самой таверной в её же селекты — забираем оттуда,
// чтобы не ходить к провайдеру своим запросом (ключа у нас в этом режиме нет).
function collectProfileModels(profile) {
    const api = String(profile?.api ?? '').toLowerCase();
    const isModelField = (el) => /model/i.test(el.id);

    const selects = [...document.querySelectorAll('select[id]')]
        .filter(el => isModelField(el) && el.options.length > 1);
    const scored = selects
        .map(el => ({ el, score: api && el.id.toLowerCase().includes(api) ? 1 : 0 }))
        .sort((a, b) => b.score - a.score);

    // селект именно этого API — берём только его; не нашли — отдаём всё, что есть
    const matched = scored.some(item => item.score > 0);
    const chosen = matched ? scored.filter(item => item.score > 0) : scored;

    const models = [];
    const seen = new Set();
    for (const { el } of chosen) {
        for (const option of el.options) {
            const value = option.value?.trim();
            if (!value || seen.has(value)) continue;
            seen.add(value);
            models.push({ value, label: option.textContent?.trim() || value });
        }
    }

    // У кастомных OpenAI-совместимых подключений модель вводится текстом.
    // Берём такое поле, только если оно относится к этому же API (или если
    // подходящего селекта не нашлось вовсе) — иначе в список к openrouter
    // приедет модель из настроек custom.
    for (const input of document.querySelectorAll('input[id]')) {
        if (!isModelField(input)) continue;
        if (matched && !(api && input.id.toLowerCase().includes(api))) continue;
        const value = input.value?.trim();
        if (value && !seen.has(value)) {
            seen.add(value);
            models.push({ value, label: value });
        }
    }

    return { models, matched };
}

// Переопределение модели поддерживают не все сборки ST — проверяем по сигнатуре.
function supportsModelOverride() {
    const send = getContext().ConnectionManagerRequestService?.sendRequest;
    return !!send && /overridePayload/.test(String(send));
}

let overrideWarned = false;

function profileModelName(profileId) {
    return getProfileById(profileId)?.model || 'модель профиля';
}

// Запрос уходит через ST: ключ и адрес остаются на её стороне, дублировать
// их в настройках расширения не нужно.
async function chatCompletionProfile(messages, { maxTokens } = {}) {
    const settings = getSettings();
    const service = getContext().ConnectionManagerRequestService;
    if (!service?.sendRequest) {
        throw new Error('в этой сборке SillyTavern нет менеджера профилей подключения — используй свой эндпойнт');
    }
    if (!settings.profileId) throw new Error('не выбран профиль подключения');
    if (!getProfileById(settings.profileId)) throw new Error('выбранный профиль больше не существует — выбери другой');

    // пресет и инструкт-шаблон профиля нам не нужны: у дневничка свой промт,
    // иначе в него подмешается системный промт ролевой игры
    const options = { extractData: true, includePreset: false, includeInstruct: false };
    const limit = maxTokens ?? settings.maxTokens;

    const override = {};
    const wantedModel = String(settings.profileModel ?? '').trim();
    if (wantedModel) {
        if (supportsModelOverride()) {
            override.model = wantedModel;
        } else if (!overrideWarned) {
            overrideWarned = true;
            toastr.warning(
                `Эта сборка SillyTavern не умеет подменять модель у профиля — пишем моделью профиля (${profileModelName(settings.profileId)}).`,
                'Эмо-дневничок',
            );
        }
    }

    let result;
    try {
        result = await service.sendRequest(settings.profileId, messages, limit, options, override);
    } catch (error) {
        // сборки постарше принимают только плоский текст вместо массива сообщений
        console.debug(`[${MODULE}] профиль не принял массив сообщений, пробуем текстом:`, error);
        const flat = messages.map(m => m.content).join('\n\n');
        result = await service.sendRequest(settings.profileId, flat, limit, options, override);
    }

    let content = typeof result === 'string'
        ? result
        : (result?.content ?? result?.choices?.[0]?.message?.content ?? result?.text ?? '');
    if (Array.isArray(content)) {
        content = content.map(part => part?.text ?? '').join('');
    }
    if (!content) throw new Error('профиль вернул пустой ответ');
    return content;
}

function chatCompletion(messages, options = {}) {
    return getSettings().apiSource === 'profile'
        ? chatCompletionProfile(messages, options)
        : chatCompletionCustom(messages, options);
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
        const styleKey = pickStyle();
        const commenters = settings.comments
            ? pickCommenters(mesId, settings.commentsCount === 'auto'
                ? randomInt(2, 3)
                : Number(settings.commentsCount) || 2)
            : [];
        console.debug(`[${MODULE}] запись #${mesId}: автор «${perspective.key}» (режим «${settings.perspectiveMode}»), стиль «${styleKey}»`);
        const raw = await chatCompletion(buildMessages(mesId, perspective, styleKey, commenters));
        const html = extractDiaryHtml(raw);
        if (!html) throw new Error('после очистки от ответа модели ничего не осталось');

        // пока писали, юзер мог улистать на другой свайп — не клеим запись к чужому варианту
        if ((message.swipe_id ?? 0) !== startSwipeId) return;

        message.extra = message.extra ?? {};
        message.extra[MODULE] = {
            html,
            perspective: perspective.key,
            style: styleKey,
            commenters,
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
    const style = STYLES[diary.style]?.label;
    const $block = $(`
        <div class="emodiary-block" data-mesid="${mesId}">
            <div class="emodiary-toolbar">
                <span class="emodiary-perspective">☽ дневничок: ${escapeHtml(label)}${style ? ` · ${escapeHtml(style)}` : ''}</span>
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
        const style = STYLES[diary.style]?.label ?? '';
        const when = diary.time ? new Date(diary.time).toLocaleString('ru-RU') : '';
        const $entry = $(`
            <div class="emodiary-viewer-entry">
                <div class="emodiary-viewer-entry-header">
                    #${i} · к сообщению от ${escapeHtml(message.name ?? '')} · ${escapeHtml(label)}${style ? ` · ${escapeHtml(style)}` : ''} · ${escapeHtml(when)}
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
    const enabledStyles = s.enabledStyles ?? DEFAULT_ENABLED_STYLES;
    const styleOptions = Object.entries(STYLES)
        .map(([key, style]) => `<option value="${key}" ${s.styleMode === key ? 'selected' : ''}>только «${escapeHtml(style.label)}»</option>`)
        .join('');
    const styleToggles = Object.entries(STYLES)
        .map(([key, style]) => `
                <label class="checkbox_label">
                    <input type="checkbox" class="emodiary_style_toggle" data-style="${key}" ${enabledStyles.includes(key) ? 'checked' : ''}>
                    <span>${escapeHtml(style.label)}</span>
                </label>`)
        .join('');
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
                <label>Откуда брать модель</label>
                <select id="emodiary_source" class="text_pole">
                    <option value="profile" ${s.apiSource === 'profile' ? 'selected' : ''}>профиль подключения таверны</option>
                    <option value="custom" ${s.apiSource === 'custom' ? 'selected' : ''}>свой эндпойнт</option>
                </select>

                <div id="emodiary_profile_block">
                    <label>Профиль</label>
                    <select id="emodiary_profile" class="text_pole"></select>
                    <div class="flex-container">
                        <div id="emodiary_profile_refresh" class="menu_button">Обновить список</div>
                        <div id="emodiary_profile_test" class="menu_button">Проверить профиль</div>
                    </div>
                    <div id="emodiary_profile_info" class="emodiary-hint"></div>
                    <label>Модель</label>
                    <select id="emodiary_profile_model_select" class="text_pole"></select>
                    <input type="text" id="emodiary_profile_model" class="text_pole" placeholder="или впиши id модели вручную (пусто = модель профиля)" value="${escapeHtml(s.profileModel)}">
                    <div class="flex-container">
                        <div id="emodiary_profile_model_test" class="menu_button">Проверить модель</div>
                    </div>
                    <div id="emodiary_profile_model_info" class="emodiary-hint"></div>
                </div>

                <div id="emodiary_custom_block">
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
                <label class="checkbox_label">
                    <input type="checkbox" id="emodiary_comments" ${s.comments ? 'checked' : ''}>
                    <span>Комментарии от случайных подписчиков</span>
                </label>
                <label>Сколько комментариев</label>
                <select id="emodiary_comments_count" class="text_pole">
                    <option value="auto" ${s.commentsCount === 'auto' ? 'selected' : ''}>2–3 (случайно)</option>
                    <option value="1" ${s.commentsCount === '1' ? 'selected' : ''}>1</option>
                    <option value="2" ${s.commentsCount === '2' ? 'selected' : ''}>2</option>
                    <option value="3" ${s.commentsCount === '3' ? 'selected' : ''}>3</option>
                    <option value="4" ${s.commentsCount === '4' ? 'selected' : ''}>4</option>
                </select>

                <hr>
                <h4>Стиль страницы</h4>
                <select id="emodiary_style_mode" class="text_pole">
                    <option value="random" ${s.styleMode === 'random' ? 'selected' : ''}>рандом из отмеченных</option>
                    ${styleOptions}
                </select>
                <div id="emodiary_style_list">${styleToggles}</div>

                <hr>
                <h4>Модель</h4>
                <label>Температура: <span id="emodiary_temp_value">${s.temperature}</span></label>
                <input type="range" id="emodiary_temp" min="0" max="2" step="0.05" value="${s.temperature}">
                <div class="emodiary-hint">для профиля таверны температуру и сэмплеры задаёт сам профиль</div>
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

function refreshProfileList() {
    const settings = getSettings();
    const $select = $('#emodiary_profile');
    if (!$select.length) return;

    const profiles = getProfiles();
    $select.empty();
    if (!profiles.length) {
        $select.append('<option value="">— в таверне нет профилей подключения —</option>');
        $('#emodiary_profile_info').text('Профили создаются в меню подключения таверны (Connection Profiles).');
        return;
    }

    $select.append('<option value="">— выбери профиль —</option>');
    for (const profile of profiles) {
        $select.append($('<option>').val(profile.id).text(profile.name ?? profile.id));
    }
    if (settings.profileId && profiles.some(p => p.id === settings.profileId)) {
        $select.val(settings.profileId);
    }
    showProfileInfo();
}

function showProfileInfo() {
    const profile = getProfileById(getSettings().profileId);
    const parts = profile
        ? [profile.api, profile.model].filter(Boolean)
        : [];
    $('#emodiary_profile_info').text(parts.length ? `api: ${parts.join(' · модель: ')}` : '');
}

function refreshProfileModelList() {
    const settings = getSettings();
    const $select = $('#emodiary_profile_model_select');
    if (!$select.length) return;

    const profile = getProfileById(settings.profileId);
    const fallback = profile?.model ? ` (${profile.model})` : '';
    $select.empty().append($('<option>').val('').text(`— модель профиля${fallback} —`));

    if (!profile) {
        $('#emodiary_profile_model_info').text('');
        return;
    }

    const { models, matched } = collectProfileModels(profile);
    for (const model of models) {
        $select.append($('<option>').val(model.value).text(model.label));
    }
    if (settings.profileModel && models.some(m => m.value === settings.profileModel)) {
        $select.val(settings.profileModel);
    }

    const hints = [];
    if (!models.length) {
        hints.push('Таверна ещё не загрузила список моделей для этого API — открой её меню подключения или впиши id вручную.');
    } else if (!matched) {
        hints.push(`Список моделей именно для «${profile.api}» не нашёлся, показаны все известные таверне.`);
    }
    if (!supportsModelOverride()) {
        hints.push('Эта сборка ST не умеет подменять модель у профиля — будет использована модель самого профиля.');
    }
    $('#emodiary_profile_model_info').text(hints.join(' '));
}

function updateSourceVisibility() {
    const profileMode = getSettings().apiSource === 'profile';
    $('#emodiary_profile_block').toggle(profileMode);
    $('#emodiary_custom_block').toggle(!profileMode);
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

    $('#emodiary_source').on('change', function () {
        set('apiSource', $(this).val());
        updateSourceVisibility();
        setStatus('');
        if (getSettings().apiSource === 'profile') {
            refreshProfileList();
            refreshProfileModelList();
        }
    });
    $('#emodiary_profile').on('change', function () {
        set('profileId', $(this).val());
        // модель прошлого профиля к новому не относится
        set('profileModel', '');
        $('#emodiary_profile_model').val('');
        showProfileInfo();
        refreshProfileModelList();
        setStatus('');
    });
    $('#emodiary_profile_model_select').on('change', function () {
        set('profileModel', $(this).val());
        $('#emodiary_profile_model').val($(this).val());
        setStatus('');
    });
    $('#emodiary_profile_model').on('input', function () {
        set('profileModel', String($(this).val()).trim());
    });
    $('#emodiary_profile_model_test').on('click', async () => {
        const settings = getSettings();
        if (!getProfileById(settings.profileId)) {
            setStatus('✖ сначала выбери профиль', false);
            return;
        }
        const model = settings.profileModel || profileModelName(settings.profileId);
        if (settings.profileModel && !supportsModelOverride()) {
            setStatus(`✖ эта сборка SillyTavern не умеет подменять модель у профиля — писать будет ${profileModelName(settings.profileId)}`, false);
            return;
        }
        setStatus(`проверяем модель ${model}...`);
        try {
            await chatCompletionProfile([{ role: 'user', content: 'reply with one word: hello' }], { maxTokens: 20 });
            setStatus(`✔ модель ${model} отвечает`, true);
        } catch (error) {
            setStatus(`✖ модель не отвечает: ${error.message}`, false);
        }
    });
    $('#emodiary_profile_refresh').on('click', () => {
        refreshProfileList();
        refreshProfileModelList();
        const count = getProfiles().length;
        setStatus(count ? `профилей найдено: ${count}` : '✖ в таверне нет профилей подключения', count > 0);
    });
    $('#emodiary_profile_test').on('click', async () => {
        const profile = getProfileById(getSettings().profileId);
        if (!profile) {
            setStatus('✖ сначала выбери профиль', false);
            return;
        }
        setStatus(`проверяем профиль «${profile.name ?? profile.id}»...`);
        try {
            await chatCompletionProfile([{ role: 'user', content: 'reply with one word: hello' }], { maxTokens: 20 });
            setStatus(`✔ профиль «${profile.name ?? profile.id}» отвечает`, true);
        } catch (error) {
            setStatus(`✖ профиль не отвечает: ${error.message}`, false);
        }
    });

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
    $('#emodiary_comments').on('input', function () { set('comments', $(this).prop('checked')); });
    $('#emodiary_comments_count').on('change', function () { set('commentsCount', $(this).val()); });
    $('#emodiary_style_mode').on('change', function () { set('styleMode', $(this).val()); });
    $(document).on('input', '.emodiary_style_toggle', () => {
        const enabled = $('.emodiary_style_toggle:checked').map((_, el) => $(el).data('style')).get();
        if (!enabled.length) {
            // без единого стиля генерировать нечего — возвращаем базовый
            $('.emodiary_style_toggle[data-style="emo2000s"]').prop('checked', true);
            enabled.push('emo2000s');
            toastr.info('Хотя бы один стиль должен остаться', 'Эмо-дневничок');
        }
        set('enabledStyles', enabled);
    });
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
    updateSourceVisibility();
    refreshProfileList();
    refreshProfileModelList();
    addMenuItems();
    bindEvents();
    setTimeout(renderAll, 500);
    console.log(`[${MODULE}] эмо-дневничок раскрыт ☽`);
});
