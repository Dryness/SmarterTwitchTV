/* TV pairing and channel following. The only LAN request carries a pairing key, never a Twitch token. */
SPTVPhoneChat.Local = (function () {
    var key = 'sptv_phone_pairing',
        pairing = null,
        timer = null,
        generation = 0,
        running = false,
        onChannel,
        onUnavailable;

    function isLocalPage() {
        var match = /^http:\/\/([0-9.]+):8978$/.exec(window.location.origin),
            parts,
            i;

        if (!match || window.location.pathname !== '/chat/') return false;
        parts = match[1].split('.');
        if (parts.length !== 4) return false;
        for (i = 0; i < 4; i++) {
            if (!/^\d{1,3}$/.test(parts[i]) || Number(parts[i]) > 255) return false;
        }
        return (
            Number(parts[0]) === 10 ||
            Number(parts[0]) === 127 ||
            (Number(parts[0]) === 192 && Number(parts[1]) === 168) ||
            (Number(parts[0]) === 172 && Number(parts[1]) >= 16 && Number(parts[1]) <= 31)
        );
    }

    function stop() {
        running = false;
        generation++;
        clearTimeout(timer);
        timer = null;
    }

    function poll() {
        if (!running) return;
        var gen = generation,
            controller = window.AbortController ? new window.AbortController() : null,
            deadline;

        var request = new Promise(function (resolve, reject) {
            deadline = setTimeout(function () {
                if (controller) controller.abort();
                reject(new Error('TV unavailable'));
            }, 5000);
            window
                .fetch('/chat/state', {
                    headers: {'X-SPTV-Pairing': pairing},
                    cache: 'no-store',
                    signal: controller ? controller.signal : undefined
                })
                .then(function (response) {
                    if (response.status === 403) {
                        var error = new Error('Pairing expired');
                        error.unpaired = true;
                        throw error;
                    }
                    if (response.status !== 200) throw new Error('TV unavailable');
                    return response.json();
                })
                .then(resolve, reject);
        });

        request
            .then(function (state) {
                clearTimeout(deadline);
                if (gen !== generation || !running) return;
                if (!state || typeof state.channel !== 'string' || !/^(?:[a-z0-9_]{3,25})?$/.test(state.channel)) {
                    throw new Error('Invalid TV state');
                }
                onChannel(state.channel || null);
                timer = setTimeout(poll, 2000);
            })
            .catch(function (error) {
                clearTimeout(deadline);
                if (gen !== generation || !running) return;
                if (error.unpaired) stop();
                onUnavailable(!!error.unpaired);
                if (running) timer = setTimeout(poll, 3000);
            });
    }

    function resume() {
        if (running || !pairing || document.hidden) return;
        running = true;
        generation++;
        poll();
    }

    function start(channelCallback, unavailableCallback) {
        var params = SPTVPhoneChat.Auth.parseParams(window.location.hash),
            value;
        onChannel = channelCallback;
        onUnavailable = unavailableCallback;
        stop();
        try {
            value = params.pair || window.sessionStorage.getItem(key);
            if (!/^[a-f0-9]{64}$/.test(value || '')) {
                onUnavailable(true);
                return;
            }
            pairing = value;
            window.sessionStorage.setItem(key, pairing);
            window.history.replaceState(null, '', window.location.origin + '/chat/');
        } catch (e) {
            onUnavailable(true);
            return;
        }
        resume();
    }

    return {isLocalPage: isLocalPage, start: start, stop: stop, resume: resume};
})();
