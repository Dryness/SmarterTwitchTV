/* Real-DOM regression harness for the remote navigation contract.
 *
 * Production sources load unmodified: TVKeyValue.js, UIFocus.js, Navigation.js.
 * Everything in this file is either environment stubbing (the same Main and Sidepannel
 * helpers Navigation.js calls in the app) or the content-side handoff contract the
 * fixed production Screens code implements: apply the focus class, then take DOM
 * focus only when the grid owns input (body or one of its own cards holds it).
 *
 * Keys are dispatched untargeted on document.activeElement, exactly like a remote:
 * no test refocuses the element it expects to receive the next key.
 */
'use strict';

/* ------------------------- environment stubs ------------------------- */
var Main_body = document.body;
var Main_classThumb = 'stream_thumbnail_focused';

var Main_UserLive = 301,
    Main_UserVod = 302,
    Main_UserChannels = 303,
    Main_usergames = 304,
    Main_Live = 305,
    Main_Featured = 306,
    Main_games = 307,
    Main_Vod = 308,
    Main_Clip = 309,
    Main_Search = 310,
    Main_SearchLive = 311,
    Main_SearchChannels = 312,
    Main_SearchGames = 313,
    Main_SearchVod = 314,
    Main_HistoryLive = 315,
    Main_HistoryVod = 316,
    Main_HistoryClip = 317,
    Main_Users = 318,
    Main_addUser = 319,
    Main_Blocked = 320;

var STR_UI = {
    following: 'Following',
    browse: 'Browse',
    library: 'Library',
    account: 'Account',
    liveNow: 'Live now',
    categories: 'Categories',
    noAccount: 'No account',
    welcomeTitle: 'Welcome',
    welcomeCopy: 'Add or browse',
    authNeeded: 'Reconnect',
    nobodyLive: 'Nobody live',
    error: 'Error',
    loading: 'Loading',
    retry: 'Try again',
    browseHelp: 'harness'
};
var STR_SEARCH = 'Search',
    STR_SETTINGS = 'Settings',
    STR_EXIT = 'Exit',
    STR_ABOUT = 'About',
    STR_CONTROLS = 'Controls',
    STR_UPDATE_CHANGELOG = 'Updates',
    STR_LIVE = 'Live',
    STR_FEATURED = 'Featured',
    STR_VIDEOS = 'Videos',
    STR_CLIPS = 'Clips',
    STR_CHANNELS = 'Channels',
    STR_USER_ADD = 'Add account',
    STR_REFRESH = 'Refresh',
    STR_VIEWERS = 'viewers',
    STR_CHANNEL_CONT = 'Channel content';

var Main_values = {
    Main_Go: Main_Live,
    Main_Before: Main_Live,
    Main_BeforeSearch: Main_Live,
    Search_data: null,
    Search_isSearching: false,
    Main_selectedChannelDisplayname: ''
};
var ScreenObj = {};

var AddUser_UsernameArray = [{id: 'harness', name: 'harness', display_name: 'harness'}];
function AddUser_UserHasToken() {
    return true;
}
function AddUser_IsUserSet() {
    return true;
}
function Settings_isVisible() {
    return false;
}
function Screens_LoadPreviewSTop() {}

var UserLiveFeedobj_UserLivePos = 0,
    UserLiveFeedobj_UserVodHistoryPos = 1,
    UserLiveFeed_obj = {},
    UserLiveFeed_DataObj = {},
    UserLiveFeed_loadingData = {},
    UserLiveFeed_status = {};

var harness = {watchCount: 0, goCount: 0, reloadCount: 0};

function Main_getElementById(id) {
    return document.getElementById(id);
}
function Main_empty(id) {
    var element = Main_getElementById(id);
    if (element) element.innerHTML = '';
}
function Main_emptyWithEle(element) {
    if (element) element.innerHTML = '';
}
function Main_textContent(id, value) {
    var element = Main_getElementById(id);
    if (element) element.textContent = value;
}
function Main_textContentWithEle(element, value) {
    if (element) element.textContent = value;
}
function Main_HideElement(id) {
    Main_HideElementWithEle(Main_getElementById(id));
}
function Main_HideElementWithEle(element) {
    if (element) element.classList.add('hide');
}
function Main_ShowElement(id) {
    Main_ShowElementWithEle(Main_getElementById(id));
}
function Main_ShowElementWithEle(element) {
    if (element) element.classList.remove('hide');
}
function Main_isElementShowing(id) {
    var element = Main_getElementById(id);
    return element ? element.className.indexOf('hide') === -1 : false;
}
function Main_AddClass(id, mclass) {
    var element = Main_getElementById(id);
    if (element) element.classList.add(mclass);
}
function Main_RemoveClass(id, mclass) {
    var element = Main_getElementById(id);
    if (element) element.classList.remove(mclass);
}
/* Same listener wrapping as production Main.js: UIFocus owns dispatch order. */
function Main_addEventListener(type, fun) {
    Main_removeEventListener(type, fun);
    Main_body.addEventListener(type, UIFocus_Listener(type, fun));
}
function Main_removeEventListener(type, fun) {
    Main_body.removeEventListener(type, UIFocus_Listener(type, fun));
}
function Main_setTimeout(fun, timeout) {
    return window.setTimeout(fun, timeout);
}
function Main_clearTimeout(id) {
    window.clearTimeout(id);
}
function Main_SaveValuesWithTimeout() {}
function Main_ReloadScreen() {
    harness.reloadCount++;
}
var Main_FirstRun = false;
function Main_ExitCurrent(screen) {
    var obj = ScreenObj[screen];
    if (obj && obj.key_exit) obj.key_exit();
}
function Main_showAboutDialog() {}
function Main_showControlsDialog() {}
function Main_HideAboutDialog() {}
function Main_HideControlsDialog() {}
function Main_UpdateDialogShowCheck() {}
function Main_showExitDialog() {}
function Sidepannel_StartFeed() {}
function Sidepannel_ShowNoUserWarning() {}
function Sidepannel_Start() {}
function Sidepannel_Go() {}
var Screens_values_Play_data = null;
function Screens_OpenChannel() {};
/* Search.js is not loaded in this fixture; Navigation_SetAccount only needs its session end. */
function Search_SessionEnd() {}
/* Screens.js is not loaded either; Navigation_UpdateHint reads its subtarget constant and mode. */
var Screens_SubActions = 1;
function Screens_DirectInputMode() {
    return false;
}
/* Production Navigation_Close restores content through this global. */
function Screens_addFocus(force, key) {
    Harness_GridAddFocus(force, key);
}
function Screens_ObjNotNull() {
    return true;
}
function Screens_GetObj() {
    return ['harness', 'Harness stream', 'Harness title', '', '', '1'];
}
function Search_init() {}
function Search_exit() {}
function AddUser_init() {}
function Users_init() {}
function Settings_init() {}
function Settings_exit() {}

/* Production Navigation_Go reroutes through the screen lifecycle; keep it visible to the checks. */
var Harness_RealNavigationGo = Navigation_Go;
Navigation_Go = function (screen) {
    harness.goCount++;
    Harness_RealNavigationGo(screen);
};

/* Fixed app contract: one persistent wrapped keyup listener so held-key suppression is
 * released when the physical key is released, not only when a hold flow happens to listen. */
function Harness_KeyUpNoop() {}
Main_addEventListener('keyup', Harness_KeyUpNoop);

/* ------------------------- synthetic content screens ------------------------- */
function Harness_FocusElement(element) {
    if (!element || document.activeElement === element) return;
    try {
        element.focus({preventScroll: true});
    } catch (e) {
        element.focus();
    }
}

function Harness_CardElement(key) {
    var obj = ScreenObj[key];
    return document.getElementById(obj.ids[0] + obj.posY + '_' + obj.posX);
}

/* Fixed production contract: the grid takes DOM focus only if nothing else owns it. */
function Harness_GridMayOwnDomFocus(key) {
    if (key !== Main_values.Main_Go || Settings_isVisible()) return false;
    var active = document.activeElement;
    if (!active || !active.tagName || active === document.body) return true;
    var id = String(active.id || '');
    return id.indexOf(ScreenObj[key].ids[0]) === 0;
}

function Harness_GridAddFocus(forceScroll, key) {
    var element = Harness_CardElement(key),
        previous = document.querySelector('.' + Main_classThumb);
    if (previous && previous !== element) previous.classList.remove(Main_classThumb);
    if (!element) return;
    element.classList.add(Main_classThumb);
    if (Harness_GridMayOwnDomFocus(key)) Harness_FocusElement(element);
}

function Harness_GridRemoveFocus(key) {
    var element = Harness_CardElement(key);
    if (element) element.classList.remove(Main_classThumb);
}

function Harness_GridMove(key, dy, x) {
    var obj = ScreenObj[key];
    Harness_GridRemoveFocus(key);
    obj.posY += dy;
    obj.posX = x;
    Harness_GridAddFocus(true, key);
}

function Harness_GridKeyDown(event) {
    /* Input dispatch already happened in the UIFocus listener wrapper, as in production. */
    var key = Main_values.Main_Go,
        obj = ScreenObj[key];
    switch (event.keyCode) {
        case KEY_UP:
            if (!obj.posY) {
                Harness_GridRemoveFocus(key);
                Navigation_Open(Harness_GridKeyDown, 'tabs');
            } else Harness_GridMove(key, -1, obj.posX);
            break;
        case KEY_DOWN:
            Harness_GridMove(key, 1, obj.posX);
            break;
        case KEY_RIGHT:
            if (obj.posX < obj.ColumnsCount - 1) Harness_GridMove(key, 0, obj.posX + 1);
            break;
        case KEY_LEFT:
            if (obj.posX) Harness_GridMove(key, 0, obj.posX - 1);
            break;
        case KEY_ENTER:
            harness.watchCount++;
            break;
    }
}

function Harness_EmptyKeyDown(event) {
    if (event.keyCode === KEY_UP || event.keyCode === KEY_LEFT) Navigation_Open(Harness_EmptyKeyDown, event.keyCode === KEY_UP ? 'tabs' : 'rail');
}

function Harness_BuildGrid() {
    var root = document.getElementById('harness-grid'),
        obj = ScreenObj[Main_Live],
        y,
        x,
        cell;
    root.innerHTML = '';
    for (y = 0; y < 4; y++) {
        for (x = 0; x < obj.ColumnsCount; x++) {
            obj.DataObj[y + '_' + x] = ['img', 'Harness ' + y + x, 'Title ' + y + x];
            cell = document.createElement('div');
            cell.className = 'stream_cell';
            cell.innerHTML =
                '<div id="' + obj.ids[0] + y + '_' + x + '" class="stream_thumbnail_live" tabindex="-1" aria-label="Harness ' + y + x + '"></div>';
            root.appendChild(cell);
        }
    }
}

function Harness_ResetFocusTreatments() {
    var stray = document.querySelectorAll('.navigation-focused, .stream_thumbnail_focused, .stream_switch_focused'),
        i;
    for (i = 0; i < stray.length; i++) stray[i].classList.remove('navigation-focused', 'stream_thumbnail_focused', 'stream_switch_focused');
}

function Harness_SetupLive() {
    Main_values.Main_Go = Main_Live;
    harness.watchCount = 0;
    harness.goCount = 0;
    harness.reloadCount = 0;
    if (Harness_ShellOwnsActiveElement()) document.activeElement.blur(); // fresh screen: nothing in the shell keeps DOM focus
    Harness_ResetFocusTreatments();
    UIFocus_Clear();
    Navigation_State.origins = [];
    ScreenObj[Main_Live] = {
        screen: Main_Live,
        screenType: 0,
        ids: ['harness_cell_', 'harness_cell_img_', 'harness_cell_name_', 'harness_cell_holder_'],
        ColumnsCount: 3,
        itemsCount: 12,
        DataObj: {},
        posY: 0,
        posX: 1,
        FirstRunEnd: true,
        key_fun: Harness_GridKeyDown,
        addFocus: Harness_GridAddFocus,
        init_fun: function () {
            Main_addEventListener('keydown', Harness_GridKeyDown);
            Harness_GridAddFocus(true, Main_Live);
        },
        key_exit: function () {}
    };
    Harness_BuildGrid();
    /* Other destinations may be activated incidentally; they only need the lifecycle no-ops. */
    var stubs = [
        Main_UserVod, Main_UserChannels, Main_usergames, Main_Featured, Main_games, Main_Vod, Main_Clip, Main_Search,
        Main_SearchLive, Main_SearchChannels, Main_SearchGames, Main_SearchVod, Main_HistoryLive, Main_HistoryVod,
        Main_HistoryClip, Main_Users, Main_addUser, Main_Blocked
    ];
    for (var s = 0; s < stubs.length; s++) {
        if (!ScreenObj[stubs[s]])
            ScreenObj[stubs[s]] = {
                ids: ['harness_stub_'],
                DataObj: {},
                itemsCount: 0,
                posY: 0,
                posX: 0,
                screenType: 0,
                init_fun: function () {},
                key_exit: function () {}
            };
    }
    Navigation_Render(Main_Live);
    Main_addEventListener('keydown', Harness_GridKeyDown);
    Harness_GridAddFocus(true, Main_Live);
}

function Harness_SetupEmpty() {
    Main_removeEventListener('keydown', Harness_GridKeyDown);
    if (Harness_ShellOwnsActiveElement()) document.activeElement.blur();
    Harness_ResetFocusTreatments();
    UIFocus_Clear();
    Main_values.Main_Go = Main_UserLive;
    ScreenObj[Main_UserLive] = {
        screen: Main_UserLive,
        screenType: 0,
        ids: ['harness_empty_'],
        itemsCount: 0,
        emptyContent: true,
        DataObj: {},
        posY: 0,
        posX: 0,
        key_fun: Harness_EmptyKeyDown,
        key_exit: function () {},
        start_fun: function () {}
    };
    Navigation_Render(Main_UserLive);
    Navigation_LoadState(Main_UserLive, 'empty');
    Main_addEventListener('keydown', Harness_EmptyKeyDown);
}

/* ------------------------- input and checks ------------------------- */
function Harness_KeyEvent(type, code) {
    var event = new KeyboardEvent(type, {bubbles: true, cancelable: true, keyCode: code, which: code});
    if (event.keyCode !== code) {
        try {
            Object.defineProperty(event, 'keyCode', {value: code});
            Object.defineProperty(event, 'which', {value: code});
        } catch (e) {}
    }
    return event;
}

function Harness_KeyDown(code) {
    (document.activeElement || document.body).dispatchEvent(Harness_KeyEvent('keydown', code));
}

function Harness_KeyUp(code) {
    (document.activeElement || document.body).dispatchEvent(Harness_KeyEvent('keyup', code));
}

/* A normal remote press is key-down then key-up; UIFocus suppression expects the release. */
function Harness_Press(code) {
    Harness_KeyDown(code);
    Harness_KeyUp(code);
}

/* Held keys close an overlay and are released afterwards, like a real long press. */
function Harness_HoldDown(code) {
    Harness_KeyDown(code);
}

function Harness_HoldUp(code) {
    Harness_KeyUp(code);
}

var Harness_Checks = [];
function Harness_Check(name, condition, detail) {
    Harness_Checks.push({name: name, pass: Boolean(condition), detail: detail || ''});
}

/* dispatchEvent does not propagate listener exceptions to the caller; surface them as failures. */
window.addEventListener('error', function (event) {
    Harness_Checks.push({name: 'page error', pass: false, detail: event.message + ' (' + (event.filename || '') + ':' + event.lineno + ')'});
});

function Harness_ShellFocusedCount() {
    return document.querySelectorAll('#navigation-shell .navigation-focused').length;
}

function Harness_ShellOwnsActiveElement() {
    var shell = document.getElementById('navigation-shell'),
        active = document.activeElement;
    return Boolean(active && shell && shell.contains(active));
}

function Harness_VerifyContentRestore(label, expectedId) {
    Harness_Check(label + ': navigation closed', Navigation_Region === '', 'region ' + Navigation_Region);
    Harness_Check(label + ': no shell focus treatment remains', Harness_ShellFocusedCount() === 0, String(Harness_ShellFocusedCount()) + ' focused');
    Harness_Check(label + ': shell released DOM focus', !Harness_ShellOwnsActiveElement(), String(document.activeElement && document.activeElement.id));
    Harness_Check(
        label + ': card owns DOM focus',
        document.activeElement === document.getElementById(expectedId),
        String(document.activeElement && document.activeElement.id)
    );
    Harness_Check(label + ': exactly one visible focus treatment', document.querySelectorAll('.navigation-focused, .' + Main_classThumb).length === 1);
}

function Harness_CaseRailClose(closeKey, label) {
    Harness_SetupLive();
    Harness_Press(KEY_UP); // card -> tabs
    Harness_Check(label + ': tabs opened', Navigation_Region === 'tabs', Navigation_Region);
    Harness_Press(KEY_LEFT); // tabs -> rail
    Harness_Check(label + ': rail opened', Navigation_Region === 'rail', Navigation_Region);
    Harness_Press(closeKey); // back to content
    Harness_VerifyContentRestore(label, 'harness_cell_0_1');
    Harness_Press(KEY_DOWN); // next key must affect the restored card, never the rail
    Harness_Check(label + ': next Down reaches the grid', document.activeElement === document.getElementById('harness_cell_1_1'), String(document.activeElement && document.activeElement.id));
    Harness_Check(label + ': navigation stayed closed', Navigation_Region === '', Navigation_Region);
    Harness_Press(KEY_ENTER);
    Harness_Check(label + ': OK watches once', harness.watchCount === 1, String(harness.watchCount));
    Harness_Check(label + ': OK did not navigate', harness.goCount === 0, String(harness.goCount));
}

function Harness_CaseTabsClose(closeKey, label) {
    Harness_SetupLive();
    Harness_Press(KEY_UP); // card -> tabs
    Harness_Press(closeKey); // back to content
    Harness_VerifyContentRestore(label, 'harness_cell_0_1');
    Harness_Press(KEY_RIGHT);
    Harness_Check(label + ': next Right moves the card', document.activeElement === document.getElementById('harness_cell_0_2'), String(document.activeElement && document.activeElement.id));
    Harness_Check(label + ': navigation stayed closed', Navigation_Region === '', Navigation_Region);
}

function Harness_CaseHeldKeys() {
    Harness_SetupLive();
    Harness_Press(KEY_UP); // card -> tabs (released)
    Harness_HoldDown(KEY_LEFT); // opens rail, Left stays held
    Harness_Check('held keys: rail opened', Navigation_Region === 'rail', Navigation_Region);
    Harness_HoldDown(KEY_RIGHT); // close while Left still held
    Harness_VerifyContentRestore('held keys', 'harness_cell_0_1');
    Harness_HoldUp(KEY_LEFT);
    Harness_HoldUp(KEY_UP);
    Harness_HoldUp(KEY_RIGHT); // the closing key is also released afterwards
    Harness_Check('held keys: releases reopen nothing', Navigation_Region === '', Navigation_Region);
    Harness_Check('held keys: releases watch nothing', harness.watchCount === 0, String(harness.watchCount));
    Harness_Check('held keys: releases navigate nowhere', harness.goCount === 0, String(harness.goCount));
}

function Harness_CaseEnterRepeat() {
    Harness_SetupLive();
    Harness_Press(KEY_UP);
    Harness_Press(KEY_LEFT); // rail
    Harness_HoldDown(KEY_ENTER); // activate Browse once
    Harness_HoldDown(KEY_ENTER); // repeat while held
    Harness_Check('enter repeat: single activation', harness.goCount === 1, String(harness.goCount));
    Harness_Check('enter repeat: navigation closed after activation', Navigation_Region === '', Navigation_Region);
    Harness_HoldUp(KEY_ENTER);
    Harness_Check('enter release: no second activation', harness.goCount === 1, String(harness.goCount));
}

function Harness_CaseRerenderWhileOpen() {
    Harness_SetupLive();
    Harness_Press(KEY_UP);
    Harness_Press(KEY_LEFT);
    Navigation_Render(Main_Live); // refresh/reorder re-renders shell buttons while the rail is open
    Harness_Press(KEY_RIGHT);
    Harness_VerifyContentRestore('rerender', 'harness_cell_0_1');
}

function Harness_CaseEmptyReturn() {
    Harness_SetupEmpty();
    Harness_Press(KEY_LEFT); // empty screen opens the rail
    Harness_Check('empty: rail opened', Navigation_Region === 'rail', Navigation_Region);
    Harness_Press(KEY_RIGHT);
    Harness_Check('empty: navigation closed', Navigation_Region === '', Navigation_Region);
    Harness_Check(
        'empty: retry action owns DOM focus',
        document.activeElement === document.getElementById('navigation-retry'),
        String(document.activeElement && document.activeElement.id)
    );
    Harness_Check('empty: no card focus treatment exists', document.querySelectorAll('.' + Main_classThumb).length === 0);
    harness.reloadCount = 0;
    harness.goCount = 0;
    Harness_Press(KEY_ENTER);
    Harness_Check('empty: primary action leaves the empty screen once', harness.goCount === 1, String(harness.goCount));
    Harness_Check('empty: primary action is browse, not a pointless refresh', harness.reloadCount === 0, String(harness.reloadCount));
}

function Harness_Run() {
    try {
        Harness_CaseRailClose(KEY_RIGHT, 'rail right');
        Harness_CaseRailClose(KEY_RETURN, 'rail back');
        Harness_CaseTabsClose(KEY_DOWN, 'tabs down');
        Harness_CaseTabsClose(KEY_RETURN, 'tabs back');
        Harness_CaseHeldKeys();
        Harness_CaseEnterRepeat();
        Harness_CaseRerenderWhileOpen();
        Harness_CaseEmptyReturn();
    } catch (error) {
        Harness_Checks.push({name: 'harness exception', pass: false, detail: String(error && error.stack)});
    }
    var failed = 0,
        i,
        lines = [];
    for (i = 0; i < Harness_Checks.length; i++) {
        if (!Harness_Checks[i].pass) failed++;
        lines.push((Harness_Checks[i].pass ? 'PASS ' : 'FAIL ') + Harness_Checks[i].name + (Harness_Checks[i].detail ? '  [' + Harness_Checks[i].detail + ']' : ''));
    }
    lines.push(failed ? failed + ' checks FAILED' : 'all ' + Harness_Checks.length + ' checks passed');
    var output = document.getElementById('harness-results');
    output.textContent = lines.join('\n');
    output.className = failed ? 'harness-fail' : 'harness-pass';
    window.__remoteRegression = {passed: !failed, failed: failed, total: Harness_Checks.length, results: Harness_Checks};
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', Harness_Run);
else Harness_Run();
