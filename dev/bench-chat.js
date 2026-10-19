/* CPU profile of the live chat message pipeline using the real production files. */
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
    // chat_line_highlight_* are CSS class fragments in production
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

// ChatLive.js re-declares these at load time, so seed them after the eval
s.extraEmotes[0] = {Kappa: {chat_div: '<img class="emoticon" src="k.png">'}, LUL: {chat_div: '<img class="emoticon" src="l.png">'}, PogChamp: {chat_div: '<img class="emoticon" src="p.png">'}};
s.extraEmotes[1] = {Kappa: {chat_div: '<img class="emoticon" src="k.png">'}};
s.cheers.chan1 = {Cheer: {1: 'c1', 100: 'c100', 1000: 'c1000'}};

// sink: measure everything up to and including render-object construction
let sink = 0;
s.ChatLive_LineAddCheckDelay = (n, msg) => {
    sink += msg.message.length;
};

// message mix: plain, emotes, cheer+bBits, mention, badges, occasional emoji
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
    const text = texts[i % texts.length];
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
        params: [null, text]
    };
}

// warmup
for (let i = 0; i < 2000; i++) s.ChatLive_loadChatSuccess(makeMessage(i), 0, 0);
sink = 0;

const RUNS = 5,
    N = 20000;
const perStage = {emoticonize: 0, tokenize: 0, twemoji: 0, badges: 0, checkEmotes: 0, full: 0};

const realEmoticonize = s.emoticonize;
const realExtraTokenize = s.extraMessageTokenize;
const realTwemojiParse = s.twemoji.parse;
const realGetBadges = s.ChatLive_GetBadges;
const realCheckEmotes = s.ChatLive_checkEmotes;
const realLoadChatSuccess = s.ChatLive_loadChatSuccess;

function benchStage(name, fn, iters) {
    const t0 = process.hrtime.bigint();
    fn(iters);
    const t1 = process.hrtime.bigint();
    perStage[name] += Number(t1 - t0) / 1e6;
}

for (let r = 0; r < RUNS; r++) {
    benchStage('full', n => {
        for (let i = 0; i < n; i++) realLoadChatSuccess(makeMessage(i), 0, 0);
    }, N);

    // stage isolation on pre-parsed tags
    const msgs = Array.from({length: 1000}, (_, i) => makeMessage(i));
    benchStage('emoticonize', n => {
        for (let i = 0; i < n; i++) {
            const m = msgs[i % msgs.length];
            realEmoticonize(m.params[1], realCheckEmotes(m.tags));
        }
    }, N);
    benchStage('tokenize', n => {
        for (let i = 0; i < n; i++) realExtraTokenize(texts[i % texts.length], 0, 0);
    }, N);
    benchStage('twemoji', n => {
        for (let i = 0; i < n; i++) realTwemojiParse(texts[i % texts.length], true, true);
    }, N);
    benchStage('badges', n => {
        for (let i = 0; i < n; i++) realGetBadges(msgs[i % msgs.length].tags, 0);
    }, N);
    benchStage('checkEmotes', n => {
        for (let i = 0; i < n; i++) {
            // fresh tags each time; ChatLive_checkEmotes mutates tags.emotes in place
            realCheckEmotes({emotes: emoteSets[i % emoteSets.length]});
        }
    }, N);
}

function rawEmotes(i) {
    return emoteSets[i % emoteSets.length];
}

console.log('chat pipeline profile (' + N + ' msgs x ' + RUNS + ' runs), sink ' + sink);
for (const k of Object.keys(perStage)) {
    console.log('  ' + k.padEnd(12) + (perStage[k] / RUNS).toFixed(1) + ' ms/run  (' + (perStage[k] / RUNS / N * 1000).toFixed(2) + ' us/msg)');
}
