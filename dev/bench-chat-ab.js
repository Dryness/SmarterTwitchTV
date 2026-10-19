/* A/B interleaved benchmark: current twemoji.parse (from app/thirdparty/twemoji.js)
 * vs the original implementation (reproduced verbatim). Interleaving cancels
 * machine-load drift; only the old/new ratio is meaningful.
 */
const fs = require('fs');
const vm = require('vm');

const source = ['app/thirdparty/punycode.js', 'app/thirdparty/twemoji.js', 'app/thirdparty/kapchat.js', 'app/specific/ChatLive.js']
    .map(f => fs.readFileSync(f, 'utf8'))
    .join('\n');

const s = {
    Date: Date,
    Main_setTimeout: () => 0,
    Main_clearTimeout: () => {},
    Main_setInterval: () => 0,
    Main_clearInterval: () => {},
    Main_Log: () => {},
    Main_A_equals_B: (a, b) => String(a) === String(b),
    Main_A_includes_B: (a, b) => String(a).indexOf(String(b)) !== -1,
    Main_startsWith: (a, b) => String(a).lastIndexOf(String(b), 0) === 0,
    Main_clock_H_M: '12:00',
    Settings_value: {disabled_shared: {defaultValue: false}, show_chatters: {defaultValue: false}},
    KnowBots: {},
    AddUser_UsernameArray: [{id: 'account', display_name: 'Owner', login: 'owner'}],
    defaultColors: ['#a', '#b', '#c', '#d'],
    defaultColorsLength: 4,
    chat_Line_highlight_green: 'chat_nick_green',
    chat_Line_highlight_blue: 'chat_nick_blue',
    chat_Line_highlight_purple: 'chat_nick_purple',
    cheers: {},
    ChatLive_selectedChannel: ['channelone', 'channeltwo'],
    ChatLive_selectedChannel_id: ['chan1', 'chan2'],
    ChatLive_Channel_Regex_Search: [/channelone/i, /channeltwo/i],
    ChatLive_Channel_Regex_Replace: [/channelone/gi, /channeltwo/gi],
    ChatLive_User_Regex_Search: /@owner/i,
    ChatLive_User_Regex_Replace: /@owner/gi,
    ChatLive_isShared: [0, 0],
    ChatLive_sharedProfileImg: {},
    STR_CHAT_REDEEMED_MESSAGE_HIGH: 'highlight',
    STR_CHAT_REDEEMED_MESSAGE_SUB: 'subhighlight',
    STR_CHAT_FIRST_MESSAGE_HIGH: 'first',
    STR_BR: '<br>',
    STR_CHAT_MESSAGE_DELETED: 'deleted'
};
vm.createContext(s);
vm.runInContext(source, s, {filename: 'chat-pipeline.js'});

s.extraEmotes[0] = {Kappa: {chat_div: '<img class="emoticon" src="k.png">'}, LUL: {chat_div: '<img class="emoticon" src="l.png">'}, PogChamp: {chat_div: '<img class="emoticon" src="p.png">'}};
s.extraEmotes[1] = {Kappa: {chat_div: '<img class="emoticon" src="k.png">'}};
s.cheers.chan1 = {Cheer: {1: 'c1', 100: 'c100', 1000: 'c1000'}};

let sink = 0;
s.ChatLive_LineAddCheckDelay = (n, msg) => {
    sink += msg.message.length;
};

const names = ['StreamViewer', 'KappaFan99', 'LongUsernameHere', 'chat_user_42', 'MODERATOR_DUDE'];
const texts = [
    'this is a plain message about the gameplay',
    'Kappa PogChamp that was insane LUL',
    'Cheer100 great play there friend',
    '@owner can you check the settings please',
    'gg wp <b>html</b> &amp; stuff \u2764\uFE0F well played',
    'a fairly long message that talks about the stream for a while and has many words in it yes indeed'
];
const badgeSets = ['broadcaster/1', 'moderator/1,premium/1', 'premium/1', 'vip/1', ''];
const emoteSets = [null, '25:0-4', '305954156:0-6/25:8-12', null, '1902:0-3,5-9'];

function makeMessage(i) {
    return {
        tags: {
            'display-name': names[i % names.length],
            color: i % 3 === 0 ? false : '#FF0000',
            badges: badgeSets[i % badgeSets.length],
            emotes: emoteSets[i % emoteSets.length],
            id: 'msg-' + i,
            'user-id': 'u' + (i % 40),
            mod: i % 5 === 0 ? '1' : '0',
            'tmi-sent-ts': '' + (1700000000000 + i * 33)
        },
        params: [null, texts[i % texts.length]]
    };
}

// original implementation, verbatim (see dev/verify-twemoji-fastpath.js for the differential proof)
const UFE0Fg = /\uFE0F/g;
const U200D = String.fromCharCode(0x200d);
const U000E0002g = new RegExp(String.fromCharCode(0xdb40) + String.fromCharCode(0xdc02), 'g');
const bgg = />/g;
const ltg = /</g;
const newLineg = /(\r\n|\n|\r)/gm;
const emojiRe = eval(fs.readFileSync('app/thirdparty/twemoji.js', 'utf8').match(/re =\n\s*(\/(?:.*)\/g),/)[1]);

function grabTheRightIcon(rawText) {
    var unicodeSurrogates = rawText ? (rawText.indexOf(U200D) < 0 ? rawText.replace(UFE0Fg, '') : rawText) : rawText,
        r = [],
        c = 0,
        p = 0,
        i = 0;
    while (i < unicodeSurrogates.length) {
        c = unicodeSurrogates.charCodeAt(i++);
        if (p) {
            r.push((0x10000 + ((p - 0xd800) << 10) + (c - 0xdc00)).toString(16));
            p = 0;
        } else if (0xd800 <= c && c <= 0xdbff) {
            p = c;
        } else {
            r.push(c.toString(16));
        }
    }
    return r.join('-');
}

function parseOld(str, dontremove, emoticon) {
    if (!str || typeof str !== 'string') return str + '';

    if (!dontremove) str = str.replace(ltg, '&lt;').replace(bgg, '&gt;');

    str = str.replace(newLineg, '');

    str = str.replace(U000E0002g, U200D);

    return String(str).replace(emojiRe, function (rawText) {
        var iconId = grabTheRightIcon(rawText);

        return iconId
            ? '<img class="' +
                  (emoticon ? 'emoticon' : 'emoji') +
                  '" alt="" src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/' +
                  iconId +
                  '.png"/>'
            : rawText;
    });
}

const parseNew = s.twemoji.parse;
const loadChatSuccess = s.ChatLive_loadChatSuccess;

const N = 10000,
    ROUNDS = 12;
const fullOld = [],
    fullNew = [],
    parseOldT = [],
    parseNewT = [];

// warmup both
for (let w = 0; w < 2; w++) {
    for (let i = 0; i < N; i++) {
        loadChatSuccess(makeMessage(i), 0, 0);
    }
    s.twemoji.parse = parseOld;
    for (let i = 0; i < N; i++) {
        loadChatSuccess(makeMessage(i), 0, 0);
    }
    s.twemoji.parse = parseNew;
}

for (let r = 0; r < ROUNDS; r++) {
    // alternate which implementation runs first each round to cancel ordering bias
    const order = r % 2 ? [['new', parseNew, fullNew], ['old', parseOld, fullOld]] : [['old', parseOld, fullOld], ['new', parseNew, fullNew]];

    for (const [which, impl, bucket] of order) {
        s.twemoji.parse = impl;
        const t0 = process.hrtime.bigint();
        for (let i = 0; i < N; i++) loadChatSuccess(makeMessage(i), 0, 0);
        const t1 = process.hrtime.bigint();
        bucket.push(Number(t1 - t0) / 1e6);

        // direct per-token parse microbench
        const tokens = [];
        for (let i = 0; i < N; i++) tokens.push(texts[i % texts.length].split(' ')[i % 7] || 'word');
        const t2 = process.hrtime.bigint();
        for (let i = 0; i < tokens.length; i++) impl(tokens[i], true, true);
        const t3 = process.hrtime.bigint();
        (which === 'old' ? parseOldT : parseNewT).push(Number(t3 - t2) / 1e6);
    }
}

function med(a) {
    const b = [...a].sort((x, y) => x - y);
    return b[b.length >> 1];
}
function stat(name, oldT, newT) {
    const o = med(oldT),
        n = med(newT);
    console.log('  ' + name.padEnd(14) + 'old ' + o.toFixed(1) + ' ms   new ' + n.toFixed(1) + ' ms   speedup ' + (o / n).toFixed(2) + 'x');
}
console.log('interleaved A/B, ' + N + ' msgs (or tokens) per round, ' + ROUNDS + ' rounds; sink ' + sink + ', load avg at start above');
stat('full pipeline', fullOld, fullNew);
stat('parse/token', parseOldT, parseNewT);
