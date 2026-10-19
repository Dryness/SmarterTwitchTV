/* Differential test: fast-path twemoji.parse must be byte-identical to the original
 * implementation for every input. The original steps are reproduced verbatim below.
 */
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('app/thirdparty/twemoji.js', 'utf8');

// pull the real emoji re and the module out of the (edited) source
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, {filename: 'twemoji.js'});
const parseNew = sandbox.twemoji.parse;

const reMatch = source.match(/re =\n\s*(\/(?:.*)\/g),/);
if (!reMatch) throw new Error('could not extract emoji re from source');
const re = eval(reMatch[1]); // same regex literal, eval in node

const UFE0Fg = /\uFE0F/g;
const U200D = String.fromCharCode(0x200d);
const U000E0002g = new RegExp(String.fromCharCode(0xdb40) + String.fromCharCode(0xdc02), 'g');
const bgg = />/g;
const ltg = /</g;
const newLineg = /(\r\n|\n|\r)/gm;

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

// the original parse, verbatim from git HEAD before the fast path
function parseOld(str, dontremove, emoticon) {
    if (!str || typeof str !== 'string') return str + '';

    if (!dontremove) str = str.replace(ltg, '&lt;').replace(bgg, '&gt;');

    str = str.replace(newLineg, '');

    str = str.replace(U000E0002g, U200D);

    return String(str).replace(re, function (rawText) {
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

let cases = 0;
function cmp(str, label) {
    for (const dontremove of [true, false]) {
        for (const emoticon of [true, false]) {
            const a = parseOld(str, dontremove, emoticon);
            const b = parseNew(str, dontremove, emoticon);
            if (a !== b) {
                console.error('MISMATCH ' + label + ' dontremove=' + dontremove + ' emoticon=' + emoticon);
                console.error('  in : ' + JSON.stringify(str));
                console.error('  old: ' + JSON.stringify(a));
                console.error('  new: ' + JSON.stringify(b));
                process.exit(1);
            }
            cases++;
        }
    }
}

// 1) every single printable ASCII char
for (let c = 0x20; c <= 0x7e; c++) cmp(String.fromCharCode(c), 'ascii1');
// 2) every pair
for (let a = 0x20; a <= 0x7e; a++) for (let b = 0x20; b <= 0x7e; b++) cmp(String.fromCharCode(a, b), 'ascii2');
// 3) every triple (857k x 4 flag combos)
for (let a = 0x20; a <= 0x7e; a++)
    for (let b = 0x20; b <= 0x7e; b++)
        for (let c = 0x20; c <= 0x7e; c++) cmp(String.fromCharCode(a, b, c), 'ascii3');

// 4) boundary / unicode behavior cases
const samples = [
    '',
    'plain ascii text only',
    'with <html> brackets >',
    'less < than',
    'greater > than',
    '\u2764\uFE0F emoji',
    '\u2764 bare heart',
    '#\uFE0F\u20E3 keycap',
    '3\uFE0F\u20E3 number keycap',
    '# keycap ascii only hash',
    '\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC66 ZWJ family',
    '\uD83C\uDDFA\uD83C\uDDF8 flag',
    '\u00A9 copyright',
    '\u2122 tm',
    'caf\u00E9 latin1',
    'nbsp\u00A0space',
    'tab\tsep',
    'line\nbreak\r\nmix',
    'ascii \u2764\uFE0F mixed \uD83D\uDE00 emoji',
    '\uDB40\uDC02 zero width joiner fixup',
    '\uE000 private use',
    '\u{1F9D1}\u200D\u{1F91D}\u200D\u{1F9D1} handshake',
    '1234567890 !@#$%^&*()',
    'Kappa PogChamp Kreygasm'
];
for (const s of samples) cmp(s, 'sample');
// numbers and keycap starters adjacent to ascii in longer strings
for (const d of '0123456789#*') {
    cmp(d + 'x', 'keycap-suffix');
    cmp('x' + d, 'keycap-prefix');
    cmp('a' + d + 'b', 'keycap-mid');
}

console.log('all ' + cases + ' differential cases identical between original and fast-path parse');

// 5) extraMessageTokenize end-to-end: old verbatim implementation (mescape + parse(t,true,true))
//    vs the edited app/thirdparty/kapchat.js (parse(t,false,true)), both against real emote data
const kap = {};
vm.createContext(kap);
vm.runInContext(
    fs.readFileSync('app/thirdparty/punycode.js', 'utf8') +
        '\n' +
    source + // twemoji.js (already read above, with the fast path)
        '\n' +
        fs.readFileSync('app/thirdparty/kapchat.js', 'utf8'),
    kap,
    {filename: 'kapchat.js'}
);
kap.extraEmotes = [
    {
        Kappa: {chat_div: '<img class="emoticon" src="k.png">'},
        LUL: {chat_div: '<img class="emoticon" src="l.png">'},
        ZeroW: {chat_div: '<img class="emoticon" src="z.png">', chat_div_zero: '<img class="emoticon" src="z0.png">'}
    },
    {}
];
kap.cheers = {chan1: {Cheer: {1: 'c1', 100: 'c100', 1000: 'c1000'}}};
kap.ChatLive_selectedChannel_id = ['chan1', 'chan2'];
kap.Main_A_includes_B = (a, b) => String(a).indexOf(String(b)) !== -1;
kap.Main_startsWith = (a, b) => String(a).lastIndexOf(String(b), 0) === 0;

function mescape(message) {
    return message.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function oldExtraMessageTokenize(message, chat_number, bits, previewsEmote) {
    var SplittedMessage = message.split(' '),
        retArray = [],
        emote,
        cheer,
        i = 0,
        len = SplittedMessage.length,
        skipEscape;

    if (previewsEmote) {
        SplittedMessage[0] = previewsEmote;
        skipEscape = true;
    }

    for (i; i < len; i++) {
        cheer = bits ? kap.findCheerInToken(SplittedMessage[i], chat_number) : 0;

        if (cheer) {
            retArray.push(cheer);
        } else {
            emote = kap.extraEmotes[chat_number][SplittedMessage[i]];

            if (retArray.length && emote && emote.chat_div_zero && kap.Main_A_includes_B(retArray[retArray.length - 1], 'emoticon')) {
                retArray[retArray.length - 1] = kap.Main_A_includes_B(retArray[retArray.length - 1], 'zero-width-container')
                    ? kap.zeroWidthDiv(retArray[retArray.length - 1], emote.chat_div_zero)
                    : kap.zeroWidth(retArray[retArray.length - 1], emote.chat_div_zero);
            } else if (emote) {
                retArray.push(emote.chat_div);
            } else {
                retArray.push(!i && skipEscape ? SplittedMessage[i] : parseOld(mescape(SplittedMessage[i]), true, true));
            }
        }
    }

    return retArray.join(' ') + (bits ? ' ' + bits + ' bits' : '');
}

const tokenizeCases = [
    ['plain ascii message', 0, 0, undefined],
    ['with <html> and > brackets', 0, 0, undefined],
    ['Kappa and LUL emotes', 0, 0, undefined],
    ['Kappa ZeroW stacked emote', 0, 0, undefined],
    ['Cheer100 support Cheer1000', 0, 100, undefined],
    ['mixed Kappa <b> \u2764\uFE0F \n newline', 0, 0, undefined],
    ['first \u2764 rest of message', 0, 0, '<img class="emoticon" src="pre.png">'],
    ['  double  spaces  empty  tokens', 0, 0, undefined],
    ['cheer lowercase cheer100', 0, 100, undefined],
    ['\u2764\uFE0F\u200D\uD83D\uDDA4 complex emoji ok', 0, 0, undefined],
    ['a', 0, 0, undefined],
    ['', 0, 0, undefined],
    ['ZeroW only first', 0, 0, undefined],
    ['LUL ZeroW after emote', 0, 0, undefined]
];

let tokenizeCasesRun = 0;
for (const [msg, slot, bits, pre] of tokenizeCases) {
    const a = oldExtraMessageTokenize(msg, slot, bits, pre);
    const b = kap.extraMessageTokenize(msg, slot, bits, pre);
    if (a !== b) {
        console.error('TOKENIZE MISMATCH');
        console.error('  in : ' + JSON.stringify(msg));
        console.error('  old: ' + JSON.stringify(a));
        console.error('  new: ' + JSON.stringify(b));
        process.exit(1);
    }
    tokenizeCasesRun++;
}
console.log('all ' + tokenizeCasesRun + ' extraMessageTokenize differential cases identical between original and edited kapchat');
