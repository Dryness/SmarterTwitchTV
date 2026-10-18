/*
 * Copyright (c) 2017–present Felipe de Leon <fglfgl27@gmail.com>
 *
 * This file is part of SmartTwitchTV <https://github.com/fgl27/SmartTwitchTV>
 *
 * SmartTwitchTV is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * SmartTwitchTV is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with SmartTwitchTV.  If not, see <https://github.com/fgl27/SmartTwitchTV/blob/master/LICENSE>.
 *
 */

//Variable initialization
var Search_cursorY = 0;
var Search_cursorX = 0;
var Search_keyBoardOn = false;
/* One bounded in-memory search session: entry origin, draft, submitted query and result type.
 * The draft never mutates live result requests; loaders keep reading Main_values.Search_data. */
var Search_Session = {active: false, origin: 0, draft: '', submitted: '', type: 0};
//Variable initialization end

/* Single session entry rule for every way Search can open (rail, tabs, playback, Main_OpenSearch).
 * Reopening while a session is active means Edit search: the true origin is never overwritten
 * with the current results screen. */
function Search_SessionEnter(originScreen) {
    if (!Search_Session.active) {
        Search_Session.active = true;
        Search_Session.origin = originScreen;
        Search_Session.draft = '';
        Search_Session.submitted = '';
        Search_Session.type = 0;
    }
    Main_values.Main_BeforeSearch = Search_Session.origin;
    Main_values.Search_isSearching = false;
}

/* Leaving to any non-search destination abandons the session; account switches clear it too. */
function Search_SessionEnd() {
    Search_Session.active = false;
}

function Search_init() {
    Navigation_Render(Main_Search);
    Main_HideWarningDialog();
    Main_HideElement('label_refresh');
    Main_IconLoad('label_thumb', 'icon-return', STR_GOBACK);
    Main_innerHTML('label_last_refresh', '');
    Main_CounterDialogRst();
    Main_SearchInput = Main_getElementById('search_input');
    Main_SearchInput.placeholder = STR_PLACEHOLDER_SEARCH;
    // Edit search restores the session's draft and result type; a new session starts empty.
    if (Search_Session.active) {
        Main_SearchInput.value = Search_Session.draft;
        Search_cursorX = Search_Session.type;
    } else {
        Main_SearchInput.value = '';
        Search_cursorX = 0;
    }
    Main_ShowElement('search_scroll');
    Search_cursorY = 0;
    Search_refreshInputFocusTools();
    Search_inputFocus();
}

function Search_exit() {
    Search_RemoveinputFocus(false);
    Main_removeEventListener('keydown', Search_handleKeyDown);
    Search_refreshInputFocusTools();

    Main_values.Main_Go = Search_Session.active && Search_Session.origin ? Search_Session.origin : Main_values.Main_BeforeSearch;

    Main_IconLoad('label_thumb', 'icon-options', STR_THUMB_OPTIONS_TOP);
    Main_ShowElement('label_refresh');
    Main_HideElement('search_scroll');
}

function Search_BackCancel() {
    // Back from the form terminates the session at its original caller.
    Search_exit();
    Search_SessionEnd();
    Main_SwitchScreen();
}

function Search_loadData() {
    Search_exit();
    Main_ready(function () {
        // Explicit result-type mapping: form button order differs from the shell's result-tab order.
        if (!Search_cursorX) {
            Screens_init(Main_SearchChannels);
        } else if (Search_cursorX === 1) {
            Screens_init(Main_SearchGames);
        } else if (Search_cursorX === 2) {
            Screens_init(Main_SearchLive);
        } else if (Search_cursorX === 3) {
            Screens_init(Main_SearchVod);
        }
    });
}

var Search_buttonIds = ['chanel_button', 'game_button', 'live_button', 'vod_button'];
function Search_refreshInputFocusTools() {
    var i = 0,
        len = Search_buttonIds.length;

    for (i; i < len; i++) {
        Main_RemoveClass(Search_buttonIds[i], 'button_search_focused');
    }

    if (Search_cursorY) {
        Main_AddClass(Search_buttonIds[Search_cursorX], 'button_search_focused');
    }
}

function Search_handleKeyDown(event) {
    if (Search_keyBoardOn) return;

    switch (event.keyCode) {
        case KEY_KEYBOARD_BACKSPACE:
        case KEY_RETURN:
            if (Main_isControlsDialogVisible()) Main_HideControlsDialog();
            else if (Main_isAboutDialogVisible()) Main_HideAboutDialog();
            else {
                Search_BackCancel();
            }
            break;
        case KEY_LEFT:
            if (Search_cursorY === 1) {
                if (!Search_cursorX) {
                    // Left from the first type choice reaches Navigation instead of wrapping to the last choice.
                    Navigation_Open(Search_handleKeyDown, 'rail');
                } else {
                    Search_cursorX--;
                    Search_refreshInputFocusTools();
                }
            }
            break;
        case KEY_RIGHT:
            if (Search_cursorY === 1) {
                Search_cursorX++;
                if (Search_cursorX > 3) Search_cursorX = 0;
                Search_refreshInputFocusTools();
            }
            break;
        case KEY_UP:
            if (Search_cursorY === 1) {
                Search_cursorY = 0;
                Search_refreshInputFocusTools();
                Search_inputFocus();
            }
            break;
        case KEY_DOWN:
            if (!Search_cursorY) {
                Search_RemoveinputFocus(false);
                Search_cursorY = 1;
                Search_refreshInputFocusTools();
            } else if (Search_cursorY === 1) {
                Search_cursorY = 0;
                Search_refreshInputFocusTools();
                Search_inputFocus();
            }
            break;
        case KEY_PLAY:
        case KEY_PAUSE:
        case KEY_PLAYPAUSE:
        case KEY_ENTER:
            Search_KeyEnter();
            break;
        default:
            break;
    }
}

function Search_KeyEnter() {
    if (!Search_cursorY) {
        Search_inputFocus();
    } else {
        if (Main_SearchInput.value !== '' && Main_SearchInput.value !== null) {
            if (Main_SearchInput.value.replace(/\s/g, '') === '') {
                Main_showWarningDialog(STR_SEARCH_EMPTY);
                Main_setTimeout(function () {
                    Main_HideWarningDialog();
                }, 1000);
                return;
            }
            // The submitted query only reaches loaders after validation; the draft stays editable.
            Search_Session.draft = Main_SearchInput.value;
            Search_Session.submitted = Main_SearchInput.value;
            Search_Session.type = Search_cursorX;
            Main_values.Search_data = Main_SearchInput.value;
            Search_loadData();
        } else {
            Main_showWarningDialog(STR_SEARCH_EMPTY);
            Main_setTimeout(function () {
                Main_HideWarningDialog();
            }, 1000);
        }
    }
}

var Search_inputFocusId;
function Search_inputFocus() {
    Main_AddClass('scene_keys', 'avoidclicks');
    OSInterface_AvoidClicks(true);
    Main_AddClass('scenefeed', 'avoidclicks');
    Main_removeEventListener('keydown', Search_handleKeyDown);
    Main_addEventListener('keydown', Search_KeyboardEvent);
    Main_SearchInput.placeholder = STR_PLACEHOLDER_SEARCH;

    Search_inputFocusId = Main_setTimeout(
        function () {
            Main_SearchInput.focus();
            Search_keyBoardOn = true;
        },
        500,
        Search_inputFocusId
    );
}

function Search_RemoveinputFocus(EnaKeydown) {
    Main_clearTimeout(Search_inputFocusId);
    if (!Main_isTV && Main_IsOn_OSInterface) OSInterface_mhideSystemUI();

    Main_RemoveClass('scenefeed', 'avoidclicks');
    Main_RemoveClass('scene_keys', 'avoidclicks');
    OSInterface_AvoidClicks(false);
    Main_SearchInput.blur();
    Search_removeEventListener();
    Main_removeEventListener('keydown', Search_KeyboardEvent);

    if (EnaKeydown) Main_addEventListener('keydown', Search_handleKeyDown);
    Search_keyBoardOn = false;
}

function Search_removeEventListener() {
    if (Main_SearchInput !== null) {
        // cloneNode does not carry a dirty typed value: preserve the draft across the clone.
        Search_Session.draft = Main_SearchInput.value;
        var elClone = Main_SearchInput.cloneNode(true);
        elClone.value = Search_Session.draft;
        Main_SearchInput.parentNode.replaceChild(elClone, Main_SearchInput);
        Main_SearchInput = Main_getElementById('search_input');
    }
}

function Search_KeyboardEvent(event) {
    switch (event.keyCode) {
        case KEY_RETURN:
            if (Main_isAboutDialogVisible()) Main_HideAboutDialog();
            else if (Main_isControlsDialogVisible()) Main_HideControlsDialog();
            else if (Search_keyBoardOn) {
                // Android Back first dismisses the keyboard and returns to form navigation;
                // a text-editing Backspace never exits Search.
                Search_KeyboardDismiss();
            } else {
                Search_BackCancel();
            }
            break;
        case KEY_KEYBOARD_DONE:
        case KEY_DOWN:
            Search_KeyboardDismiss();
            break;
        default:
            break;
    }
}

function Search_KeyboardDismiss() {
    Main_clearTimeout(Search_inputFocusId);
    Search_RemoveinputFocus(true);
    Search_cursorY = 1;
    Search_refreshInputFocusTools();
}
