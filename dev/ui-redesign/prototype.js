/* Isolated synthetic UI fixture. Production navigation/focus helpers are loaded directly. */
(function () {
    'use strict';
    var names = ['NightShift', 'MiraMakes', 'OrbitRacing', 'QuietForest', 'StudioNorth', 'PixelGarden'];
    var categories = ['VALORANT', 'Art', 'Trackmania', 'Minecraft', 'Just Chatting', 'Stardew Valley'];
    var titles = ['One more round with the team', 'A new world, one brushstroke at a time', 'Finding the perfect racing line', 'Building somewhere to call home', 'An evening with the community', 'A fresh start on the farm'];
    var destinations = ['Following', 'Browse', 'Search', 'Library', 'Account', 'Settings', 'Exit'];
    var icons = ['heart', 'gamepad', 'search', 'history', 'user', 'options', 'return'];
    var tabLabels = {following: ['Live now', 'Videos', 'Channels', 'Categories'], browse: ['Live', 'Featured', 'Categories', 'Videos', 'Clips'], library: ['Live', 'Videos', 'Clips'], search: ['Search', 'Live', 'Channels', 'Categories', 'Videos'], account: ['Switch account', 'Add account', 'Own channel', 'Blocked channels'], settings: ['Interface', 'Player', 'Chat', 'Notifications', 'Backup & sync']};
    var destination = 'following', tab = 0, focusedItem = 0, watching = null, playing = true, quality = '1080p60 · Source', chat = false, layout = 'Single stream';
    var items = [], barTimer = null, noticeTimer = null, railOrigin = null;
    var groups = {
        Chat: ['Chat on phone', 'Show chat', 'Write to chat', 'Chat settings'],
        Quality: ['Auto', '1080p60 · Source', '720p60', '480p'],
        Layout: ['Single stream', 'Side by side chat', 'Picture in picture', 'Multistream'],
        More: ['Channels', 'Channel / content', 'Playback', 'Audio', 'Preview', 'Diagnostics'],
        'Chat settings': ['Position', 'Size', 'Delay', 'Font size', 'Shared chat', 'Force disable chat'],
        'Channel / content': ['Channel details', 'Category', 'Follow / unfollow', 'Open live', 'Open VOD'],
        Playback: ['Rewind', 'Speed', 'Chapters', 'Open in external player', 'Screen off'],
        Audio: ['Audible stream', 'Mute', 'Volume', 'Enable all', 'All volumes to 100%'],
        Preview: ['Show preview', 'Size', 'Preview volume', 'Main player volume'],
        Diagnostics: ['Player status', 'Resync', 'Controls help']
    };
    function el(id) { return document.getElementById(id); }
    function focus(id) { var target = el(id); if (target) target.focus(); }
    function button(text, id, action, className) {
        var node = document.createElement('button');
        node.type = 'button'; node.id = id; node.className = className || ''; node.textContent = text; node.onclick = action;
        return node;
    }
    function reset(node) { while (node.firstChild) node.removeChild(node.firstChild); }
    function notice(text) { el('notice').textContent = text; el('notice').hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(function () { el('notice').hidden = true; }, 3200); }
    function currentOwner() { return UIFocus_Stack[UIFocus_Stack.length - 1]; }
    function moveFocus(container, direction) {
        var list = Array.prototype.slice.call(el(container).querySelectorAll('button:not(:disabled)'));
        var index = list.indexOf(document.activeElement);
        index = Math.max(0, Math.min(list.length - 1, index + direction));
        if (list[index]) list[index].focus();
    }
    function renderRail() {
        reset(el('destinations')); reset(el('utilities'));
        destinations.forEach(function (label, index) {
            var id = label.toLowerCase();
            var node = button('', 'nav-' + id, function () {
                closeRail(false);
                if (id === 'exit') { showDialog('Exit', 'This is a local design fixture. No app will be closed.', 'Close'); return; }
                destination = id; tab = 0; render(); focus('tab-0');
            });
            node.setAttribute('aria-label', label);
            if (destination === id) node.setAttribute('aria-current', 'page');
            var icon = document.createElement('i'); icon.className = 'icon icon-' + icons[index]; icon.setAttribute('aria-hidden', 'true');
            var text = document.createElement('span'); text.textContent = label;
            node.appendChild(icon); node.appendChild(text);
            el(index > 4 ? 'utilities' : 'destinations').appendChild(node);
        });
    }
    function openRail() {
        railOrigin = document.activeElement.id;
        el('rail').classList.add('expanded');
        UIFocus_Push({id: 'rail', handle: function (event, up) {
            if (up) return true;
            if (event.keyCode === 38 || event.keyCode === 40) moveFocus('rail', event.keyCode === 38 ? -1 : 1);
            else if (event.keyCode === 39 || event.keyCode === 27 || event.keyCode === 8) closeRail(true);
            else if (event.keyCode === 13) document.activeElement.click();
            return true;
        }, cleanup: function () { el('rail').classList.remove('expanded'); }});
        focus('nav-' + destination);
    }
    function closeRail(restore) { if (currentOwner() && currentOwner().id === 'rail') UIFocus_Pop(false); if (restore) focus(railOrigin); }
    function makeItems() {
        var count = parseInt(el('count').value, 10), i;
        items = [];
        for (i = 0; i < count; i++) items.push({id: 'channel-' + i, name: names[i % 6] + (i > 5 ? ' ' + (i + 1) : ''), category: categories[i % 6], title: titles[i % 6], viewers: ['12.4K', '842', '3.1K', '1.7K', '6.2K', '968'][i % 6]});
    }
    function selectItem(index) {
        focusedItem = index;
        var item = items[index]; if (!item) return;
        el('detail-category').textContent = item.category;
        el('detail-title').textContent = el('scenario').value === 'long' ? item.title + ' — Eine besonders lange Sendungsbeschreibung für den Fernseher' : item.title;
        el('detail-name').textContent = item.name + ' · ' + item.viewers + ' watching';
        el('position').textContent = (index + 1) + ' / ' + items.length;
    }
    function saveFocus() {
        var screen = Navigation_Target(destination, tab);
        if (screen !== null && items[focusedItem]) Navigation_SaveBookmark(screen, 'fixture', items[focusedItem].id, focusedItem, 0);
    }
    function render() {
        renderRail();
        el('heading').textContent = destinations.filter(function (x) { return x.toLowerCase() === destination; })[0];
        var labels = tabLabels[destination] || ['Live now'];
        reset(el('tabs'));
        labels.forEach(function (label, index) {
            var node = button(label, 'tab-' + index, function () {
                saveFocus(); tab = index;
                var screen = Navigation_Target(destination, tab); if (screen !== null) Navigation_Enter(screen);
                render(); focus('tab-' + index);
            });
            node.setAttribute('role', 'tab'); node.setAttribute('aria-selected', index === tab ? 'true' : 'false');
            el('tabs').appendChild(node);
        });
        el('tabs').setAttribute('aria-label', el('heading').textContent + ' content');
        reset(el('grid')); reset(el('state'));
        var state = el('scenario').value;
        var messages = {
            loading: ['Finding your live channels', 'Loading synthetic fixture content. Navigation remains available.', null],
            'no-account': ['Your channels, together', 'Add an account to see who you follow. You can also browse without one.', 'Add account'],
            auth: ['Reconnect your account', 'Your account is saved. Reauthorize to load followed channels.', 'Reconnect'],
            empty: ['A quiet moment', 'None of your followed channels is live. Browse live channels or try again later.', 'Browse live'],
            error: ['Could not load your channels', 'Check the connection, then try again.', 'Retry']
        };
        if (!items.length && !messages[state]) state = 'empty';
        if (destination === 'account') messages[state = 'account'] = ['Alex · Demo account', 'Switch accounts, add an account, open your channel, or manage blocked channels with the tabs above.', 'Switch account'];
        if (destination === 'settings') messages[state = 'settings'] = ['Keep it your way', 'Existing settings keep their saved values. This fixture only previews the new grouping.', 'Open group'];
        if (destination === 'search') messages[state = 'search'] = ['Find a channel or category', 'The production search keyboard and query handling will remain authoritative.', 'Search demo'];
        var message = messages[state];
        el('state').hidden = !message; el('grid').hidden = Boolean(message); el('details').hidden = Boolean(message);
        el('account').textContent = state === 'no-account' ? 'No account · Browse freely' : 'Alex · Demo account';
        if (message) {
            var h = document.createElement('h2'); h.textContent = message[0]; el('state').appendChild(h);
            var p = document.createElement('p'); p.textContent = message[1]; el('state').appendChild(p);
            if (message[2]) el('state').appendChild(button(message[2], 'recover', function () {
                if (state === 'account') { Navigation_SetAccount(Navigation_State.account === 'alex' ? 'morgan' : 'alex'); notice('Account changed · old route operations invalidated'); }
                if (state === 'no-account') { Navigation_SetAccount('alex'); notice('Demo account added'); }
                if (state === 'empty') destination = 'browse';
                if (state === 'settings') { showDialog(labels[tab], 'Production settings are unchanged in this fixture. Saved keys, ranges, and defaults must be preserved.', 'Close'); return; }
                el('scenario').value = 'ready'; render(); focus('tab-0');
            }));
            if (state === 'no-account') el('state').appendChild(button('Browse', 'browse-free', function () { destination = 'browse'; el('scenario').value = 'ready'; render(); focus('tab-0'); }));
        } else {
            items.forEach(function (item, index) {
                var node = button('', 'card-' + index, function () { watch(index); }, 'stream-card');
                node.setAttribute('aria-label', item.name + ', ' + item.category + ', ' + item.viewers + ' viewers, ' + item.title);
                node.innerHTML = '<div class="preview art-' + index % 6 + '"><span class="live-pill">LIVE</span><span class="sample"></span><span class="viewers"></span></div><div class="card-meta"><strong></strong><p></p></div>';
                node.querySelector('.sample').textContent = state === 'missing' && index === 0 ? 'Preview unavailable' : item.category;
                var small = document.createElement('small'); small.textContent = 'SYNTHETIC PREVIEW'; node.querySelector('.sample').appendChild(small);
                node.querySelector('.viewers').textContent = item.viewers;
                node.querySelector('strong').textContent = item.name;
                node.querySelector('.card-meta p').textContent = item.category;
                node.onfocus = function () { selectItem(index); };
                el('grid').appendChild(node);
            });
            var mark = Navigation_Bookmark(Navigation_Target(destination, tab), 'fixture');
            focusedItem = UIFocus_Resolve(items, mark ? mark.itemId : null, mark ? mark.index : focusedItem);
            selectItem(focusedItem);
            if (state === 'stale') notice('Showing saved content · Refresh to try again');
        }
    }
    function watch(index) {
        saveFocus(); watching = index; playing = true;
        el('browse-view').hidden = true; el('player').hidden = false;
        updateWatching(); el('tv').focus();
    }
    function updateWatching() { var item = items[watching]; el('watch-channel').textContent = item.name; el('watch-title').textContent = item.title; el('playing-name').textContent = item.name; }
    function stopWatching() { UIFocus_Clear(); clearTimeout(barTimer); el('player-bar').hidden = true; el('player').hidden = true; el('browse-view').hidden = false; watching = null; render(); focus('card-' + focusedItem); }
    function closeTop() { UIFocus_Pop(true); if (currentOwner() && currentOwner().group) renderDrawer(currentOwner()); }
    function showBar() {
        clearTimeout(barTimer); el('player-bar').hidden = false; reset(el('bar-buttons'));
        ['Play / Pause', 'Chat', 'Quality', 'Layout', 'More', 'Channels'].forEach(function (label, index) {
            var node = button(label === 'Play / Pause' ? (playing ? 'Pause' : 'Play') : label, 'bar-' + index, function () {
                clearTimeout(barTimer);
                if (!index) { playing = !playing; node.textContent = playing ? 'Pause' : 'Play'; notice(playing ? 'Playback resumed (simulation)' : 'Playback paused (simulation)'); }
                else if (label === 'Channels') showSwitcher();
                else showDrawer(label);
            });
            el('bar-buttons').appendChild(node);
        });
        UIFocus_Push({id: 'bar', handle: function (event, up) {
            if (up) return true;
            clearTimeout(barTimer);
            if (event.keyCode === 37 || event.keyCode === 39) moveFocus('bar-buttons', event.keyCode === 37 ? -1 : 1);
            else if (event.keyCode === 38) showSwitcher();
            else if (event.keyCode === 27 || event.keyCode === 8) closeTop();
            else if (event.keyCode === 13) document.activeElement.click();
            if (currentOwner() && currentOwner().id === 'bar') scheduleHide();
            return true;
        }, cleanup: function () { el('player-bar').hidden = true; clearTimeout(barTimer); }, restore: function () { el('tv').focus(); }});
        focus('bar-0'); scheduleHide();
    }
    function scheduleHide() { clearTimeout(barTimer); barTimer = setTimeout(function () { if (currentOwner() && currentOwner().id === 'bar') closeTop(); }, 5000); }
    function showDrawer(group) {
        clearTimeout(barTimer);
        var returnId = document.activeElement.id;
        var owner = {id: 'drawer-' + group, group: group, index: 0, handle: function (event, up) {
            if (up) return true;
            if (event.keyCode === 38 || event.keyCode === 40) moveFocus('drawer-rows', event.keyCode === 38 ? -1 : 1);
            else if (event.keyCode === 27 || event.keyCode === 8) closeTop();
            else if (event.keyCode === 13) document.activeElement.click();
            else if (event.keyCode === 37 || event.keyCode === 39) notice('Adjustment preview · ' + document.activeElement.textContent);
            return true;
        }, cleanup: function () { el('drawer').hidden = true; }, restore: function () {
            if (currentOwner() && currentOwner().group) renderDrawer(currentOwner());
            else scheduleHide();
            focus(returnId);
        }};
        UIFocus_Push(owner); renderDrawer(owner); focus('row-0');
    }
    function renderDrawer(owner) {
        el('drawer').hidden = false; el('drawer-title').textContent = owner.group; reset(el('drawer-rows'));
        (groups[owner.group] || []).forEach(function (label, index) {
            var node = button(label, 'row-' + index, function () {
                owner.index = index;
                if (label === 'Chat on phone') showDialog(label, 'In the app, the existing phone-chat pairing QR appears here. This fixture never creates a server, pairs a phone, or signs in.', 'Back to Chat');
                else if (label === 'Show chat') { chat = !chat; node.textContent = 'Show chat · ' + (chat ? 'On' : 'Off'); }
                else if (label === 'Channels') showSwitcher();
                else if (groups[label]) showDrawer(label);
                else if (owner.group === 'Quality') { quality = label; el('quality-label').textContent = quality; renderDrawer(owner); focus('row-' + index); }
                else if (owner.group === 'Layout') { layout = label; notice(layout + ' · Simulation; native layout unchanged'); renderDrawer(owner); focus('row-' + index); }
                else notice(label + ' · Production action requires adapter integration');
            });
            if (owner.group === 'Quality' || owner.group === 'Layout') { node.setAttribute('role', 'menuitemradio'); node.setAttribute('aria-checked', String(label === (owner.group === 'Quality' ? quality : layout))); }
            node.onfocus = function () { owner.index = index; };
            el('drawer-rows').appendChild(node);
        });
        focus('row-' + owner.index);
    }
    function showDialog(title, copy, closeLabel) {
        clearTimeout(barTimer);
        var returnId = document.activeElement.id;
        el('dialog-title').textContent = title; el('dialog-copy').textContent = copy; el('dialog-close').textContent = closeLabel; el('dialog').hidden = false;
        el('dialog-close').onclick = closeTop;
        UIFocus_Push({id: 'dialog', handle: function (event, up) {
            if (!up && (event.keyCode === 27 || event.keyCode === 8 || event.keyCode === 13)) closeTop(); return true;
        }, cleanup: function () { el('dialog').hidden = true; }, restore: function () { focus(returnId); }});
        focus('dialog-close');
    }
    function showSwitcher() {
        clearTimeout(barTimer); el('switcher').hidden = false; reset(el('switcher-cards'));
        var returnId = document.activeElement.id;
        items.forEach(function (item, index) { el('switcher-cards').appendChild(button(item.name + (index === watching ? ' · Watching' : ''), 'switch-' + index, function () { watching = index; updateWatching(); closeTop(); })); });
        UIFocus_Push({id: 'switcher', handle: function (event, up) {
            if (up) return true;
            if (event.keyCode === 37 || event.keyCode === 39) moveFocus('switcher-cards', event.keyCode === 37 ? -1 : 1);
            else if (event.keyCode === 27 || event.keyCode === 8 || event.keyCode === 40) closeTop();
            else if (event.keyCode === 13) document.activeElement.click(); return true;
        }, cleanup: function () { el('switcher').hidden = true; }, restore: function () { focus(returnId); if (currentOwner() && currentOwner().id === 'bar') scheduleHide(); }});
        focus('switch-' + watching);
    }
    document.addEventListener('focusin', function (event) {
        var previous = el('tv').querySelector('.focused');
        if (previous) previous.classList.remove('focused');
        if (el('tv').contains(event.target) && event.target.tagName === 'BUTTON') event.target.classList.add('focused');
    });
    document.addEventListener('keydown', function (event) {
        if (event.target.closest('.fixture-tools')) return;
        if (UIFocus_Dispatch(event, false)) return;
        var code = event.keyCode, id = document.activeElement.id;
        if (watching !== null) {
            if (code === 13) showBar(); else if (code === 38) showSwitcher(); else if (code === 27 || code === 8) stopWatching(); else if (code === 40) { chat = !chat; notice('Chat · ' + (chat ? 'On' : 'Off')); } else return;
        } else if (code >= 37 && code <= 40) {
            if (id.indexOf('card-') === 0) {
                var index = parseInt(id.substring(5), 10);
                if (code === 37 && index % 3 === 0) openRail();
                else if (code === 38 && index < 3) focus('tab-' + tab);
                else if (code === 40 && index + 3 >= items.length) focus('channel-details');
                else focus('card-' + UIFocus_GridNeighbor(index, 3, items.length, {37: 'left', 38: 'up', 39: 'right', 40: 'down'}[code]));
            } else if (id.indexOf('tab-') === 0) {
                if (code === 37 && id === 'tab-0') openRail(); else if (code === 39 && document.activeElement === el('tabs').lastChild) focus('refresh'); else if (code === 37 || code === 39) moveFocus('tabs', code === 37 ? -1 : 1); else if (code === 40) focus(el('grid').hidden ? 'recover' : 'card-' + focusedItem);
            } else if (id === 'refresh') {
                if (code === 37) focus('tab-' + (el('tabs').children.length - 1));
                else if (code === 40) focus(el('grid').hidden ? 'recover' : 'card-' + focusedItem);
            } else if (id === 'recover' && code === 39 && el('browse-free')) focus('browse-free');
            else if (id === 'browse-free' && code === 37) focus('recover');
            else if (id === 'channel-details' && code === 38) focus('card-' + focusedItem);
            else if (code === 37) openRail();
            else if (code === 38) focus('tab-' + tab);
        } else if (code === 27 || code === 8) openRail(); else return;
        event.preventDefault();
    });
    document.addEventListener('keyup', function (event) { UIFocus_Dispatch(event, true); });
    el('channel-details').onclick = function () { showDialog(items[focusedItem].name, 'Channel details retain Follow, Videos, Clips and Watch. Back returns to this exact stream.', 'Back to Following'); };
    el('refresh').onclick = function () { notice('Refreshed · surviving stream identity retained'); render(); focus('card-' + focusedItem); };
    ['scenario', 'count'].forEach(function (id) { el(id).onchange = function () { UIFocus_Clear(); watching = null; el('player').hidden = true; el('browse-view').hidden = false; makeItems(); render(); }; });
    el('theme').onchange = function () { el('tv').classList.remove('light', 'custom'); if (this.value !== 'dark') el('tv').classList.add(this.value); };
    el('large').onchange = function () { el('tv').classList.toggle('large', this.checked); };
    Navigation_SetAccount('alex'); makeItems(); render(); focus('card-0');
}());
