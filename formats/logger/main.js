/**
 * main.js
 *
 * Logger format's main module.
 */
'use strict';

/**
 * Importing modules.
 */
const net = require('net'),
      Format = require('../format.js'),
      util = require('../../include/util.js'),
      Logging = require('../../include/log.js');

/**
 * Constants.
 */
const ACM = /<ac(_|$)(m|$)(e|$)(t|$)(a|$)(d|$)(a|$)(t|$)(a|$)( |$)(t|$)(i|$)(t|$)(l|$)(e|$)(=|$)("|$).*"$/,
      P_REGEX = /^<p>(.*)(?:<\/p>)?$/;

/**
 * Logger format's class.
 * @augments Format
 */
class Logger extends Format {
    /**
     * Class constructor.
     * @param {Object} config Format configuration
     * @param {Transport} transport Transport used for the format
     */
    constructor(config, transport) {
        super(config, transport);
        this._logger = new Logging({
            file: true,
            name: 'logger-format',
            stdout: true
        });
        this._i18n = require('./i18n/en.json');
        if (config.language && config.language !== 'en') {
            try {
                const i18n = require(`./i18n/${config.language}.json`);
                this._i18n = Object.assign({}, this._i18n, i18n);
            } catch (e) {
                if (e.code === 'MODULE_NOT_FOUND') {
                    this._logger.warn(
                        'Translation for language',
                        config.language,
                        'does not exist!'
                    );
                } else {
                    this._logger.error('Loading i18n failed:', e);
                }
            }
        }
        this._transportType = this._transport.constructor.name;
    }
    /**
     * Formats the RC message.
     * @param {Message} message Message to format
     * @returns {Object} Formatted message
     */
    execute(message) {
        const func = this[`_handle${util.cap(message.type)}`];
        if (typeof func === 'function') {
            const result = func.call(this, message);
            switch (this._transportType) {
                case 'Slack': return {
                    text: result
                };
                default: return {
                    content: result
                };
            }
        }
        this._logger.error('Cannot find handler for type', message.type);
        return null;
    }
    /**
     * Handles edits.
     * @param {Message} m Message to format
     * @returns {Object} Formatted message
     * @private
     */
    _handleEdit(m) {
        const n = m.flags.includes('N');
        if (m.threadtitle) {
            return this._msg(
                `${
                    n ? 'new' : 'edit'
                }-${
                    m.isMain ? 'post' : 'reply'
                }`,
                m.wiki,
                m.language,
                m.domain,
                m.user,
                m.threadid,
                m.threadtitle,
                m.namespace,
                m.page.split(':')[1].split('/')[0],
                m.diff,
                n ? m.summary : m.params.diff
            );
        }
        if (n) {
            return this._msg(
                'new',
                m.wiki,
                m.language,
                m.domain,
                m.user,
                m.page,
                m.diff,
                m.summary
            );
        }
        return this._msg(
            'edit',
            m.wiki,
            m.language,
            m.domain,
            m.user,
            m.page,
            m.diff,
            m.params.diff,
            m.summary
        );
    }
    /* eslint-disable complexity */
    /**
     * Handles logs.
     * @param {Message} m Message to format
     * @returns {Object} Formatted message
     * @private
     * @todo Split this up somehow
     */
    _handleLog(m) {
        const w = m.wiki,
              l = m.language,
              d = m.domain;
        let temp = null, temp2 = null, temp3 = null;
        switch (m.log) {
            case 'thread':
                temp = [
                    w,
                    l,
                    d,
                    m.user,
                    m.threadid,
                    m.threadtitle,
                    m.namespace,
                    m.page.split(':')[1].split('/')[0],
                    m.reason
                ];
                switch (m.action.substring(5)) {
                    case 'archive':
                        return this._msg('threadclose', ...temp);
                    case 'admindelete':
                        return this._msg('threaddelete', ...temp);
                    default:
                        return this._msg(
                            `thread${m.action.substring(5)}`,
                            ...temp
                        );
                }
            case 'block':
                switch (m.action) {
                    case 'block':
                    case 'reblock':
                        return this._msg(
                            m.action,
                            w,
                            l,
                            d,
                            m.user,
                            m.target,
                            m.expiry,
                            m.flags.join(', '),
                            m.reason
                        );
                    case 'unblock':
                        return this._msg(
                            'unblock',
                            w,
                            l,
                            d,
                            m.user,
                            m.target,
                            m.reason
                        );
                    default:
                        return '';
                }
            case 'newusers':
                return this._msg('newusers', w, l, d, m.user);
            case 'useravatar':
                switch (m.action) {
                    case 'avatar_chn':
                        return this._msg('avatar', w, l, d, m.user);
                    case 'avatar_rem':
                        return this._msg(
                            'remavatar',
                            w,
                            l,
                            d,
                            m.user,
                            m.target
                        );
                    default:
                        return '';
                }
            case 'delete':
                if (m.action === 'revision' || m.action === 'event') {
                    return this._msg(
                        m.action === 'revision' ? 'revdel' : 'logdel',
                        w,
                        l,
                        d,
                        m.user,
                        m.target,
                        m.reason
                    );
                }
                return this._msg(
                    m.action,
                    w,
                    l,
                    d,
                    m.user,
                    util.escape(m.page),
                    m.reason
                );
            case 'move':
                return this._msg(
                    m.action === 'move_redir' ? 'moveredir' : 'move',
                    w,
                    l,
                    d,
                    m.user,
                    util.escape(m.page),
                    m.target,
                    (m.reason || '')
                        .replace('[[\x0302', '[[')
                        .replace('\x0310]]', ']]')
                );
            case 'rights':
                temp3 = this._transportType === 'Slack' ? '*' : '**';
                temp = m.oldgroups.map(function(group) {
                    if (m.newgroups.includes(group)) {
                        return group;
                    }
                    return `${temp3}${group}${temp3}`;
                }, this).join(', ') || this._i18n['rights-none'];
                temp2 = m.newgroups.map(function(group) {
                    if (m.oldgroups.includes(group)) {
                        return group;
                    }
                    return `${temp3}${group}${temp3}`;
                }).join(', ') || this._i18n['rights-none'];
                return this._msg(
                    'rights',
                    w,
                    l,
                    d,
                    m.user,
                    m.target,
                    temp,
                    temp2,
                    m.reason
                );
            case 'upload':
                return this._msg(
                    m.action === 'overwrite' ? 'reupload' : 'upload',
                    w,
                    l,
                    d,
                    m.user,
                    `File:${m.file}`,
                    m.file,
                    m.reason
                );
            case 'chatban':
                if (m.action === 'chatbanremove') {
                    return this._msg(
                        'chatbanremove',
                        w,
                        l,
                        d,
                        m.user,
                        m.target,
                        m.reason
                    );
                }
                return this._msg(
                    m.action,
                    w,
                    l,
                    d,
                    m.user,
                    m.target,
                    util.escape(m.length),
                    m.reason
                );
            case 'protect':
                if (m.action === 'unprotect') {
                    return this._msg(
                        'unprotect',
                        w,
                        l,
                        d,
                        m.user,
                        m.page,
                        m.reason
                    );
                } else if (m.action === 'move_prot') {
                    return this._msg(
                        'moveprotect',
                        w,
                        l,
                        d,
                        m.user,
                        m.page,
                        m.target,
                        m.reason
                    );
                }
                return this._msg(
                    m.action === 'modify' ? 'reprotect' : 'protect',
                    w,
                    l,
                    d,
                    m.user,
                    m.page,
                    m.level
                        .map(lv => `[${lv.feature}=${lv.level}] (${lv.expiry})`)
                        .join(' '),
                    m.reason
                );
            case 'abusefilter':
                return this._msg('abusefilter', w, l, d, m.user, m.id, m.diff);
            case 'wikifeatures':
                return this._msg(
                    'wikifeatures',
                    w,
                    l,
                    d,
                    m.user,
                    this._i18n[`feature-${m.value ? 'enable' : 'disable'}`],
                    this._i18n[`feature-${m.feature}`]
                );
            // patrol doesn't need to be logged
            default:
                return '';
        }
    }
    /* eslint-enable complexity */
    /**
     * Handles Discussions.
     * @param {Message} m Message to format
     * @returns {Object} Formatted message
     * @private
     */
    _handleDiscussions(m) {
        return this._msg(
            'discussions',
            m.wiki,
            m.language,
            m.domain,
            m.user,
            m.dtype === 'report' ?
                this._i18n['discussions-create-report'] :
                m.action === 'created' ?
                    this._i18n['discussions-create-post'] :
                    this._i18n[`discussions-${m.action}`],
            m.title,
            m.thread,
            m.reply,
            m.size,
            util.escape(m.category),
            m.snippet.trim().replace(P_REGEX, '$1')
        );
    }
    /* eslint-disable max-statements */
    /**
     * Formats an RC message by type.
     * @param {String} key I18n message key
     * @param {String} wiki Wiki where the message occurred
     * @param {String} lang Language of the wiki
     * @param {String} domain Domain of the wiki
     * @param {Array} args Arguments for the message
     * @returns {Object} Formatted message
     * @todo Nested templates support
     * @todo Split this up somehow
     */
    _msg(key, wiki, lang, domain, ...args) {
        const string = this._i18n[key];
        if (!string) {
            return key ?
                `Unknown message key: ${key}` :
                'Undefined message key';
        }
        let mode = 0,
            temp = 0,
            result = '';
        const templates = [],
              tArgs = [];
        for (let i = 0, l = string.length; i < l; ++i) {
            let char = string.charAt(i);
            if (mode === 1) {
                if (char >= '0' && char <= '9') {
                    temp = temp * 10 + Number(char);
                } else {
                    mode = 0;
                    if (temp > 0) {
                        const arg = args[temp - 1];
                        result += typeof arg === 'undefined' || arg === null ?
                            '' :
                            String(arg);
                        temp = 0;
                    } else {
                        result += '$';
                    }
                }
            } else if (mode === 2) {
                mode = 0;
                if (char === '{') {
                    templates.push(result);
                    result = '';
                    char = '';
                } else {
                    result += '{';
                }
            } else if (mode === 3) {
                mode = 0;
                if (char === '}') {
                    tArgs.push(result);
                    result = templates.pop() + this._template(
                        wiki,
                        lang,
                        domain,
                        ...tArgs.splice(0)
                    );
                    char = '';
                } else {
                    result += '}';
                }
            }
            if (mode === 0) {
                if (char === '$') {
                    mode = 1;
                } else if (char === '{') {
                    mode = 2;
                } else if (char === '}') {
                    mode = 3;
                } else if (char === '|' && templates.length) {
                    tArgs.push(result);
                    result = '';
                } else {
                    result += char;
                }
            }
        }
        return result;
    }
    /* eslint-enable max-statements */
    /**
     * Makes a Markdown link.
     * @param {String} text Text in the link
     * @param {String} wiki Wiki for the link
     * @param {String} lang Language for the wiki
     * @param {String} domain Domain of the wiki
     * @param {String} url URL in the link
     * @returns {String} Markdown link
     */
    _link(text, wiki, lang, domain, url) {
        if (this._transportType === 'Slack') {
            // Slack link: <link|text>
            return `<${
                util.url(wiki, lang, domain)
            }/${
                url.replace(/\|/g, '%7C')
            }|${
                util.escape(text).replace(/<|>/g, '')
            }>`;
        }
        // Markdown link: [Text](Link)
        return `[${
            util.escape(text).replace(/\[|\]/g, '')
        }](<${
            util.url(wiki, lang, domain)
        }/${
            url.replace(/\)/g, '%29')
        }>)`;
    }
    /**
     * Makes a Markdown link to a wiki page.
     * @param {String} text Text in the link
     * @param {String} wiki Wiki to link to
     * @param {String} lang Language of the wiki
     * @param {String} domain Domain of the wiki
     * @param {String} page Page to link to
     * @returns {String} Markdown link
     */
    _wikiLink(text, wiki, lang, domain, page) {
        return this._link(text, wiki, lang, domain, `wiki/${util.encode(page)}`);
    }
    /**
     * Processes templates in i18n strings.
     * @param {String} wiki Related wiki for linking
     * @param {String} lang Language of the wiki for linking
     * @param {String} domain Domain of the wiki
     * @param {String} type Template type
     * @param {Array<String>} args Template arguments
     * @returns {String} Processed template
     */
    _template(wiki, lang, domain, type, ...args) {
        let temp = null, temp1 = null;
        switch (type) {
            case 'user':
                // Hack for autoblocks and range blocks
                if (args[0].startsWith('#') || util.isIPRange(args[0])) {
                    return util.escape(args[0]);
                }
                if (net.isIP(args[0])) {
                    return this._wikiLink(
                        args[0],
                        wiki,
                        lang,
                        domain,
                        `Special:Contribs/${args[0]}`
                    );
                }
                return `${
                    this._wikiLink(
                        args[0],
                        wiki,
                        lang,
                        domain,
                        `User:${args[0]}`
                    )
                } (${
                    this._wikiLink(
                        this._i18n.talk,
                        wiki,
                        lang,
                        domain,
                        `User talk:${args[0]}`
                    )
                }|${
                    this._wikiLink(
                        this._i18n.contribs,
                        wiki,
                        lang,
                        domain,
                        `Special:Contribs/${args[0]}`
                    )
                })`;
            case 'link':
                return this._wikiLink(
                    args[1] || args[0],
                    wiki,
                    lang,
                    domain,
                    args[0]
                );
            case 'diff':
                return `(${this._link(
                    this._i18n.diff,
                    wiki,
                    lang,
                    domain,
                    `?diff=${args[0]}`
                )})`;
            case 'diffSize':
                if (this._transportType === 'Slack') {
                    temp = args[0] > 500 || args[0] < -500 ? '*' : '_';
                } else {
                    temp = '*'.repeat(args[0] > 500 || args[0] < -500 ? 2 : 1);
                }
                if (args[0] > 0) {
                    args[0] = `+${args[0]}`;
                }
                return `${temp}(${args[0]})${temp}`;
            case 'summary':
                temp = args[0].trim().replace(ACM, '"');
                temp1 = this._transportType === 'Slack' ? '_' : '*';
                return temp.length === 0 ?
                    '' :
                    `(${temp1}${util.escape(temp.replace(/(?:\n|\r|\s)+/g, ' '))}${temp1})`;
            case 'board':
                return this._wikiLink(
                    this._msg(`board-${args[0]}`, wiki, lang, domain, args[1]),
                    wiki,
                    lang,
                    domain,
                    `${Number(args[0]) === 1201 ?
                        'Message Wall' :
                        'Board'}:${args[1]}`
                );
            case 'dlink':
                return this._link(
                    args[0] || this._i18n['discussions-reply'],
                    wiki,
                    lang,
                    domain,
                    `d/p/${args[2] ? `${args[1]}/r/${args[2]}` : args[1]}`
                );
            case 'flags':
                return args[0] ? `[${args[0]}] ` : '';
            default:
                return '';
        }
    }
}

module.exports = Logger;
