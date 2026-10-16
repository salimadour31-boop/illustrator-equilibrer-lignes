//@target illustrator
/*
 * EquilibrerLignes.jsx — v1.0.0
 * Équilibrer les lignes des titres / Balance headline line breaks
 *
 * FR : Illustrator n'a pas l'option « Équilibrer les lignes en drapeau »
 *      d'InDesign. Un titre sur plusieurs lignes finit donc souvent par une
 *      ligne très courte (« veuve » de titre) ou par une coupe maladroite après
 *      « de », « la », « the »… Ce script mesure la largeur réelle de chaque mot
 *      (police, corps, approche, échelle, capitales), cherche les coupes qui
 *      donnent des lignes de longueurs égales (ou en pyramide, ou en pyramide
 *      inversée) et les applique avec des retours à la ligne forcés
 *      (Maj+Entrée), sans toucher à la mise en forme ni à la taille du cadre.
 * EN : Illustrator lacks InDesign's "Balance Ragged Lines". A multi-line
 *      headline therefore often ends with a very short last line or breaks
 *      awkwardly after "of", "the", "de"… This script measures the real width of
 *      every word (font, size, tracking, scale, caps), searches the line breaks
 *      that give equal line lengths (or a pyramid / inverted pyramid shape) and
 *      applies them as forced line breaks (Shift+Enter), without changing the
 *      formatting or the frame size.
 *
 * Auteur / Author : Amirouche Amwanes — Licence MIT / MIT License
 * Cible / Target : Adobe Illustrator CC 2018+ (ExtendScript ES3). Non testé dans Illustrator.
 * Aucun appel réseau, aucune collecte de données. / No network calls, no data collection.
 */

/* ===================================================================== */
/*  1. CŒUR (pur, sans Illustrator) / PURE CORE (no Illustrator)          */
/* ===================================================================== */

var EL_CORE = (function () {

    var BR = "\u0003";            // retour forcé d'Illustrator / Illustrator forced line break

    function isSpace(c) { return c === " "; }
    // Espaces insécables ou fines : jamais une coupe / non-breaking or thin spaces: never a break
    function isGlue(c) { return c === "\u00A0" || c === "\u202F" || c === "\u2009" || c === "\u2007"; }
    function isHyphen(c) { return c === "-" || c === "\u2010" || c === "\u2013" || c === "\u2014"; }
    function isLetter(c) { return !!c && /[A-Za-z0-9\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF]/.test(c); }

    /* Liste de petits mots -> table / small-word list -> lookup table */
    function wordSet(str) {
        var set = {}, parts = String(str || "").toLowerCase().split(/[\s,;]+/), i;
        for (i = 0; i < parts.length; i++) if (parts[i] !== "") set[parts[i]] = true;
        return set;
    }

    /* Dernier mot d'une unité, sans ponctuation / last word of a unit, punctuation stripped */
    function lastWord(txt) {
        var p = txt.split(/[\s\u00A0\u202F\u2009\u2007]+/), w = p[p.length - 1] || "";
        return w.toLowerCase().replace(/^[«»"“”‘’'(\[\]{}.,;:!?…]+|[«»"“”‘’'(\[\]{}.,;:!?…]+$/g, "");
    }

    /*
     * Découpe un paragraphe en unités insécables séparées par des coupes possibles.
     * Splits a paragraph into unbreakable units separated by break opportunities.
     * opts.hyphen : couper aussi après un trait d'union / also break after a hyphen
     * opts.noBreak(i) : vrai si le caractère i porte l'attribut « Sans retour à la ligne »
     * Retour : { units: [{s, e, text, small}], gaps: [{s, e, type, br, hyph}] }
     *   gaps[u] sépare units[u] et units[u+1] ; type "space" | "hyphen".
     */
    function tokenize(str, opts) {
        opts = opts || {};
        var small = opts.small || {}, nb = opts.noBreak || function () { return false; };
        var units = [], gaps = [], n = str.length, i = 0, start, c;
        // Ignorer les espaces/retours en tête et en fin / skip leading & trailing blanks
        var lo = 0, hi = n;
        while (lo < hi && (isSpace(str.charAt(lo)) || str.charAt(lo) === BR)) lo++;
        while (hi > lo && (isSpace(str.charAt(hi - 1)) || str.charAt(hi - 1) === BR)) hi--;
        i = lo; start = lo;
        while (i < hi) {
            c = str.charAt(i);
            if ((isSpace(c) && !nb(i)) || c === BR) {
                // Une suite d'espaces et de retours forcés = une seule coupe / a run = one gap
                var gs = i, hasBr = false;
                while (i < hi && ((isSpace(str.charAt(i)) && !nb(i)) || str.charAt(i) === BR)) {
                    if (str.charAt(i) === BR) hasBr = true;
                    i++;
                }
                if (gs > start) {
                    units.push({ s: start, e: gs, text: str.substring(start, gs) });
                    gaps.push({ s: gs, e: i, type: "space", br: hasBr, hyph: isHyphen(str.charAt(gs - 1)) });
                }
                start = i;
                continue;
            }
            if (opts.hyphen && isHyphen(c) && i > start && isLetter(str.charAt(i - 1)) && isLetter(str.charAt(i + 1)) && !nb(i)) {
                units.push({ s: start, e: i + 1, text: str.substring(start, i + 1) });
                gaps.push({ s: i + 1, e: i + 1, type: "hyphen", br: false, hyph: true });
                start = i + 1; i++;
                continue;
            }
            i++;
        }
        if (hi > start) units.push({ s: start, e: hi, text: str.substring(start, hi) });
        if (gaps.length > units.length - 1) gaps.length = Math.max(0, units.length - 1);
        for (i = 0; i < units.length; i++) units[i].small = !!small[lastWord(units[i].text)];
        return { units: units, gaps: gaps, lo: lo, hi: hi };
    }

    function prefix(W, G) {
        var P = [0], Q = [0], i;
        for (i = 0; i < W.length; i++) P.push(P[i] + W[i]);
        for (i = 0; i < G.length; i++) Q.push(Q[i] + G[i]);
        return function (a, b) { return (P[b + 1] - P[a]) + (Q[b] - Q[a]); };
    }

    /* Largeurs des lignes pour une liste de coupes / line widths for a break list */
    function widths(W, G, breaks) {
        var L = prefix(W, G), out = [], a = 0, i;
        for (i = 0; i < breaks.length; i++) { out.push(L(a, breaks[i])); a = breaks[i] + 1; }
        out.push(L(a, W.length - 1));
        return out;
    }

    /* Irrégularité en % : (max − min) / max / unevenness in % */
    function uneven(ws) {
        if (!ws || ws.length < 2) return 0;
        var mx = -Infinity, mn = Infinity, i;
        for (i = 0; i < ws.length; i++) { if (ws[i] > mx) mx = ws[i]; if (ws[i] < mn) mn = ws[i]; }
        return mx > 0 ? (mx - mn) / mx * 100 : 0;
    }

    /*
     * Cherche les meilleures coupes (programmation dynamique).
     * Finds the best breaks (dynamic programming).
     * W[u] largeur de l'unité, G[u] largeur de la coupe après u, small[u] l'unité finit par un petit mot.
     * o.k lignes, o.shape "balanced" | "pyramid" (haut court / short top) | "inverted" (haut long / long top),
     * o.maxWidth (0 = illimité), o.avoidSmall, o.avoidSingle.
     * Retour / returns : { breaks: [u...], widths: [...], cost } ou null.
     */
    function balance(W, G, small, o) {
        var n = W.length, k = Math.min(o.k, n), L = prefix(W, G), i;
        if (n === 0) return null;
        if (k <= 1) {
            var w1 = L(0, n - 1);
            if (o.maxWidth > 0 && w1 > o.maxWidth) return null;
            return { breaks: [], widths: [w1], cost: 0 };
        }
        var total = L(0, n - 1), avg = total / k;
        var pS = o.avoidSmall ? Math.pow(0.2 * avg, 2) : 0;
        var p1 = (o.avoidSingle && n >= 2 * k) ? Math.pow(0.25 * avg, 2) : 0;
        var eps = total * 1e-6;
        function lineCost(a, b) {
            var w = L(a, b);
            if (o.maxWidth > 0 && w > o.maxWidth) return Infinity;
            var c = w * w;
            if (pS && b < n - 1 && small[b]) c += pS;
            if (p1 && a === b) c += p1;
            return c;
        }
        // best[c][b][a] : c+1 lignes couvrant 0..b, dernière ligne a..b
        var best = [], par = [], c, a, b, a2;
        for (c = 0; c < k; c++) {
            best.push([]); par.push([]);
            for (b = 0; b < n; b++) { best[c].push({}); par[c].push({}); }
        }
        for (b = 0; b < n; b++) { var lc = lineCost(0, b); if (lc < Infinity) best[0][b][0] = lc; }
        for (c = 1; c < k; c++) {
            for (b = c; b < n; b++) {
                for (a = c; a <= b; a++) {
                    var cost = lineCost(a, b);
                    if (cost === Infinity) continue;
                    var wNow = L(a, b), prev = best[c - 1][a - 1], bestV = Infinity, bestA = -1;
                    for (a2 in prev) {
                        if (!prev.hasOwnProperty(a2)) continue;
                        var ai = +a2, wPrev = L(ai, a - 1);
                        if (o.shape === "pyramid" && wPrev > wNow + eps) continue;
                        if (o.shape === "inverted" && wPrev + eps < wNow) continue;
                        var v = prev[a2] + cost;
                        if (v < bestV) { bestV = v; bestA = ai; }
                    }
                    if (bestA >= 0) { best[c][b][a] = bestV; par[c][b][a] = bestA; }
                }
            }
        }
        var fin = best[k - 1][n - 1], bestF = Infinity, lastA = -1;
        for (a2 in fin) if (fin.hasOwnProperty(a2) && fin[a2] < bestF) { bestF = fin[a2]; lastA = +a2; }
        if (lastA < 0) return null;
        var starts = [lastA], bb = n - 1, aa = lastA;
        for (c = k - 1; c > 0; c--) { var pa = par[c][bb][aa]; bb = aa - 1; aa = pa; starts.unshift(aa); }
        var breaks = [];
        for (i = 1; i < starts.length; i++) breaks.push(starts[i] - 1);
        return { breaks: breaks, widths: widths(W, G, breaks), cost: bestF };
    }

    /* Aperçu texte « ligne / ligne » / text preview */
    function preview(str, tok, breaks) {
        var out = "", a = 0, i, isB = {};
        for (i = 0; i < breaks.length; i++) isB[breaks[i]] = true;
        for (i = 0; i < tok.units.length; i++) {
            out += tok.units[i].text;
            if (i < tok.gaps.length) out += isB[i] ? " / " : (tok.gaps[i].type === "space" ? " " : "");
        }
        return out;
    }

    /*
     * Modifications de texte (indices relatifs au paragraphe), à appliquer de la fin vers le début.
     * Text edits (paragraph-relative indexes), to apply from the end backwards.
     * Retour : [{ i, text }] — text "" = supprimer le caractère / delete the character.
     */
    function edits(str, tok, breaks) {
        var out = [], isB = {}, g, i, j;
        for (i = 0; i < breaks.length; i++) isB[breaks[i]] = true;
        for (i = 0; i < tok.gaps.length; i++) {
            g = tok.gaps[i];
            if (g.type === "hyphen") {
                if (isB[i]) out.push({ i: g.s - 1, text: str.charAt(g.s - 1) + BR });
                continue;
            }
            if (isB[i]) {
                // Une seule coupe : le 1er caractère devient le retour, les autres partent
                if (str.charAt(g.s) !== BR || g.e - g.s > 1) {
                    out.push({ i: g.s, text: BR });
                    for (j = g.s + 1; j < g.e; j++) out.push({ i: j, text: "" });
                }
            } else if (g.br) {
                // Ancien retour forcé non retenu : redevient une espace (ou rien après un trait d'union)
                out.push({ i: g.s, text: g.hyph ? "" : " " });
                for (j = g.s + 1; j < g.e; j++) out.push({ i: j, text: "" });
            }
        }
        // Retours en tête/fin de paragraphe laissés tels quels / leading/trailing breaks left as is
        out.sort(function (x, y) { return y.i - x.i; });
        return out;
    }

    /* Applique des modifications sur une chaîne (pour les tests) / apply edits to a string (tests) */
    function applyToString(str, ed) {
        var s = str, i;
        for (i = 0; i < ed.length; i++) s = s.substring(0, ed[i].i) + ed[i].text + s.substring(ed[i].i + 1);
        return s;
    }

    /* Coupes actuelles déduites des débuts de ligne / current breaks from line starts (para-relative) */
    function breaksFromStarts(tok, starts) {
        var out = [], u, g, seen = {}, i;
        for (i = 0; i < starts.length; i++) {
            var p = starts[i];
            if (p <= tok.lo) continue;
            // La ligne commence à l'unité dont le début est le plus proche / nearest unit start
            var bestU = -1, bestD = Infinity;
            for (u = 1; u < tok.units.length; u++) {
                var d = Math.abs(tok.units[u].s - p);
                g = tok.gaps[u - 1];
                if (g && p >= g.s && p <= g.e) d = 0;
                if (d < bestD) { bestD = d; bestU = u; }
            }
            if (bestU > 0 && !seen[bestU - 1]) { seen[bestU - 1] = true; out.push(bestU - 1); }
        }
        out.sort(function (x, y) { return x - y; });
        return out;
    }

    function brBreaks(tok) {
        var out = [], i;
        for (i = 0; i < tok.gaps.length; i++) if (tok.gaps[i].br) out.push(i);
        return out;
    }

    return { BR: BR, wordSet: wordSet, lastWord: lastWord, tokenize: tokenize, balance: balance,
             widths: widths, uneven: uneven, preview: preview, edits: edits,
             applyToString: applyToString, breaksFromStarts: breaksFromStarts, brBreaks: brBreaks };
})();

/* ===================================================================== */
/*  2. PARTIE ILLUSTRATOR / ILLUSTRATOR PART                             */
/* ===================================================================== */

function EL_isFr() {
    var loc = "";
    try { loc = String(app.locale || $.locale || ""); } catch (e) { loc = ""; }
    return loc.toLowerCase().indexOf("fr") === 0;
}

var EL_SMALL_DEFAULT = "à a au aux avec ce ces d de des du en et la le les l mais ni ou où par pour sa se ses si son sur un une y " +
    "an and as at but by for from in into of on or the to via with " +
    "في من على عن إلى مع";

var EL_T = EL_isFr() ? {
    title: "Équilibrer les lignes v1.0.0",
    noDoc: "Aucun document ouvert. Ouvrez un document puis relancez le script.",
    noSel: "Sélectionnez un ou plusieurs textes (titres, accroches, légendes), ou choisissez « Tout le document ».",
    shape: "Forme", sBal: "Lignes égales", sPyr: "Pyramide (1re ligne la plus courte)", sInv: "Pyramide inversée (1re ligne la plus longue)",
    lines: "Nombre de lignes :", lAuto: "Garder le nombre actuel",
    rules: "Règles de coupe",
    small: "Ne pas finir une ligne par un petit mot :",
    single: "Éviter une ligne d'un seul mot",
    hyph: "Couper aussi après un trait d'union (porte-avions)",
    recalc: "Recalculer les retours forcés déjà présents",
    scope: "Portée", scSel: "Sélection", scDoc: "Tout le document",
    maxL: "Seulement les paragraphes de 2 à", maxL2: "lignes",
    analyze: "Analyser", apply: "Équilibrer", strip: "Retirer les retours forcés", cancel: "Fermer",
    tip: "Conseil : travaillez sur une copie. Ctrl+Z / Cmd+Z annule (une ou plusieurs fois selon la version). Les espaces insécables et l'attribut « Sans retour à la ligne » sont respectés.",
    ready: "Réglez les options puis cliquez sur Analyser.",
    bad: "Valeur incorrecte : {f}.",
    none: "Aucun paragraphe à équilibrer dans la portée choisie.",
    sum: "{p} paragraphe(s) à équilibrer dans {f} texte(s). Irrégularité moyenne : {b} %  →  {a} %.",
    line: "{i}. {k} lignes, {b} % → {a} % : {t}",
    skipH: "Ignorés :",
    rLocked: "verrouillés ou masqués : {n}", rPath: "textes curvilignes : {n}", rThread: "textes liés ou en colonnes : {n}",
    rVert: "textes verticaux : {n}", rManual: "paragraphes déjà coupés à la main (option décochée) : {n}",
    rLong: "paragraphes trop longs : {n}", rFit: "aucune coupe ne tient dans la largeur du cadre : {n}",
    rStruct: "structure de texte inattendue : {n}", rShape: "forme impossible, lignes égales utilisées : {n}",
    more: "… et {n} autre(s).",
    done: "{p} paragraphe(s) équilibré(s) dans {f} texte(s).",
    check: "\n\nÀ vérifier (le nombre de lignes a changé, textes sélectionnés) : {n}.",
    stripped: "Retours forcés retirés : {n} dans {f} texte(s).",
    noStrip: "Aucun retour forcé à retirer.",
    working: "Mesure en cours…"
} : {
    title: "Balance lines v1.0.0",
    noDoc: "No document is open. Open a document and run the script again.",
    noSel: "Select one or more text objects (headlines, taglines, captions), or choose \"Whole document\".",
    shape: "Shape", sBal: "Equal lines", sPyr: "Pyramid (shortest first line)", sInv: "Inverted pyramid (longest first line)",
    lines: "Number of lines:", lAuto: "Keep the current number",
    rules: "Break rules",
    small: "Do not end a line with a small word:",
    single: "Avoid a one-word line",
    hyph: "Also break after a hyphen (long-term)",
    recalc: "Recompute forced line breaks already present",
    scope: "Scope", scSel: "Selection", scDoc: "Whole document",
    maxL: "Only paragraphs of 2 to", maxL2: "lines",
    analyze: "Analyze", apply: "Balance", strip: "Remove forced breaks", cancel: "Close",
    tip: "Tip: work on a copy. Ctrl+Z / Cmd+Z undoes it (once or several times depending on the version). Non-breaking spaces and the No Break attribute are respected.",
    ready: "Set the options, then click Analyze.",
    bad: "Invalid value: {f}.",
    none: "No paragraph to balance in the chosen scope.",
    sum: "{p} paragraph(s) to balance in {f} text object(s). Mean unevenness: {b} %  →  {a} %.",
    line: "{i}. {k} lines, {b} % → {a} %: {t}",
    skipH: "Skipped:",
    rLocked: "locked or hidden: {n}", rPath: "type on a path: {n}", rThread: "threaded or multi-column text: {n}",
    rVert: "vertical text: {n}", rManual: "paragraphs already broken by hand (option off): {n}",
    rLong: "paragraphs too long: {n}", rFit: "no break fits the frame width: {n}",
    rStruct: "unexpected text structure: {n}", rShape: "shape impossible, equal lines used: {n}",
    more: "… and {n} more.",
    done: "{p} paragraph(s) balanced in {f} text object(s).",
    check: "\n\nTo check (line count changed, text objects selected): {n}.",
    stripped: "Forced breaks removed: {n} in {f} text object(s).",
    noStrip: "No forced break to remove.",
    working: "Measuring…"
};

function EL_fill(s, o) { var k; for (k in o) s = s.split("{" + k + "}").join(o[k]); return s; }

/* Réglages mémorisés (fichier local) / remembered settings (local file) */
function EL_cfgFile() { return new File(Folder.userData + "/EquilibrerLignes.cfg"); }
function EL_loadCfg() {
    var c = { shape: "balanced", lines: "0", avoidSmall: "1", small: EL_SMALL_DEFAULT, avoidSingle: "1",
              hyphen: "0", recalc: "1", scope: "sel", maxLines: "6" };
    try {
        var f = EL_cfgFile();
        f.encoding = "UTF-8";
        if (f.exists && f.open("r")) {
            while (!f.eof) { var ln = f.readln(), p = ln.indexOf("="); if (p > 0) c[ln.substring(0, p)] = ln.substring(p + 1); }
            f.close();
        }
    } catch (e) {}
    return c;
}
function EL_saveCfg(c) {
    try { var f = EL_cfgFile(), k; f.encoding = "UTF-8"; if (f.open("w")) { for (k in c) f.writeln(k + "=" + c[k]); f.close(); } } catch (e) {}
}

/* Objet modifiable ? (remonte groupes et calques) / editable? (walks up groups and layers) */
function EL_editable(it) {
    var p = it;
    try {
        while (p && p.typename !== "Document") {
            if (p.typename === "Layer") { if (p.locked || !p.visible) return false; }
            else if (p.locked || p.hidden) return false;
            p = p.parent;
        }
    } catch (e) { return false; }
    return true;
}

/* Textes visés / target text frames */
function EL_frames(doc, scope) {
    var out = [], i;
    function walk(it) {
        if (!it) return;
        if (it.typename === "TextFrame") { out.push(it); return; }
        if (it.typename === "GroupItem") { for (var j = 0; j < it.pageItems.length; j++) walk(it.pageItems[j]); }
    }
    if (scope === "doc") {
        for (i = 0; i < doc.textFrames.length; i++) out.push(doc.textFrames[i]);
        return out;
    }
    var sel = doc.selection;
    if (!sel) return out;
    if (sel.typename === "TextRange") {
        try { var st = sel.story; for (i = 0; i < st.textFrames.length; i++) out.push(st.textFrames[i]); } catch (e) {}
        return out;
    }
    if (sel.length === undefined) return out;
    for (i = 0; i < sel.length; i++) walk(sel[i]);
    return out;
}

/* Mesure des largeurs avec un texte de point temporaire / width measuring with a temporary point text */
function EL_Meter(doc) {
    this.doc = doc; this.cache = {}; this.layer = null; this.tf = null;
}
EL_Meter.prototype.init = function () {
    if (this.tf) return;
    this.layer = this.doc.layers.add();
    this.layer.name = "__EquilibrerLignes_tmp";
    this.tf = this.layer.textFrames.add();
    this.tf.contents = "x";
};
EL_Meter.prototype.attrs = function (ch) {
    var a = ch.characterAttributes, r = {};
    r.font = a.textFont; r.size = a.size; r.tracking = a.tracking; r.hs = a.horizontalScale;
    try { r.caps = a.capitalization; } catch (e) { r.caps = null; }
    try { r.kern = a.kerningMethod; } catch (e2) { r.kern = null; }
    var fn = ""; try { fn = r.font.name; } catch (e3) {}
    r.key = fn + "|" + r.size + "|" + r.tracking + "|" + r.hs + "|" + r.caps + "|" + r.kern;
    return r;
};
EL_Meter.prototype.width = function (text, ch) {
    var a = this.attrs(ch), key = a.key + "|" + text;
    if (this.cache.hasOwnProperty(key)) return this.cache[key];
    this.init();
    var tf = this.tf;
    tf.contents = text;
    var ca = tf.textRange.characterAttributes;
    try { ca.textFont = a.font; } catch (e) {}
    ca.size = a.size; ca.tracking = a.tracking; ca.horizontalScale = a.hs;
    if (a.caps !== null) { try { ca.capitalization = a.caps; } catch (e2) {} }
    if (a.kern !== null) { try { ca.kerningMethod = a.kern; } catch (e3) {} }
    var w = tf.width;
    this.cache[key] = w;
    return w;
};
/* Largeur d'une espace = « n n » − « nn » / space width */
EL_Meter.prototype.space = function (ch) {
    return Math.max(0, this.width("n n", ch) - this.width("nn", ch));
};
EL_Meter.prototype.done = function () {
    try { if (this.layer) this.layer.remove(); } catch (e) {}
    this.layer = null; this.tf = null;
};

/* Largeur utile d'un texte captif / usable width of an area text */
function EL_areaWidth(tf) {
    var tp = tf.textPath, w = 0;
    try {
        var pp = tp.pathPoints;
        if (pp.length === 4) {
            var ang = 0;
            try { ang = Math.atan2(tf.matrix.mValueB, tf.matrix.mValueA); } catch (e) { ang = 0; }
            var best = -1, k;
            for (k = 0; k < 2; k++) {
                var p0 = pp[k].anchor, p1 = pp[k + 1].anchor, dx = p1[0] - p0[0], dy = p1[1] - p0[1];
                var len = Math.sqrt(dx * dx + dy * dy), sa = Math.atan2(dy, dx) - ang;
                var align = Math.abs(Math.cos(sa));
                if (align > best) { best = align; w = len; }
            }
        } else w = tp.width;
    } catch (e2) { try { w = tp.width; } catch (e3) { w = 0; } }
    try { w -= 2 * (tf.spacing || 0); } catch (e4) {}
    return w;
}

/* Débuts des lignes visibles (indices dans contents) / visible line starts */
function EL_lineStarts(tf, s) {
    var out = [], pos = 0, i;
    try {
        var ls = tf.lines;
        for (i = 0; i < ls.length; i++) {
            var lc = ls[i].contents;
            if (lc === "") continue;
            var p = s.indexOf(lc, pos);
            if (p < 0) return null;
            out.push(p); pos = p + lc.length;
        }
    } catch (e) { return null; }
    return out;
}

/* Prépare l'équilibrage d'un texte / plans one text frame */
function EL_planFrame(tf, st, meter, R) {
    var C = EL_CORE, BR = C.BR, res = { frame: tf, paras: [], area: false, lines: 0 };
    if (!EL_editable(tf)) { R.locked++; return null; }
    var kind = tf.kind;
    if (kind === TextType.PATHTEXT) { R.path++; return null; }
    try { if (tf.orientation === TextOrientation.VERTICAL) { R.vert++; return null; } } catch (e) {}
    var area = kind === TextType.AREATEXT;
    if (area) {
        var threaded = false;
        try { if (tf.nextFrame || tf.previousFrame) threaded = true; } catch (e2) {}
        try { if (tf.columnCount > 1) threaded = true; } catch (e3) {}
        if (threaded) { R.thread++; return null; }
    }
    var s = tf.contents, chars = tf.characters;
    if (chars.length !== s.length) { R.struct++; return null; }
    var starts = area ? EL_lineStarts(tf, s) : null;
    if (area && !starts) { R.struct++; return null; }
    var maxW = area ? EL_areaWidth(tf) : 0;
    res.area = area; res.lines = area ? starts.length : 0;
    var p0 = 0;
    while (p0 <= s.length) {
        var p1 = s.indexOf("\r", p0); if (p1 < 0) p1 = s.length;
        var para = s.substring(p0, p1), base = p0;
        p0 = p1 + 1;
        if (/^[\s\u0003]*$/.test(para)) { if (p1 >= s.length) break; continue; }
        var hasBr = para.indexOf(BR) >= 0;
        // Nombre de lignes actuel / current line count
        var cur, curStarts = [], i;
        if (area) {
            for (i = 0; i < starts.length; i++) if (starts[i] > base && starts[i] < base + para.length) curStarts.push(starts[i] - base);
        } else {
            for (i = 0; i < para.length; i++) if (para.charAt(i) === BR) curStarts.push(i + 1);
        }
        cur = curStarts.length + 1;
        if (cur > st.maxLines) { R.long++; if (p1 >= s.length) break; continue; }
        var k = st.lines > 0 ? st.lines : cur;
        if (k < 2) { if (p1 >= s.length) break; continue; }
        if (hasBr && !st.recalc) { R.manual++; if (p1 >= s.length) break; continue; }
        var tok = C.tokenize(para, { hyphen: st.hyphen, small: st.smallSet, noBreak: function (j) {
            var c = para.charAt(j);
            if (c !== " " && c !== "-") return false;
            try { return !!chars[base + j].characterAttributes.noBreak; } catch (e) { return false; }
        } });
        if (tok.units.length < 2) { if (p1 >= s.length) break; continue; }
        var W = [], G = [], sm = [], u, g;
        for (u = 0; u < tok.units.length; u++) {
            W.push(meter.width(tok.units[u].text, chars[base + tok.units[u].s]));
            sm.push(tok.units[u].small);
        }
        var wsF = 1;
        try { wsF = (chars[base + tok.lo].paragraphAttributes.desiredWordSpacing || 100) / 100; } catch (e4) { wsF = 1; }
        var mw = maxW;
        if (area) {
            try {
                var pa = chars[base + tok.lo].paragraphAttributes;
                mw -= (pa.leftIndent || 0) + (pa.rightIndent || 0) + Math.max(0, pa.firstLineIndent || 0);
            } catch (e5) {}
            mw -= 0.5;                       // marge de sécurité / safety margin
            if (mw <= 0) mw = 1;
        }
        for (g = 0; g < tok.gaps.length; g++) {
            var gp = tok.gaps[g];
            if (gp.type === "hyphen") { G.push(0); continue; }
            if (gp.br && gp.hyph) { G.push(0); continue; }
            var ref = para.charAt(gp.s) === " " ? chars[base + gp.s] : chars[base + gp.s - 1];
            G.push(meter.space(ref) * wsF);
        }
        var o = { k: k, shape: st.shape, maxWidth: area ? mw : 0, avoidSmall: st.avoidSmall, avoidSingle: st.avoidSingle };
        var r = C.balance(W, G, sm, o), shapeFallback = false;
        if (!r && st.shape !== "balanced") {
            o.shape = "balanced"; r = C.balance(W, G, sm, o);
            if (r) shapeFallback = true;
        }
        if (!r) { R.fit++; if (p1 >= s.length) break; continue; }
        if (shapeFallback) R.shape++;
        var curB = area ? C.breaksFromStarts(tok, curStarts) : C.brBreaks(tok);
        var before = C.widths(W, G, curB);
        var ed = C.edits(para, tok, r.breaks);
        res.paras.push({ base: base, k: r.widths.length, cur: cur, before: C.uneven(before), after: C.uneven(r.widths),
                         preview: C.preview(para, tok, r.breaks), edits: ed });
        if (p1 >= s.length) break;
    }
    return res.paras.length ? res : null;
}

function EL_plan(doc, st) {
    var R = { locked: 0, path: 0, thread: 0, vert: 0, manual: 0, long: 0, fit: 0, struct: 0, shape: 0 };
    var frames = EL_frames(doc, st.scope), plans = [], meter = new EL_Meter(doc), i;
    try {
        for (i = 0; i < frames.length; i++) {
            var p = null;
            try { p = EL_planFrame(frames[i], st, meter, R); } catch (e) { R.struct++; }
            if (p) plans.push(p);
        }
    } finally { meter.done(); }
    return { plans: plans, R: R, frames: frames.length };
}

function EL_report(res) {
    var T = EL_T, lines = [], n = 0, sb = 0, sa = 0, i, j, shown = 0;
    for (i = 0; i < res.plans.length; i++) for (j = 0; j < res.plans[i].paras.length; j++) {
        var p = res.plans[i].paras[j]; n++; sb += p.before; sa += p.after;
        if (shown < 25) {
            var t = p.preview.replace(/[\r\n\u0003]/g, " ");
            if (t.length > 120) t = t.substring(0, 117) + "…";
            lines.push(EL_fill(T.line, { i: n, k: p.k, b: Math.round(p.before), a: Math.round(p.after), t: t }));
            shown++;
        }
    }
    var head = n ? EL_fill(T.sum, { p: n, f: res.plans.length, b: Math.round(sb / n), a: Math.round(sa / n) }) : T.none;
    if (n > shown) lines.push(EL_fill(T.more, { n: n - shown }));
    var R = res.R, sk = [], keys = [["locked", "rLocked"], ["path", "rPath"], ["thread", "rThread"], ["vert", "rVert"],
        ["manual", "rManual"], ["long", "rLong"], ["fit", "rFit"], ["struct", "rStruct"], ["shape", "rShape"]];
    for (i = 0; i < keys.length; i++) if (R[keys[i][0]]) sk.push("• " + EL_fill(T[keys[i][1]], { n: R[keys[i][0]] }));
    return head + (lines.length ? "\n\n" + lines.join("\n") : "") + (sk.length ? "\n\n" + T.skipH + "\n" + sk.join("\n") : "");
}

/* Applique un plan / applies a plan. Retour : textes à vérifier / frames to check */
function EL_apply(res) {
    var check = [], i, j, e, paraCount = 0;
    for (i = 0; i < res.plans.length; i++) {
        var pl = res.plans[i], tf = pl.frame, chars = tf.characters, all = [], expected = pl.lines;
        for (j = 0; j < pl.paras.length; j++) {
            var p = pl.paras[j];
            for (e = 0; e < p.edits.length; e++) all.push({ i: p.base + p.edits[e].i, text: p.edits[e].text });
            expected += p.k - p.cur;
            paraCount++;
        }
        all.sort(function (a, b) { return b.i - a.i; });
        for (e = 0; e < all.length; e++) {
            var ch = chars[all[e].i];
            if (all[e].text === "") ch.remove(); else ch.contents = all[e].text;
        }
        // Texte captif : le nombre total de lignes doit être celui prévu (sinon retour à la ligne
        // automatique en plus, ou texte en excès) / area text: total line count must match the plan
        if (pl.area && expected > 0) {
            try {
                var st2 = EL_lineStarts(tf, tf.contents);
                if (!st2 || st2.length !== expected) check.push(tf);
            } catch (e7) { check.push(tf); }
        }
    }
    return { paras: paraCount, frames: res.plans.length, check: check };
}

/* Retire les retours forcés / removes forced breaks */
function EL_strip(doc, st) {
    var frames = EL_frames(doc, st.scope), n = 0, f = 0, i, j, BR = EL_CORE.BR;
    for (i = 0; i < frames.length; i++) {
        var tf = frames[i];
        if (!EL_editable(tf)) continue;
        var s = tf.contents;
        if (s.indexOf(BR) < 0 || tf.characters.length !== s.length) continue;
        var cnt = 0;
        for (j = s.length - 1; j >= 0; j--) {
            if (s.charAt(j) !== BR) continue;
            var prev = j > 0 ? s.charAt(j - 1) : "", next = j + 1 < s.length ? s.charAt(j + 1) : "";
            var ch = tf.characters[j];
            if (prev === " " || next === " " || prev === "\r" || next === "\r" || prev === "" || next === "" ||
                prev === "-" || prev === "\u2010" || prev === "\u2013" || prev === "\u2014") ch.remove();
            else ch.contents = " ";
            cnt++;
        }
        if (cnt) { n += cnt; f++; }
    }
    return { n: n, f: f };
}

/* Boîte de dialogue / dialog */
function EL_dialog(doc) {
    var T = EL_T, cfg = EL_loadCfg(), action = 0, chosen = null;
    var w = new Window("dialog", T.title);
    w.orientation = "column"; w.alignChildren = ["fill", "top"];

    var pS = w.add("panel", undefined, T.shape); pS.alignChildren = ["left", "top"];
    var rB = pS.add("radiobutton", undefined, T.sBal), rP = pS.add("radiobutton", undefined, T.sPyr), rI = pS.add("radiobutton", undefined, T.sInv);
    rB.value = cfg.shape === "balanced"; rP.value = cfg.shape === "pyramid"; rI.value = cfg.shape === "inverted";
    if (!rB.value && !rP.value && !rI.value) rB.value = true;
    var gL = pS.add("group"); gL.add("statictext", undefined, T.lines);
    var ddL = gL.add("dropdownlist", undefined, [T.lAuto, "2", "3", "4", "5", "6"]);
    var lv = parseInt(cfg.lines, 10); ddL.selection = (lv >= 2 && lv <= 6) ? lv - 1 : 0;

    var pR = w.add("panel", undefined, T.rules); pR.alignChildren = ["fill", "top"];
    var cSm = pR.add("checkbox", undefined, T.small); cSm.value = cfg.avoidSmall === "1";
    var eSm = pR.add("edittext", undefined, cfg.small); eSm.characters = 46;
    var cSi = pR.add("checkbox", undefined, T.single); cSi.value = cfg.avoidSingle === "1";
    var cHy = pR.add("checkbox", undefined, T.hyph); cHy.value = cfg.hyphen === "1";
    var cRe = pR.add("checkbox", undefined, T.recalc); cRe.value = cfg.recalc === "1";

    var pC = w.add("panel", undefined, T.scope); pC.orientation = "row"; pC.alignChildren = ["left", "center"];
    var rS = pC.add("radiobutton", undefined, T.scSel), rD = pC.add("radiobutton", undefined, T.scDoc);
    rS.value = cfg.scope !== "doc"; rD.value = cfg.scope === "doc";
    var gM = w.add("group"); gM.add("statictext", undefined, T.maxL);
    var eM = gM.add("edittext", undefined, cfg.maxLines); eM.characters = 3; gM.add("statictext", undefined, T.maxL2);

    var out = w.add("edittext", undefined, T.ready, { multiline: true, readonly: true, scrolling: true });
    out.preferredSize = [520, 170];
    var tip = w.add("statictext", undefined, T.tip, { multiline: true }); tip.preferredSize = [520, 34];

    var gB = w.add("group"); gB.alignment = ["right", "top"];
    var bA = gB.add("button", undefined, T.analyze), bR = gB.add("button", undefined, T.strip);
    var bO = gB.add("button", undefined, T.apply, { name: "ok" }), bX = gB.add("button", undefined, T.cancel, { name: "cancel" });

    function readSt() {
        var ml = parseInt(eM.text, 10);
        if (isNaN(ml) || ml < 2 || ml > 50) { alert(EL_fill(T.bad, { f: T.maxL + " … " + T.maxL2 })); return null; }
        var st = { shape: rP.value ? "pyramid" : (rI.value ? "inverted" : "balanced"),
                   lines: ddL.selection.index === 0 ? 0 : ddL.selection.index + 1,
                   avoidSmall: cSm.value, smallSet: EL_CORE.wordSet(eSm.text), avoidSingle: cSi.value,
                   hyphen: cHy.value, recalc: cRe.value, scope: rD.value ? "doc" : "sel", maxLines: ml };
        EL_saveCfg({ shape: st.shape, lines: String(st.lines), avoidSmall: st.avoidSmall ? "1" : "0", small: eSm.text,
                     avoidSingle: st.avoidSingle ? "1" : "0", hyphen: st.hyphen ? "1" : "0", recalc: st.recalc ? "1" : "0",
                     scope: st.scope, maxLines: String(ml) });
        return st;
    }
    bA.onClick = function () {
        var st = readSt(); if (!st) return;
        if (st.scope === "sel" && EL_frames(doc, "sel").length === 0) { out.text = T.noSel; return; }
        out.text = T.working;
        try { out.text = EL_report(EL_plan(doc, st)); } catch (e) { out.text = String(e); }
    };
    bR.onClick = function () { var st = readSt(); if (!st) return; chosen = st; action = 2; w.close(1); };
    bO.onClick = function () { var st = readSt(); if (!st) return; chosen = st; action = 1; w.close(1); };
    bX.onClick = function () { w.close(2); };
    w.show();
    return { action: action, st: chosen };
}

function EL_main() {
    if (app.documents.length === 0) { alert(EL_T.noDoc); return; }
    var doc = app.activeDocument;
    var d = EL_dialog(doc);
    if (!d.action || !d.st) return;
    var T = EL_T;
    if (d.st.scope === "sel" && EL_frames(doc, "sel").length === 0) { alert(T.noSel); return; }
    if (d.action === 2) {
        var s = EL_strip(doc, d.st);
        alert(s.n ? EL_fill(T.stripped, { n: s.n, f: s.f }) : T.noStrip);
        return;
    }
    var res = EL_plan(doc, d.st);
    if (!res.plans.length) { alert(EL_report(res)); return; }
    var a = EL_apply(res);
    var msg = EL_fill(T.done, { p: a.paras, f: a.frames });
    if (a.check.length) {
        msg += EL_fill(T.check, { n: a.check.length });
        try { doc.selection = null; for (var i = 0; i < a.check.length; i++) a.check[i].selected = true; } catch (e) {}
    }
    app.redraw();
    alert(msg + "\n\n" + EL_report(res));
}

if (typeof app !== "undefined" && typeof EL_NO_MAIN === "undefined") {
    try { EL_main(); } catch (err) { alert("EquilibrerLignes : " + err + (err.line ? " (l. " + err.line + ")" : "")); }
}
