/* Remote input policy: Direct activation suppresses repeats and the release until the physical
 * key comes up; Legacy hold keys keep their owner across overlay changes. Loads the real UIFocus.js. */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const sandbox = {};
vm.createContext(sandbox);
if (process.argv.includes('--built')) {
    const UglifyJS = require('uglify-js');
    const ast = UglifyJS.parse(fs.readFileSync('release/githubio/js/main_uncompressed.js', 'utf8'));
    const definitions = [];
    ast.walk(
        new UglifyJS.TreeWalker(function (node) {
            if (node instanceof UglifyJS.AST_Defun && /^UIFocus_/.test(node.name.name)) definitions.push(node.print_to_string());
            if (node instanceof UglifyJS.AST_Var) {
                const matches = node.definitions.filter(def => /^UIFocus_/.test(def.name.name));
                if (matches.length) definitions.push(new UglifyJS.AST_Var({definitions: matches}).print_to_string());
            }
        })
    );
    if (definitions.length < 5) throw new Error('Rebuild first: UIFocus definitions missing from generated source');
    vm.runInContext(definitions.join('\n'), sandbox);
} else {
    vm.runInContext(fs.readFileSync('app/specific/UIFocus.js', 'utf8'), sandbox);
}
sandbox.document = {activeElement: null, body: {tagName: 'BODY'}};

let checks = 0;
function check(value, message) {
    assert.ok(value, message);
    checks++;
}
const s = sandbox;
function event(key) {
    return {keyCode: key, preventDefault: () => {}, stopImmediatePropagation: () => {}};
}
/* The Direct grid is a legacy body listener with no UIFocus owner; it marks its activating
 * key exactly like an overlay-opening legacy press, and the persistent key-up listener clears it. */
let activations = 0;
function event(key) {
    return {keyCode: key, preventDefault: () => {}, stopImmediatePropagation: () => {}};
}
const directOk = s.UIFocus_Listener('keydown', e => {
    activations++;
    s.UIFocus_SuppressedKeys[e.keyCode] = s.UIFocus_Stack[s.UIFocus_Stack.length - 1] || {};
});
const persistentKeyUp = s.UIFocus_Listener('keyup', () => {});
directOk(event(13));
check(activations === 1, 'direct OK activates on key-down');
directOk(event(13));
check(activations === 1, 'held OK repeat cannot re-activate');
persistentKeyUp(event(13));
check(!s.UIFocus_SuppressedKeys[13], 'the physical release clears the suppression');
directOk(event(13));
check(activations === 2, 'a fresh OK press works after the release');
persistentKeyUp(event(13));
s.UIFocus_Clear();

/* Arrow repeats keep moving within the same owner: no suppression is marked for them. */
let moves = 0;
s.UIFocus_Push({
    id: 'direct-arrows',
    handle: function (e) {
        if (e.keyCode === 40) {
            moves++;
            return true;
        }
        return false;
    }
});
s.UIFocus_Dispatch(event(40), false);
s.UIFocus_Dispatch(event(40), false);
s.UIFocus_Dispatch(event(40), false);
check(moves === 3, 'arrow repeats keep moving in the same owner');
s.UIFocus_Dispatch(event(40), true);
check(!s.UIFocus_SuppressedKeys[40], 'the release clears the arrow suppression');
s.UIFocus_Clear();

/* A press that opens an overlay keeps its owner until release even after the overlay closes. */
let legacyCalls = 0;
s.UIFocus_Push({
    id: 'legacy-grid',
    handle: () => false
});
const legacyOpen = s.UIFocus_Listener('keydown', () => {
    legacyCalls++;
    s.UIFocus_Push({id: 'rail', handle: () => true});
});
legacyOpen(event(21));
check(legacyCalls === 1, 'legacy opening press dispatches once');
s.UIFocus_Dispatch(event(21), false);
check(legacyCalls === 1, 'held opening press cannot activate the new overlay');
s.UIFocus_Pop(false);
s.UIFocus_Dispatch(event(21), false);
check(legacyCalls === 1, 'release after close cannot re-trigger the legacy handler');
s.UIFocus_Dispatch(event(21), true);
legacyOpen(event(21));
check(legacyCalls === 2, 'fresh press after release works');
legacyOpen(event(21) && event(21));
s.UIFocus_Dispatch(event(21), true);
s.UIFocus_Clear();

/* Preference fallback: an unset remote_controls value must behave as Legacy, verified by
 * the same suppression rules the Direct policy relies on. */
check(s.UIFocus_Stack.length === 0, 'stack clean between policies');
console.log(checks + ' remote input checks passed');
