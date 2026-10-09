/*
 * SPTV phone chat - Twitch account connection (browser-only implicit flow).
 *
 * Part of the standalone phone page bundle (app/PhoneChat/), NOT the TV app.
 * ES5 only. Depends on: PhoneChatConfig* globals (app/general/PhoneChatConfig.js).
 *
 * Docs: https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/
 *
 * Security rules encoded here:
 * - Authorization is INDEPENDENT from the TV login; the TV token never
 *   reaches this page and this token never reaches the TV.
 * - OAuth state is cryptographically random (Web Crypto); without it login
 *   refuses to start (Math.random is NOT a substitute).
 * - Pending records live in sessionStorage, expire after 10 minutes and are
 *   consumed exactly once; a mismatched/expired/replayed state discards the
 *   returned credentials.
 * - Callback fragment data is removed from the address bar with
 *   history.replaceState immediately, before any network request.
 * - The token is only trusted after /oauth2/validate confirms client ID,
 *   identity and granted scopes.
 * - Tokens are kept in memory + sessionStorage only, and are never logged.
 */

SPTVPhoneChat.Auth = (function () {
    var SessionKey = 'sptv_phone_chat_session';
    var PendingKey = 'sptv_phone_chat_pending';

    //Hex-encode cryptographically random bytes into an OAuth state value
    function randomState(bytesLen) {
        var bytes = new Uint8Array(bytesLen || 32),
            out = '',
            i,
            len;

        if (!window.crypto || !window.crypto.getRandomValues) return null;

        window.crypto.getRandomValues(bytes);

        for (i = 0, len = bytes.length; i < len; i++) {
            out += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
        }

        return out;
    }

    function storageGet(key) {
        try {
            return window.sessionStorage.getItem(key);
        } catch (e) {
            return null;
        }
    }

    function storageSet(key, value) {
        try {
            window.sessionStorage.setItem(key, value);
            return true;
        } catch (e) {
            return false;
        }
    }

    function storageRemove(key) {
        try {
            window.sessionStorage.removeItem(key);
        } catch (e) {
            //storage unavailable: nothing to remove
        }
    }

    //The page origin+path must be on the configured allowlist; no arbitrary redirect targets
    function currentCallbackUrl() {
        if (!window.location) return null;

        var origin = window.location.origin,
            path = window.location.pathname,
            i,
            len,
            candidate;

        for (i = 0, len = PhoneChatConfig.allowedOrigins.length; i < len; i++) {
            if (origin !== PhoneChatConfig.allowedOrigins[i]) continue;

            for (var j = 0, lenJ = PhoneChatConfig.allowedPaths.length; j < lenJ; j++) {
                candidate = PhoneChatConfig.allowedPaths[j];
                if (path === candidate || path === candidate.replace(/\.html$/, '')) {
                    return origin + path;
                }
            }
        }

        return null;
    }

    function isConfigured() {
        return !!PhoneChatConfig.clientId;
    }

    function createPending(state, channel, redirect, now) {
        return {
            state: state,
            channel: channel,
            redirect: redirect,
            created: now
        };
    }

    function isPendingValid(pending, now, timeoutMs) {
        return !!(pending && pending.state && pending.channel && typeof pending.created === 'number' && now - pending.created <= timeoutMs);
    }

    //Parse an OAuth fragment/query string ('a=1&b=2') into an object
    function parseParams(raw) {
        var out = {};

        if (typeof raw !== 'string' || !raw.length) return out;

        if (raw.charAt(0) === '#') raw = raw.slice(1);
        if (raw.charAt(0) === '?') raw = raw.slice(1);

        var pairs = raw.split('&'),
            i,
            len = pairs.length,
            pair,
            eq;

        for (i = 0; i < len; i++) {
            pair = pairs[i];
            if (!pair) continue;

            eq = pair.indexOf('=');

            if (eq === -1) out[pair] = '';
            else out[pair.slice(0, eq)] = decodeURIComponentSafe(pair.slice(eq + 1));
        }

        return out;
    }

    function decodeURIComponentSafe(value) {
        try {
            return decodeURIComponent(value.replace(/\+/g, ' '));
        } catch (e) {
            return value;
        }
    }

    /*
     * Evaluate callback parameters against the pending record.
     * Returns:
     *   { ok: true, accessToken, scope, channel } |
     *   { ok: false, reason, channel } with reason one of:
     *   'denied' | 'error' | 'malformed' | 'missing_state' | 'state_mismatch' |
     *   'expired' | 'no_token'
     * On success the pending record is consumed; on any failure it is also
     * discarded (a failed callback never leaves a usable pending state).
     *
     * The channel is same-origin data this page wrote itself, so it is attached
     * to failure results too (when a pending record existed): it only decides
     * which channel to show/join after reconnect, while the TOKEN requires full
     * state verification and is discarded on every failure above.
     */
    function evaluateCallback(callbackParams, pendingRecordJson, now, timeoutMs) {
        var pending = null,
            pendingChannel = null;

        try {
            pending = pendingRecordJson ? JSON.parse(pendingRecordJson) : null;
        } catch (e) {
            pending = null;
        }

        if (pending && typeof pending.channel === 'string' && pending.channel) pendingChannel = pending.channel;

        //Consume the pending record exactly once, whatever the outcome
        if (pendingRecordJson) storageRemove(PendingKey);

        if (callbackParams.error) {
            return {ok: false, reason: callbackParams.error === 'access_denied' ? 'denied' : 'error', channel: pendingChannel};
        }

        if (!callbackParams.state) return {ok: false, reason: 'missing_state', channel: pendingChannel};

        if (!isPendingValid(pending, now, timeoutMs)) return {ok: false, reason: 'expired', channel: pendingChannel};

        if (callbackParams.state !== pending.state) return {ok: false, reason: 'state_mismatch', channel: pendingChannel};

        if (!callbackParams.access_token) return {ok: false, reason: 'no_token', channel: pendingChannel};

        return {
            ok: true,
            accessToken: callbackParams.access_token,
            scope: callbackParams.scope ? callbackParams.scope.split(' ') : [],
            channel: pending.channel,
            redirect: pending.redirect
        };
    }

    /*
     * Evaluate /oauth2/validate's JSON response. The fragment's scope claims
     * are never trusted alone: the validated response is the identity source.
     */
    function evaluateValidateResponse(validateJson, requiredScopes) {
        if (!validateJson || !validateJson.client_id || !validateJson.user_id || !validateJson.login) {
            return {ok: false, reason: 'invalid'};
        }

        if (validateJson.client_id !== PhoneChatConfig.clientId) return {ok: false, reason: 'client_mismatch'};

        var scopes = validateJson.scopes || [],
            i,
            len = requiredScopes.length;

        for (i = 0; i < len; i++) {
            if (scopes.indexOf(requiredScopes[i]) === -1) return {ok: false, reason: 'missing_scopes'};
        }

        return {
            ok: true,
            userId: validateJson.user_id,
            login: validateJson.login,
            scopes: scopes,
            expiresIn: typeof validateJson.expires_in === 'number' ? validateJson.expires_in : 0
        };
    }

    function saveSession(session) {
        return storageSet(SessionKey, JSON.stringify(session));
    }

    function loadSession() {
        var raw = storageGet(SessionKey),
            session;

        if (!raw) return null;

        try {
            session = JSON.parse(raw);
        } catch (e) {
            return null;
        }

        return session && session.token ? session : null;
    }

    function clearSession() {
        storageRemove(SessionKey);
        storageRemove(PendingKey);
    }

    //GET a Helix endpoint with the phone session. Resolves {status, json}
    function helixGet(path, session) {
        return window
            .fetch(PhoneChatConfig.oauth.helixApi + path, {
                headers: {
                    Authorization: 'Bearer ' + session.token,
                    'Client-Id': PhoneChatConfig.clientId
                }
            })
            .then(function (response) {
                return response.json().then(function (json) {
                    return {status: response.status, json: json};
                });
            });
    }

    //GET /oauth2/validate (Twitch documents GET; POST returns 404).
    //Network failures reject; HTTP failures resolve with ok:false so callers
    //can tell an invalid token from an offline network.
    function validateToken(token) {
        return window
            .fetch(PhoneChatConfig.oauth.validateUrl, {
                method: 'GET',
                headers: {Authorization: 'OAuth ' + token}
            })
            .then(function (response) {
                return response.json().then(
                    function (json) {
                        return {status: response.status, ok: response.status === 200, json: json};
                    },
                    function () {
                        return {status: response.status, ok: false, json: null};
                    }
                );
            });
    }

    return {
        SessionKey: SessionKey,
        PendingKey: PendingKey,
        randomState: randomState,
        isConfigured: isConfigured,
        currentCallbackUrl: currentCallbackUrl,
        createPending: createPending,
        isPendingValid: isPendingValid,
        parseParams: parseParams,
        evaluateCallback: evaluateCallback,
        evaluateValidateResponse: evaluateValidateResponse,
        saveSession: saveSession,
        loadSession: loadSession,
        clearSession: clearSession,
        helixGet: helixGet,
        validateToken: validateToken,
        storageAvailable: function () {
            try {
                window.sessionStorage.setItem('sptv_phone_test', '1');
                window.sessionStorage.removeItem('sptv_phone_test');
                return true;
            } catch (e) {
                return false;
            }
        }
    };
})();
