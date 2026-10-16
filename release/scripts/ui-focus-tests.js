/* Production focus/input helpers, tested without a second implementation or a browser. */
const assert = require('assert');
const s = require('./ui-test-sandbox')();
let checks = 0;
function check(value, message) {
    assert.ok(value, message);
    checks++;
}
for (const count of [0, 1, 2, 3, 4, 6, 7, 30]) {
    for (let i = 0; i < count; i++) {
        for (const direction of ['left', 'right', 'up', 'down']) {
            const next = s.UIFocus_GridNeighbor(i, 3, count, direction);
            check(next >= 0 && next < count, 'valid neighbor ' + [count, i, direction]);
            if (direction === 'right' || direction === 'left') check(Math.floor(next / 3) === Math.floor(i / 3), 'no row wrapping');
        }
    }
}
check(s.UIFocus_GridNeighbor(0, 3, 0, 'right') === -1, 'empty grid has no focus');
check(s.UIFocus_Resolve([{id: 'a'}, {id: 'b'}, {id: 'c'}], 'b', 0) === 1, 'restore identity after reorder');
check(s.UIFocus_Resolve([{id: 'c'}, {id: 'a'}], 'b', 1) === 1, 'nearest surviving index');
check(s.UIFocus_Resolve([{id: 'a'}], 'missing', 90) === 0, 'clamp removed tail');
check(s.UIFocus_Resolve([], 'a', 0) === -1, 'empty recovery');
let child = 0,
    parent = 0,
    cleanup = 0,
    restore = 0,
    prevented = 0,
    stopped = 0;
function event(key) {
    return {keyCode: key, preventDefault: () => prevented++, stopImmediatePropagation: () => stopped++};
}
s.UIFocus_Push({
    id: 'bar',
    handle: () => {
        parent++;
        return true;
    }
});
s.UIFocus_Push({
    id: 'drawer',
    handle: () => {
        child++;
        s.UIFocus_Pop();
        return true;
    },
    cleanup: () => cleanup++,
    restore: () => restore++
});
check(s.UIFocus_Dispatch(event(13), false), 'nested owner handles enter');
check(parent === 0 && child === 1, 'only top owner sees input');
check(cleanup === 1 && restore === 1, 'close cleans timer and restores exactly once');
check(s.UIFocus_Dispatch(event(13), false), 'held Enter cannot escape closed drawer');
check(parent === 0, 'repeat cannot activate parent');
check(s.UIFocus_Dispatch(event(13), true), 'keyup retained by closing owner');
check(parent === 0, 'keyup cannot activate parent');
check(prevented === 3 && stopped === 3, 'handled events cannot reach legacy handlers');
check(s.UIFocus_Suspend('bar', true), 'legacy dialog suspends new owner');
check(!s.UIFocus_Dispatch(event(39), false), 'legacy modal owns its input');
s.UIFocus_Suspend('bar', false);
check(s.UIFocus_Dispatch(event(39), false), 'resume new owner');
s.UIFocus_Clear();
check(s.UIFocus_Dispatch(event(39), true), 'key up still consumed after all owners close');
check(!s.UIFocus_Dispatch(event(38), false), 'legacy handler receives input without overlay');
s.UIFocus_Push({id: 'repeat', handle: () => true, cleanup: () => cleanup++});
s.UIFocus_Push({id: 'repeat', handle: () => true});
check(cleanup === 2 && s.UIFocus_Stack.length === 1, 'reopening cleans previous timer');
s.UIFocus_Clear();
s.UIFocus_Push({id: 'parent', handle: () => true, cleanup: () => cleanup++});
s.UIFocus_Push({id: 'child', handle: () => true, cleanup: () => cleanup++});
s.UIFocus_Push({id: 'parent', handle: () => true});
check(cleanup === 4 && s.UIFocus_Stack.length === 1, 'reopening parent cancels descendants');
s.UIFocus_Clear();
check(!s.UIFocus_Push({id: 'bad'}), 'invalid owner rejected');
s.UIFocus_Clear();
let opened = 0;
const openFromLegacy = s.UIFocus_Listener('keydown', () => {
    s.UIFocus_Push({
        id: 'opened',
        handle: () => {
            opened++;
            return true;
        }
    });
});
openFromLegacy(event(13));
check(s.UIFocus_Dispatch(event(13), false), 'opening legacy Enter repeat consumed');
check(opened === 0, 'held opening Enter cannot activate first drawer row');
s.UIFocus_Dispatch(event(13), true);
s.UIFocus_Dispatch(event(13), false);
check(opened === 1, 'fresh Enter works after opening key released');
s.UIFocus_Dispatch(event(13), true);
s.UIFocus_Clear();
console.log(checks + ' production focus checks passed');
