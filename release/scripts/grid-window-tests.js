/* Run the production grid row window (Screens_addrow and helpers) against stub rows: after every
 * Up/Down the focused row must be attached and rest in the visible top slot. */
const fs = require('fs'),
    vm = require('vm'),
    assert = require('assert'),
    UglifyJS = require('uglify-js');
const built = process.argv.includes('--built');
const source = fs.readFileSync(built ? 'release/githubio/js/main_uncompressed.js' : 'app/specific/Screens.js', 'utf8');
const wanted = /^Screens_(addrow|addrowDown|addrowEnd?Window|addrowWindow|addrowNotAnimated|SetWindowOffset)$/;
const definitions = [];
UglifyJS.parse(source).walk(
    new UglifyJS.TreeWalker(node => {
        if (node instanceof UglifyJS.AST_Defun && wanted.test(node.name.name)) definitions.push(node.print_to_string());
    })
);
if (definitions.length < 5) throw new Error('grid window functions not found' + (built ? '; rebuild first' : ''));

let checks = 0;
function check(value, label) {
    assert.ok(value, label);
    checks++;
}

function makeRun(rowCount) {
    const table = {
        children: [],
        get childNodes() {
            return this.children;
        },
        appendChild(node) {
            this.removeChild(node);
            this.children.push(node);
            node.parentNode = this;
        },
        insertBefore(node, ref) {
            this.removeChild(node);
            const at = ref ? this.children.indexOf(ref) : -1;
            if (at < 0) this.children.push(node);
            else this.children.splice(at, 0, node);
            node.parentNode = this;
        },
        removeChild(node) {
            const at = this.children.indexOf(node);
            if (at > -1) this.children.splice(at, 1);
            node.parentNode = null;
        }
    };
    const cells = [];
    for (let i = 0; i < rowCount; i++) {
        const cell = {
            row: i,
            style: {transform: ''},
            parentNode: null,
            remove() {
                if (this.parentNode) this.parentNode.removeChild(this);
            }
        };
        cells.push(cell);
    }
    const screen = {
        Cells: cells,
        tableDoc: table,
        ScrollDoc: {style: {transform: ''}},
        offsettop: 10,
        currY: 0,
        posY: 0,
        HasSwitches: false,
        loadingData: false
    };
    const s = {
        Math,
        ScreenObj: {k: screen},
        Screens_ChangeFocusAnimationFinished: true,
        Screens_SettingDoAnimations: false,
        Screens_ChangeFocusAnimationFast: false,
        Screens_ScrollAnimationTimeout: 0,
        Screens_LoadPreview: () => {},
        Screens_addrowEnd: () => {},
        Screens_addrowAnimated: () => {
            throw new Error('animations are disabled in this harness');
        },
        Main_RemoveElement: ele => {
            if (ele) ele.remove();
        },
        Main_setTimeout: fn => fn()
    };
    vm.createContext(s);
    vm.runInContext(definitions.join('\n'), s);
    // Initial render (Screens_createRow*): the first three rows in slots 0..2.
    for (let i = 0; i < Math.min(3, rowCount); i++) {
        cells[i].style.transform = 'translateY(' + i * screen.offsettop + 'em)';
        table.appendChild(cells[i]);
    }
    function translate(style) {
        const match = /translateY\((-?[\d.]+)em\)/.exec(style.transform || '');
        return match ? Number(match[1]) : 0;
    }
    return {
        screen,
        move(delta) {
            screen.posY += delta;
            s.Screens_addrow(false, screen.posY, 'k');
            screen.currY = screen.posY;
        },
        visibleTop(row) {
            const cell = cells[row];
            if (cell.parentNode !== table) return null;
            return translate(cell.style) + translate(screen.ScrollDoc.style);
        }
    };
}

for (const rows of [2, 3, 4, 5, 6, 10]) {
    const run = makeRun(rows);
    const path = [];
    for (let y = 1; y < rows; y++) path.push(1);
    for (let y = rows - 1; y > 0; y--) path.push(-1);
    // A second descent after returning to the top, then a partial climb from the end.
    for (let y = 1; y < rows; y++) path.push(1);
    for (let y = 0; y < Math.min(2, rows - 1); y++) path.push(-1);
    for (const delta of path) {
        run.move(delta);
        const y = run.screen.posY;
        check(run.visibleTop(y) === 0, rows + ' rows: focused row ' + y + ' attached in the visible top slot (got ' + run.visibleTop(y) + ')');
    }
}

console.log(checks + ' grid window checks passed');
