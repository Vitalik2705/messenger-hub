import { Box } from '@mui/material';

/**
 * Renders Telegram formatting (the markdown Telethon produces: **bold**, __italic__, `code`,
 * [text](url)) as React elements. Never builds HTML from the text, so message content cannot inject
 * markup.
 */

const TOKEN = new RegExp([
    '```([\\s\\S]+?)```',                          // 1 pre
    '`([^`\\n]+)`',                                // 2 code
    '\\*\\*([\\s\\S]+?)\\*\\*',                    // 3 bold
    '__([\\s\\S]+?)__',                            // 4 italic
    '~~([\\s\\S]+?)~~',                            // 5 strike
    '\\[([^\\]]*)\\]\\(([^)\\s]+)\\)',             // 6 text, 7 url
    '(https?:\\/\\/[^\\s<>()]+[^\\s<>().,!?:;\'"»])', // 8 bare url
].join('|'), 'g');

/** Zero-width and blank link texts are Telegram's hidden preview links. */
// Zero-width space/joiners, word joiner, BOM - built from code points so the source stays plain ASCII.
const ZW = String.fromCharCode(0x200B, 0x200C, 0x200D, 0x2060, 0xFEFF);
// Alternation rather than a character class: a class of joiners reads as one joined glyph.
const ZW_ALT = [...ZW].join('|');
const INVISIBLE = new RegExp(`^(?:\\s|${ZW_ALT})*$`);
const ZERO_WIDTH = new RegExp(ZW_ALT, 'g');

function highlight(text, query, keyBase) {
    if (!query || !text) return text;
    const lower = text.toLowerCase();
    const needle = query.toLowerCase();
    const parts = [];
    let from = 0;
    let at = lower.indexOf(needle);
    let i = 0;
    while (at !== -1) {
        if (at > from) parts.push(text.slice(from, at));
        parts.push(
            <Box component="mark" key={`${keyBase}-h${i++}`} sx={{
                bgcolor: 'rgba(255, 200, 0, 0.45)', color: 'inherit', borderRadius: '3px', px: '1px',
            }}>
                {text.slice(at, at + needle.length)}
            </Box>,
        );
        from = at + needle.length;
        at = lower.indexOf(needle, from);
    }
    if (from < text.length) parts.push(text.slice(from));
    return parts;
}

function parse(text, opts, depth = 0, keyBase = 'r') {
    const out = [];
    let last = 0;
    let n = 0;
    TOKEN.lastIndex = 0;
    const re = new RegExp(TOKEN.source, 'g');
    let m;
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) out.push(highlight(text.slice(last, m.index), opts.query, `${keyBase}-t${n}`));
        const key = `${keyBase}-${depth}-${n++}`;
        const inner = (s) => (depth < 4 ? parse(s, opts, depth + 1, key) : s);

        if (m[1] !== undefined) {
            out.push(<Box component="pre" key={key} sx={codeSx(opts, true)}>{m[1]}</Box>);
        } else if (m[2] !== undefined) {
            out.push(<Box component="code" key={key} sx={codeSx(opts, false)}>{m[2]}</Box>);
        } else if (m[3] !== undefined) {
            out.push(<strong key={key}>{inner(m[3])}</strong>);
        } else if (m[4] !== undefined) {
            out.push(<em key={key}>{inner(m[4])}</em>);
        } else if (m[5] !== undefined) {
            out.push(<s key={key}>{inner(m[5])}</s>);
        } else if (m[7] !== undefined) {
            if (!INVISIBLE.test(m[6])) out.push(link(m[7], inner(m[6]), key, opts));
        } else if (m[8] !== undefined) {
            out.push(link(m[8], m[8].length > 60 ? `${m[8].slice(0, 57)}…` : m[8], key, opts));
        }
        last = re.lastIndex;
    }
    if (last < text.length) out.push(highlight(text.slice(last), opts.query, `${keyBase}-end`));
    return out;
}

function codeSx(opts, block) {
    return {
        fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
        fontSize: '0.92em',
        bgcolor: opts.onFill ? 'rgba(255,255,255,0.16)' : 'var(--c-surface-sunken)',
        borderRadius: '4px',
        px: block ? 1 : 0.5,
        py: block ? 0.75 : 0.1,
        my: block ? 0.5 : 0,
        display: block ? 'block' : 'inline',
        whiteSpace: 'pre-wrap',
        overflowX: 'auto',
    };
}

function link(url, label, key, opts) {
    const safe = /^(https?:|tg:|mailto:)/i.test(url) ? url : null;
    if (!safe) return label;
    return (
        <Box component="a" key={key} href={safe} target="_blank" rel="noreferrer noopener"
             onClick={(e) => e.stopPropagation()}
             sx={{
                 color: opts.onFill ? 'inherit' : 'var(--c-accent-text)',
                 textDecoration: 'underline', textDecorationThickness: '1px', textUnderlineOffset: '2px',
                 wordBreak: 'break-all',
                 '&:hover': { textDecorationThickness: '2px' },
             }}>
            {label}
        </Box>
    );
}

/** A message body with Telegram formatting, links, and optional search highlighting. */
export function RichText({ text, query, onFill }) {
    if (!text) return null;
    return <>{parse(text, { query, onFill })}</>;
}

/** The text with markup removed, for one-line previews. */
// eslint-disable-next-line react-refresh/only-export-components
export function plainText(text) {
    if (!text) return text;
    return text
        .replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (_, label) => (INVISIBLE.test(label) ? '' : label))
        .replace(/```([\s\S]+?)```/g, '$1')
        .replace(/`([^`\n]+)`/g, '$1')
        .replace(/\*\*([\s\S]+?)\*\*/g, '$1')
        .replace(/__([\s\S]+?)__/g, '$1')
        .replace(/~~([\s\S]+?)~~/g, '$1')
        .replace(ZERO_WIDTH, '')
        .trim();
}
