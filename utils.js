const escapeHtml = s =>
     String(s).replace(/[&<>"]/g, c => ({
          '&':"&amp;",
          '<':"&lt;",
          '>':"&gt;",
          '"':"&quot;"
     }[c]
));

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { escapeHtml };
}
