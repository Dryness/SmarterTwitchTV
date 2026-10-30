/* Hold OK on a grid card opens its options: auto-repeat and the release of that press must not pick an
 * option or re-arm the grid behind the dialog. Loads the real TVKeyValue.js and Screens.js key handlers. */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const s = {};
vm.createContext(s);
vm.runInContext(fs.readFileSync('app/general/TVKeyValue.js', 'utf8'), s);
vm.runInContext(fs.readFileSync('app/specific/Screens.js', 'utf8'), s);

let checks = 0;
function check(value, message) {
    assert.ok(value, message);
    checks++;
}

const listeners = {keydown: new Set(), keyup: new Set()};
let timer = null,
    dialogShown = false,
    plays = 0,
    picks = 0,
    direct = 0;
s.Main_addEventListener = (type, fun) => listeners[type].add(fun);
s.Main_removeEventListener = (type, fun) => listeners[type].delete(fun);
s.Main_setTimeout = fun => ((timer = fun), 1);
s.Main_clearTimeout = () => (timer = null);
s.Main_isScene1DocVisible = () => true;
s.Sidepannel_isShowingUserLive = () => false;
s.Sidepannel_isShowingMenus = () => false;
s.Main_CantClick = () => false;
s.Main_keyClickDelayStart = () => {};
s.Settings_Obj_default = () => direct;
s.Main_isElementShowingWithEle = () => dialogShown;
// Only the dialog's listener swap matters here; its content building needs the full app.
s.Screens_ThumbOptionStart = key => {
    s.Screens_clear = true;
    s.Main_removeEventListener('keydown', s.ScreenObj[key].key_fun);
    s.Main_addEventListener('keydown', s.ScreenObj[key].key_thumb);
    dialogShown = true;
};
s.Screens_ThumbOptionDialogKeyEnter = key => {
    picks++;
    dialogShown = false;
    s.Main_removeEventListener('keydown', s.ScreenObj[key].key_thumb);
    s.Main_addEventListener('keydown', s.ScreenObj[key].key_fun);
};

const key = 1;
s.ScreenObj = {};
s.ScreenObj[key] = {posY: 0, posX: 0, posSub: s.Screens_SubBody, key_play: () => plays++};
s.ScreenObj[key].key_fun = e => s.Screens_handleKeyDown(key, e);
s.ScreenObj[key].key_up = e => s.Screens_handleKeyUp(key, e);
s.ScreenObj[key].key_thumb = e => s.Screens_ThumbOptionhandleKeyDown(key, e);

function send(type, keyCode) {
    Array.from(listeners[type]).forEach(fun => fun({keyCode: keyCode}));
}
function hold(repeats) {
    send('keydown', s.KEY_ENTER);
    const fire = timer;
    timer = null;
    if (fire) fire();
    for (let i = 0; i < repeats; i++) send('keydown', s.KEY_ENTER);
}
function reset() {
    listeners.keydown.clear();
    listeners.keyup.clear();
    listeners.keydown.add(s.ScreenObj[key].key_fun);
    timer = null;
    dialogShown = false;
    plays = picks = 0;
}

for (direct of [0, 1]) {
    const mode = direct ? 'direct: ' : 'legacy: ';
    reset();
    send('keydown', s.KEY_ENTER);
    send('keyup', s.KEY_ENTER);
    check(plays === 1 && !dialogShown, mode + 'a tap still watches');
    check(listeners.keydown.has(s.ScreenObj[key].key_fun) && !listeners.keyup.size, mode + 'a tap re-arms the grid');

    reset();
    hold(10);
    check(dialogShown, mode + 'a hold opens the options');
    check(picks === 0, mode + 'auto-repeat of the held OK cannot pick an option');
    send('keyup', s.KEY_ENTER);
    check(plays === 0 && dialogShown, mode + 'the release neither watches nor closes the options');
    check(!listeners.keyup.size, mode + 'the release removes the grid key-up listener');
    check(!listeners.keydown.has(s.ScreenObj[key].key_fun), mode + 'the grid stays disarmed behind the options');
    check(listeners.keydown.has(s.ScreenObj[key].key_thumb), mode + 'the options keep key-down');
    send('keydown', s.KEY_ENTER);
    check(picks === 1, mode + 'a fresh OK picks the focused option');
    check(listeners.keydown.size === 1 && listeners.keydown.has(s.ScreenObj[key].key_fun), mode + 'only the grid listens after the options close');
}

console.log(checks + ' hold options checks passed');
