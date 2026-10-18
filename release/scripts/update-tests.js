/* Focused regression checks for TV update state and APK handoff. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const source = fs.readFileSync('app/specific/Main.js', 'utf8');
let passed = 0;
function check(value, label) {
    assert.ok(value, label);
    passed++;
}
function loadFunction(name, sandbox) {
    const start = source.indexOf('function ' + name + '(');
    assert.ok(start !== -1, name);
    vm.runInContext(source.slice(start, source.indexOf('\n}', start) + 2), sandbox);
}
const calls = [];
const timers = new Map();
const s = {
    version: {WebTag: 748, publishVersionCode: 389, ApkUrl: 'release.apk'},
    Main_IsOn_OSInterface: true,
    Main_HasUpdate: true,
    Main_IsWebupdate: false,
    Main_Ischecking: true,
    Main_UpdateCursor: 0,
    Main_ApkUpdateTimer: null,
    Main_values: {IsUpDating: false},
    Main_isUpdateDialogVisible: () => true,
    Main_isAboutDialogVisible: () => false,
    Main_getclock: () => 'fixture clock',
    Main_SaveValues: () => calls.push('save'),
    Main_HideLoadDialog: () => calls.push('hide'),
    Main_showLoadDialog: () => calls.push('loading'),
    Main_innerHTML: (id, value) => calls.push([id, value]),
    Main_UpdateDialogTitle: () => calls.push('title'),
    Main_UpdateDialogSetTitle: () => calls.push('button'),
    Navigation_SetUpdateBadge: available => calls.push(['badge', available]),
    Main_WarnUpdate: web => calls.push(['warn', web]),
    Main_clearTimeout: id => timers.delete(id),
    Main_setTimeout: (fn, delay) => {
        check(delay === 120000, 'watchdog has bounded timeout');
        const id = timers.size + 1;
        timers.set(id, fn);
        return id;
    },
    OSInterface_getInstallFromPLay: () => false,
    OSInterface_showToast: text => calls.push(['toast', text]),
    OSInterface_UpdateAPK: url => calls.push(['apk', url]),
    STR_UPDATE_FAIL: 'failed',
    STR_UPDATE_FAIL_DOWNLOAD: 'download failed',
    STR_UPDATE_START: 'starting',
    STR_UPDATE_PLAY: 'play store',
    STR_UPDATE_CHECKING_FAIL: 'check failed',
    STR_NO_UPDATES: 'no updates'
};
vm.createContext(s);
['Main_CheckUpdateResult', 'Main_CheckUpdateFail', 'Main_ApkUpdateFinished', 'Main_UpdateDialogKeyEnter'].forEach(name => loadFunction(name, s));
const result = (apk, web) => s.Main_CheckUpdateResult(JSON.stringify({publishVersionCode: apk, WebTag: web, changelog: [], ApkUrl: 'new.apk'}));
result(389, 748);
check(s.Main_HasUpdate === false, 'current installed version clears stale APK warning');
check(s.Main_IsWebupdate === false, 'current installed version clears stale web warning');
check(
    calls.some(c => Array.isArray(c) && c[0] === 'label_update' && c[1] === ''),
    'current version clears update label'
);
check(calls.some(c => Array.isArray(c) && c[0] === 'badge' && c[1] === false), 'current version clears the rail badge');
check(s.Main_Ischecking === false, 'successful check releases check state');
result(390, 749);
check(s.Main_HasUpdate && !s.Main_IsWebupdate, 'APK update takes precedence over web update');
result(389, 749);
check(s.Main_HasUpdate && s.Main_IsWebupdate, 'web update alone correctly selected');
s.Main_Ischecking = true;
s.Main_CheckUpdateFail();
check(!s.Main_Ischecking, 'failed version check permits retry');
s.Main_IsWebupdate = false;
s.Main_HasUpdate = true;
s.Main_values.IsUpDating = true; //persisted state from an earlier failed attempt
s.Main_UpdateDialogKeyEnter();
check(timers.size === 1, 'persisted updating flag does not block a fresh attempt');
check(calls.filter(c => Array.isArray(c) && c[0] === 'apk').length === 1, 'first click starts download');
s.Main_UpdateDialogKeyEnter();
check(calls.filter(c => Array.isArray(c) && c[0] === 'apk').length === 1, 'duplicate clicks cannot start concurrent download');
s.Main_ApkUpdateFinished();
check(timers.size === 0 && s.Main_ApkUpdateTimer === null, 'native callback cancels watchdog');
check(s.Main_values.IsUpDating === false, 'native callback resets updating state');
check(calls.includes('hide'), 'native callback hides loading screen');
s.Main_UpdateDialogKeyEnter();
check(calls.filter(c => Array.isArray(c) && c[0] === 'apk').length === 2, 'retry works after cancelled installer or failed download');
[...timers.values()][0]();
check(s.Main_values.IsUpDating === false && timers.size === 0, 'old APK watchdog releases endless loading state');
check(
    calls.some(c => Array.isArray(c) && c[0] === 'toast' && c[1] === 'failed'),
    'watchdog explains failure'
);
const manifest = fs.readFileSync('apk/app/src/main/AndroidManifest.xml', 'utf8').replace(/<!--[\s\S]*?-->/g, '');
check(manifest.includes('android.permission.REQUEST_INSTALL_PACKAGES'), 'installed APK declares install permission outside comments');
console.log(passed + ' update checks passed');
