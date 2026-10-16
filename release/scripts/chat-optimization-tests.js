/* Actual TV chat functions under a deterministic clock; no DOM/network credentials. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
let checks = 0;
function check(value, label) { assert.ok(value, label); checks++; }
function sandbox(source = fs.readFileSync('app/specific/ChatLive.js', 'utf8')) {
    let now = 1000, serial = 0;
    const timers = new Map(), rendered = [];
    const s = {
        Date: class extends Date { static now() { return now; } },
        Main_setTimeout: (fn, delay) => { const id = ++serial; timers.set(id, {fn, due: now + (Number(delay) > 0 ? Number(delay) : 0)}); return id; },
        Main_clearTimeout: id => timers.delete(id),
        Main_clearInterval: () => {}, Main_Log: () => {},
        Play_ChatDelayPosition: 5000, Chat_CleanMax: 10,
        Main_helix_api: 'fixture/', noop_fun: () => {}, BaseXmlHttpGet: () => {},
        Settings_value: {disabled_shared: {defaultValue: false}, show_chatters: {defaultValue: false}},
        Main_A_equals_B: (a, b) => a === b,
        Chat_loadBadgesGlobalRequestWithChannel: () => {},
        Chat_tagCSS: () => {}, Chat_div: [{}, {}],
        Chat_loadBadgesTransform: obj => obj,
        AddUser_UsernameArray: [{id: 'account'}]
    };
    vm.createContext(s); vm.runInContext(source, s);
    s.ChatLive_ElementAdd = msg => rendered.push({id: msg.message, slot: msg.chat_number, time: now});
    s.Chat_Clean = () => {};
    s.Chat_Id = [1, 2]; s.ChatLive_Messages = [[], []]; s.ChatLive_LineAddCounter = [0, 0];
    function advance(end) {
        for (;;) {
            const next = [...timers].filter(([, t]) => t.due <= end).sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
            if (!next) break;
            now = next[1].due; timers.delete(next[0]); next[1].fn();
        }
        now = end;
    }
    return {s, timers, rendered, advance, now: () => now};
}
const message = (id, slot = 0, addToStart = false) => ({message: id, chat_number: slot, addToStart});
for (const rate of [20, 100]) for (const delay of [0, 5000, 30000]) {
    const h = sandbox(), {s} = h;
    s.Play_ChatDelayPosition = delay;
    for (let i = 0; i < rate * 2; i++) {
        h.advance(1000 + i * 1000 / rate);
        for (let slot = 0; slot < 2; slot++) s.ChatLive_LineAddCheckDelay(slot, message(i, slot));
        check(h.timers.size <= (delay ? 2 : 0), 'one timer per slot at ' + rate + '/s delay ' + delay);
    }
    h.advance(40000);
    check(h.rendered.length === rate * 4, 'all workload messages delivered');
    check(h.rendered.every(x => x.time >= 1000 + x.id * 1000 / rate + delay), 'captured deadlines respected');
}
{
    const h = sandbox(), {s} = h;
    for (let i = 0; i < 1000; i++) s.ChatLive_LineAddCheckDelay(0, message(i));
    check(h.timers.size === 1, '1000 pending messages use one timer');
    h.advance(5999); check(h.rendered.length === 0, 'no early delivery');
    h.advance(6000); check(h.rendered.map(x => x.id).every((x, i) => x === i), 'ties keep arrival order');
    s.Play_ChatDelayPosition = 30000; s.ChatLive_LineAddCheckDelay(0, message('late'));
    s.Play_ChatDelayPosition = 5000; s.ChatLive_LineAddCheckDelay(0, message('early'));
    h.advance(11000); check(h.rendered.at(-1).id === 'early', 'decrease rearms earlier deadline');
    s.Play_ChatDelayPosition = 40000; s.ChatLive_LineAddCheckDelay(0, message('latest'));
    h.advance(36000); check(h.rendered.at(-1).id === 'late', 'increase preserves older deadline');
    s.ChatLive_LineAddCheckDelay(1, message('other', 1));
    const stale = [...h.timers.values()][0].fn;
    s.ChatLive_DelayClear(0); stale();
    check(s.ChatLive_Delayed[0] === null && h.timers.size === 1, 'clear releases only its slot and stale timer cannot rearm');
    h.advance(100000); check(h.rendered.at(-1).id === 'other', 'second slot continues');
    s.ChatLive_LineAddCheckDelay(0, message('prepend', 0, true));
    check(h.rendered.at(-1).id === 'prepend', 'history prepend bypasses delay');
    s.Play_ChatDelayPosition = 1; s.ChatLive_Latency[0] = NaN;
    s.ChatLive_LineAddCheckDelay(0, message('invalid')); h.advance(h.now());
    check(h.rendered.at(-1).id === 'invalid', 'invalid latency uses zero timeout');
    s.Play_ChatDelayPosition = 5; s.ChatLive_Playing = false;
    for (let i = 0; i < 1000; i++) s.ChatLive_LineAddCheckDelay(0, message(i));
    h.advance(h.now() + 5);
    check(s.ChatLive_Messages[0].length === 21 && s.ChatLive_Messages[0][0].message === 979, 'existing pause cap/order preserved');
    s.ChatLive_Playing = true;
    s.ChatLive_Messages[0].forEach(s.ChatLive_LineAdd);
    check(h.rendered.at(-1).id === 999, 'paused rows replay in order');
    s.ChatLive_LineAddCheckDelay(0, message('old generation')); s.Chat_Id[0]++;
    h.advance(h.now() + 5); check(h.rendered.at(-1).id === 999, 'generation prevents obsolete delivery');
    s.ChatLive_ElementAdd = () => s.ChatLive_DelayClear(0);
    s.ChatLive_LineAddCheckDelay(0, message('reentrant')); s.ChatLive_LineAddCheckDelay(0, message('never'));
    h.advance(h.now() + 5); check(s.ChatLive_Delayed[0] === null, 'reentrant clear stops drain');
}
{
    const {s} = sandbox();
    s.ChatLive_selectedChannel_id = ['active0', 'active1'];
    const shared = Array.from({length: 100}, (_, i) => ({broadcaster_id: 'shared' + i}));
    s.ChatLive_CacheSetPins(0, shared); s.ChatLive_CacheSetPins(1, [shared[0]]);
    const providers = ['bttv', 'ffz', 'seven_tv', 'ChannelEmotes', 'BadgesChannel', 'cheers'];
    function populate(id) {
        providers.forEach(p => s.extraEmotesDone[p][id] = {fixture: id});
        s.cheers[id] = {fixture: id}; s.ChatLive_sharedProfileImg[id] = id;
        s.ChatLive_CacheTouch(id);
    }
    ['active0', 'active1', ...shared.map(x => x.broadcaster_id)].forEach(populate);
    for (let i = 0; i < 100; i++) populate('visit' + i);
    check(s.ChatLive_CacheRecent.length === 122, '20 inactive plus pinned union');
    check(providers.every(p => Object.keys(s.extraEmotesDone[p]).length === 122), 'providers evict together');
    check(Object.keys(s.cheers).length === 122 && Object.keys(s.ChatLive_sharedProfileImg).length === 122, 'derived cheer/image data evicts too');
    s.ChatLive_CacheTouch('visit80'); populate('new');
    check(s.extraEmotesDone.bttv.visit80 && !s.extraEmotesDone.bttv.visit81, 'reuse refreshes recency');
    s.ChatLive_CacheSetPins(0, []);
    check(s.extraEmotesDone.bttv.shared0, 'second slot keeps shared pin');
    check(s.ChatLive_CacheRecent.length === 23, 'departed shared participants unpin');
    delete s.extraEmotesDone.ChannelEmotes.active0;
    s.ChatLive_loadEmotesChannelBTTVSuccess('{}', 0, -1);
    s.ChatLive_loadChannelEmotesSuccess('{}', 0, -1);
    check(!s.extraEmotesDone.ChannelEmotes.active0, 'stale responses cannot publish');
    let requests = 0; s.BaseXmlHttpGet = () => requests++;
    s.ChatLive_loadChannelEmotes(0, 1); s.ChatLive_loadChannelEmotes(0, 1);
    check(requests === 2 && !s.extraEmotesDone.ChannelEmotes.active0, 'failed/incomplete channel load remains retryable');
    s.ChatLive_loadChannelEmotesSuccess('{"data":[]}', 0, 1); s.ChatLive_loadChannelEmotes(0, 1);
    check(requests === 2 && s.extraEmotesDone.ChannelEmotes.active0, 'empty successful channel result is cached');
    s.extraEmotes[0] = {}; s.extraEmotes[1] = {};
    s.ChatLive_updateExtraEmotes({same: {id: 'a'}}, 0); s.ChatLive_updateExtraEmotes({same: {id: 'b'}}, 1);
    check(s.extraEmotes[0].same.id === 'a' && s.extraEmotes[1].same.id === 'b', 'colliding emotes stay slot-local');
    for (const [provider, callback, empty] of [
        ['bttv', 'ChatLive_loadEmotesChannelBTTVSuccess', {channelEmotes: [], sharedEmotes: []}],
        ['ffz', 'ChatLive_loadEmotesChannelFFZSuccess', {sets: {}}],
        ['seven_tv', 'ChatLive_loadEmotesChannelSeven_tvSuccess', {id: 'fixture', emote_set: null}]
    ]) {
        delete s.extraEmotesDone[provider].active0;
        s[callback]('{}', 0, 1);
        check(!s.extraEmotesDone[provider].active0, provider + ' incomplete response remains retryable');
        s[callback](JSON.stringify(empty), 0, 1);
        check(s.extraEmotesDone[provider].active0 && Object.keys(s.extraEmotesDone[provider].active0).length === 0, provider + ' empty success cached');
    }
    s.ChatLive_sharedChannelBadgeLoaded = [{}, {}];
    s.ChatLive_updateBanner = () => {};
    s.ChatLive_checkSharedSuccess(JSON.stringify({data: [{participants: [{broadcaster_id: 'current-shared'}]}]}), 0, 1);
    check(s.ChatLive_CachePins[0]['current-shared'] && !s.ChatLive_CachePins[0].shared99, 'latest shared session rebuilds pins');
    s.ChatLive_SharedShowedWarning[0] = true;
    s.ChatLive_updateBannerSuccess(JSON.stringify({data: [{id: 'departed', display_name: 'Departed', profile_image_url: 'fixture'}]}), 0, 1);
    check(!s.ChatLive_sharedProfileImg.departed, 'late participant response cannot refill departed image');
    s.ChatLive_checkSharedSuccess('{"data":[]}', 0, 1);
    check(Object.keys(s.ChatLive_CachePins[0]).join(',') === 'active0', 'shared session departure unpins participants');
}
{
    const h = sandbox(), {s} = h;
    const noop = () => {};
    s.Settings_value = new Proxy({}, {get: () => ({defaultValue: 0})});
    s.Main_values = {Play_ChatForceDisable: false}; s.Main_IsOn_OSInterface = true;
    s.AddUser_IsUserSet = () => false;
    s.Chat_loadBadgesGlobal = noop; s.Chat_loadBadgesGlobalRequest = noop;
    s.ChatLive_loadCheersChannel = noop; s.ChatLive_loadEmotesChannelBTTV = noop;
    s.ChatLive_loadEmotesChannelFFZ = noop; s.ChatLive_loadEmotesChannelSeven_tv = noop;
    s.ChatLive_StartShared = noop; s.ChatLive_PreLoadChat = noop; s.ChatLive_loadChat = noop;
    s.ChatLive_SendStart = noop; s.ChatLive_loadChatters = noop;
    s.ChatLive_Close = noop; s.ChatLive_SendClose = noop; s.ChatLive_CheckClear = noop;
    s.ChatLive_resetChatters = noop; s.Main_emptyWithEle = noop;
    s.Play_data = {data: []}; s.PlayExtra_data = {data: []};
    s.Play_data.data[14] = 'first'; s.Play_data.data[6] = 'First';
    s.PlayExtra_data.data[14] = 'second'; s.PlayExtra_data.data[6] = 'Second';
    s.ChatLive_SetOptions(0, 'first', 'First');
    const oldId = s.Chat_Id[0];
    s.ChatLive_LineAddCheckDelay(0, message('stale after SkipClear'));
    const stale = [...h.timers.values()][0].fn;
    s.ChatLive_Init(0, true);
    stale();
    check(s.Chat_Id[0] !== oldId && s.ChatLive_Delayed[0] === null && h.rendered.length === 0, 'SkipClear initialization releases queued objects and replaces generation');
    s.Chat_div = [{innerHTML: 'first'}, {innerHTML: 'second'}];
    const logged = [{innerHTML: 'first'}, {innerHTML: 'second'}];
    s.Main_getElementById = id => logged[Number(id.slice(-1))];
    s.ChatLive_LineAddCheckDelay(0, message('switch0')); s.ChatLive_LineAddCheckDelay(1, message('switch1', 1));
    s.ChatLive_Switch(); h.advance(10000);
    check(h.timers.size === 0 && h.rendered.length === 0, 'switch releases both scheduler queues');
    s.extraEmotes[0] = {fixture: {}};
    s.ChatLive_Clear(0);
    check(Object.keys(s.extraEmotes[0]).length === 0 && Object.keys(s.ChatLive_CachePins[0]).length === 0, 'clear releases active emotes and pins');
}
{
    const {s} = sandbox();
    s.extraEmotes[0] = {};
    s.ChatLive_selectedChannel_id[0] = 'channel';
    s.ChatLive_CacheSetPins(0, []);
    s.emoteURLFromObj = images => images.url_4x;
    s.emoteTemplate = url => '<img src="' + url + '">';
    const response = JSON.stringify({data: [{id: '42', name: 'FixtureEmote', theme_mode: ['dark'], images: {url_4x: 'fixture.png'}}]});
    let requested = 0;
    s.BaseXmlHttpGet = () => requested++;
    s.ChatLive_loadChannelEmotes(0, 1);
    s.ChatLive_loadChannelEmotes(0, 1);
    check(requested === 2, 'overlapping channel loads both requested');
    s.ChatLive_loadChannelEmotesSuccess(response, 0, 1);
    s.ChatLive_loadChannelEmotesSuccess(response, 0, 1);
    check(s.extraEmotesDone.ChannelEmotes.channel.FixtureEmote.id === 'FixtureEmote42', 'overlapping response preserves populated cache despite account dedup');
    s.AddUser_UsernameArray[0].id = 'second-account';
    s.ChatLive_loadChannelEmotes(0, 1);
    check(s.userEmote['second-account'].FixtureEmote.id === 'FixtureEmote42', 'picker restores cached emote after account switch');
    s.AddUser_UsernameArray[0].id = 'account';
    s.ChatLive_CacheRelease(0);
    for (let i = 0; i < 21; i++) s.ChatLive_CacheTouch('evict' + i);
    check(!s.extraEmotesDone.ChannelEmotes.channel && s.userEmote.account.FixtureEmote, 'channel eviction leaves intentional account-level copy');
    s.ChatLive_selectedChannel_id[0] = 'channel';
    s.ChatLive_CacheSetPins(0, []);
    s.ChatLive_loadChannelEmotes(0, 1);
    s.ChatLive_loadChannelEmotesSuccess(response, 0, 1);
    check(s.extraEmotesDone.ChannelEmotes.channel.FixtureEmote.id === 'FixtureEmote42', 'reload rebuilds evicted cache independently of account copy');
    s.AddUser_UsernameArray[0].id = 'third-account';
    s.ChatLive_loadChannelEmotes(0, 1);
    check(s.userEmote['third-account'].FixtureEmote.id === 'FixtureEmote42', 'eviction reload account switch preserves picker');
}
console.log(checks + ' TV scheduler/cache checks passed');
module.exports = {sandbox, message};
