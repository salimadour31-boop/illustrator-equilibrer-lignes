// Simulation des objets Illustrator (textes, caractères, lignes, mesure) — ne remplace pas un essai réel.
// Simulated Illustrator objects (text frames, characters, lines, measuring) — not a substitute for a real test.
var fs = require("fs"), vm = require("vm"), path = require("path");
var src = fs.readFileSync(path.join(__dirname, "..", "EquilibrerLignes.jsx"), "utf8");
var BR = "\u0003", pass = 0, fail = 0;
function ok(n, c, e) { if (c) { pass++; console.log("ok   " + n); } else { fail++; console.log("FAIL " + n + (e !== undefined ? " -> " + JSON.stringify(e) : "")); } }

// Modèle de chasse : lettre = 0,5 × corps, espace = 0,25 × corps, × échelle horizontale
function charW(c, a) { var w = (c === " ") ? 0.25 : (c === BR || c === "\r") ? 0 : 0.5; return w * a.size * a.horizontalScale / 100; }
function textW(s, a) { var w = 0; for (var i = 0; i < s.length; i++) w += charW(s.charAt(i), a); return w; }

var TextType = { POINTTEXT: 0, AREATEXT: 1, PATHTEXT: 2 }, TextOrientation = { HORIZONTAL: 0, VERTICAL: 1 };
function mkAttrs(o) { o = o || {}; return { textFont: { name: o.font || "Arial-BoldMT" }, size: o.size || 20, tracking: 0, horizontalScale: o.hs || 100, capitalization: 0, kerningMethod: 1, noBreak: false }; }

function mkDoc() {
    var doc = { typename: "Document", textFrames: [], layers: [], selection: [] };
    var layer = { typename: "Layer", locked: false, visible: true, parent: doc };
    doc.mainLayer = layer;
    doc.layers.add = function () {
        var L = { typename: "Layer", name: "", locked: false, visible: true, parent: doc, items: [] };
        L.textFrames = { add: function () {
            var t = { contents: "", textRange: { characterAttributes: mkAttrs() } };
            Object.defineProperty(t, "width", { get: function () { return textW(t.contents, t.textRange.characterAttributes); } });
            L.items.push(t); return t;
        } };
        L.remove = function () { doc.layers.splice(doc.layers.indexOf(L), 1); };
        doc.layers.push(L); return L;
    };
    return doc;
}

function mkFrame(doc, text, o) {
    o = o || {};
    var f = { typename: "TextFrame", kind: o.kind || TextType.POINTTEXT, locked: !!o.locked, hidden: false, parent: doc.mainLayer,
              orientation: TextOrientation.HORIZONTAL, nextFrame: null, previousFrame: null, columnCount: 1, spacing: 0,
              matrix: { mValueA: 1, mValueB: 0 }, _s: text, _a: mkAttrs(o), _noBreak: o.noBreak || {}, selected: false };
    Object.defineProperty(f, "contents", { get: function () { return f._s; }, set: function (v) { f._s = String(v).replace(/\n/g, "\r"); } });
    Object.defineProperty(f, "characters", { get: function () {
        var arr = { length: f._s.length };
        return new Proxy(arr, { get: function (t, k) {
            if (k === "length") return f._s.length;
            var i = +k;
            if (isNaN(i)) return undefined;
            return {
                get contents() { return f._s.charAt(i); },
                set contents(v) { f._s = f._s.substring(0, i) + String(v).replace(/\n/g, "\r") + f._s.substring(i + 1); },
                remove: function () { f._s = f._s.substring(0, i) + f._s.substring(i + 1); },
                characterAttributes: (function () { var a = Object.assign({}, f._a); a.noBreak = !!f._noBreak[i]; return a; })(),
                paragraphAttributes: { desiredWordSpacing: 100, leftIndent: 0, rightIndent: 0, firstLineIndent: 0 }
            };
        } });
    } });
    if (f.kind === TextType.AREATEXT) {
        var W = o.boxW; f._setW = function (v) { W = v; };
        f.textPath = { width: W, pathPoints: [{ anchor: [0, 0] }, { anchor: [W, 0] }, { anchor: [W, -200] }, { anchor: [0, -200] }] };
        // Habillage glouton comme un composeur ligne à ligne / greedy wrap
        Object.defineProperty(f, "lines", { get: function () {
            var out = [], paras = f._s.split("\r");
            paras.forEach(function (p, pi) {
                var segs = p.split(BR);
                segs.forEach(function (seg, si) {
                    var words = seg.split(" "), line = "";
                    words.forEach(function (w, wi) {
                        var cand = line === "" ? w : line + " " + w;
                        if (line !== "" && textW(cand, f._a) > W) { out.push(line + " "); line = w; } else line = cand;
                    });
                    out.push(line + (si < segs.length - 1 ? BR : ""));
                });
            });
            return out.filter(function (l) { return l !== ""; }).map(function (l) { return { contents: l }; });
        } });
    }
    doc.textFrames.push(f);
    return f;
}

function load(doc, locale) {
    var alerts = [];
    var ctx = {
        app: { locale: locale || "fr_FR", documents: { length: 1 }, activeDocument: doc, redraw: function () {} },
        $: { locale: locale || "fr_FR" }, TextType: TextType, TextOrientation: TextOrientation,
        Folder: { userData: "/tmp" }, File: function () { return { exists: false, open: function () { return false; } }; },
        alert: function (m) { alerts.push(m); }, EL_NO_MAIN: true
    };
    vm.createContext(ctx);
    vm.runInContext(src + "\nthis.EL_plan = EL_plan; this.EL_apply = EL_apply; this.EL_strip = EL_strip; this.EL_report = EL_report; this.EL_CORE = EL_CORE; this.EL_T = EL_T; this.EL_frames = EL_frames;", ctx);
    ctx.alerts = alerts;
    return ctx;
}
function st(o) {
    var base = { shape: "balanced", lines: 0, avoidSmall: true, smallSet: null, avoidSingle: true, hyphen: false, recalc: true, scope: "sel", maxLines: 6 };
    for (var k in o) base[k] = o[k];
    return base;
}

// 1. Texte de point, 2 lignes imposées / point text, 2 lines requested
var doc = mkDoc(), X = load(doc);
var tf = mkFrame(doc, "Le festival international du film de Marrakech");
doc.selection = [tf];
var s1 = st({ lines: 2, smallSet: X.EL_CORE.wordSet("le du de") });
var r = X.EL_plan(doc, s1);
ok("plan : 1 texte, 1 paragraphe", r.plans.length === 1 && r.plans[0].paras.length === 1, r.R);
ok("calque de mesure supprimé", doc.layers.length === 0);
var a = X.EL_apply(r);
ok("texte de point coupé en 2 lignes équilibrées", tf.contents === "Le festival international" + BR + "du film de Marrakech", tf.contents);

// 2. Texte de point, 1 ligne et « garder le nombre » -> rien / single line + keep -> nothing
doc = mkDoc(); X = load(doc);
tf = mkFrame(doc, "Une seule ligne ici"); doc.selection = [tf];
r = X.EL_plan(doc, st({ smallSet: {} }));
ok("1 ligne + nombre actuel : ignoré", r.plans.length === 0);

// 3. Texte captif : habillage glouton avec dernière ligne courte / area text with short last line
doc = mkDoc(); X = load(doc);
var txt = "Les nouvelles saveurs de la cuisine algérienne contemporaine";
tf = mkFrame(doc, txt, { kind: TextType.AREATEXT, boxW: 460, size: 20 });
doc.selection = [tf];
var before = tf.lines.map(function (l) { return l.contents; });
ok("habillage initial : 2 lignes déséquilibrées", before.length === 2, before);
r = X.EL_plan(doc, st({ smallSet: X.EL_CORE.wordSet("les de la") }));
var p = r.plans[0] && r.plans[0].paras[0];
ok("texte captif : 2 lignes, irrégularité réduite", p && p.k === 2 && p.after < p.before, p);
a = X.EL_apply(r);
var after = tf.lines.map(function (l) { return l.contents; });
ok("après : toujours 2 lignes, aucune à vérifier", after.length === 2 && a.check.length === 0, { after: after, check: a.check.length });
ok("après : coupe forcée insérée", tf.contents.indexOf(BR) > 0 && tf.contents.split(BR).length === 2, tf.contents);
var w0 = textW(tf.contents.split(BR)[0], tf._a), w1 = textW(tf.contents.split(BR)[1], tf._a);
ok("toutes les lignes tiennent dans le cadre", w0 <= 460 && w1 <= 460, [w0, w1]);

// 4. Pyramide sur 3 lignes / pyramid on 3 lines
doc = mkDoc(); X = load(doc);
tf = mkFrame(doc, "Grande exposition des arts graphiques et du design maghrébin"); doc.selection = [tf];
r = X.EL_plan(doc, st({ lines: 3, shape: "pyramid", avoidSmall: false, avoidSingle: false, smallSet: {} }));
X.EL_apply(r);
var ls = tf.contents.split(BR).map(function (l) { return textW(l, tf._a); });
ok("pyramide : 3 lignes croissantes", ls.length === 3 && ls[0] <= ls[1] && ls[1] <= ls[2], { c: tf.contents, w: ls });

// 5. Recalcul d'anciens retours forcés / recompute existing forced breaks
doc = mkDoc(); X = load(doc);
tf = mkFrame(doc, "Le festival" + BR + "international du film de Marrakech"); doc.selection = [tf];
r = X.EL_plan(doc, st({ smallSet: X.EL_CORE.wordSet("le du de") }));
X.EL_apply(r);
ok("ancien retour remplacé par le meilleur", tf.contents === "Le festival international" + BR + "du film de Marrakech", tf.contents);
doc = mkDoc(); X = load(doc);
tf = mkFrame(doc, "Le festival" + BR + "international du film"); doc.selection = [tf];
r = X.EL_plan(doc, st({ recalc: false, smallSet: {} }));
ok("option décochée : paragraphe coupé à la main ignoré", r.plans.length === 0 && r.R.manual === 1, r.R);

// 6. Plusieurs paragraphes : indices globaux corrects / several paragraphs: global indexes
doc = mkDoc(); X = load(doc);
tf = mkFrame(doc, "Premier titre assez long pour deux lignes\rSecond titre également très long ici"); doc.selection = [tf];
r = X.EL_plan(doc, st({ lines: 2, avoidSmall: false, smallSet: {} }));
X.EL_apply(r);
var ps = tf.contents.split("\r");
ok("2 paragraphes coupés chacun une fois", ps.length === 2 && ps[0].split(BR).length === 2 && ps[1].split(BR).length === 2, tf.contents);
ok("aucun caractère perdu (hors espaces remplacées)", tf.contents.replace(/\u0003/g, " ") === "Premier titre assez long pour deux lignes\rSecond titre également très long ici", tf.contents);

// 7. Verrouillé, curviligne, insécable / locked, path text, no-break
doc = mkDoc(); X = load(doc);
var tL = mkFrame(doc, "Texte verrouillé assez long ici", { locked: true });
var tP = mkFrame(doc, "Texte sur un tracé assez long", { kind: TextType.PATHTEXT });
var tN = mkFrame(doc, "aa bb cc dd", { noBreak: { 2: true, 8: true } });
doc.selection = [tL, tP, tN];
r = X.EL_plan(doc, st({ lines: 2, avoidSmall: false, avoidSingle: false, smallSet: {} }));
ok("verrouillé et curviligne ignorés", r.R.locked === 1 && r.R.path === 1, r.R);
X.EL_apply(r);
ok("Sans retour à la ligne respecté", tN.contents === "aa bb" + BR + "cc dd", tN.contents);

// 8. Paragraphe trop long en portée document / too-long paragraph, document scope
doc = mkDoc(); X = load(doc);
var long = []; for (var i = 0; i < 80; i++) long.push("mot" + i);
var tA = mkFrame(doc, long.join(" "), { kind: TextType.AREATEXT, boxW: 200, size: 10 });
r = X.EL_plan(doc, st({ scope: "doc", smallSet: {} }));
ok("texte courant (> 6 lignes) ignoré", r.plans.length === 0 && r.R.long === 1, r.R);

// 9. Largeur impossible / impossible width
doc = mkDoc(); X = load(doc);
tf = mkFrame(doc, "Anticonstitutionnellement extraordinairement", { kind: TextType.AREATEXT, boxW: 200, size: 20 });
doc.selection = [tf];
r = X.EL_plan(doc, st({ lines: 0, smallSet: {} }));
ok("mots plus larges que le cadre : signalé", r.plans.length === 0 && r.R.fit === 1, { R: r.R, lines: tf.lines.length });

// 10. Retirer les retours forcés / strip forced breaks
doc = mkDoc(); X = load(doc);
tf = mkFrame(doc, "Le festival" + BR + "international porte-" + BR + "avions"); doc.selection = [tf];
var sres = X.EL_strip(doc, st({}));
ok("retours forcés retirés (espace ou rien après trait d'union)", tf.contents === "Le festival international porte-avions" && sres.n === 2, tf.contents);

// 11. Rapport et textes FR/EN / report and FR/EN strings
doc = mkDoc(); X = load(doc);
tf = mkFrame(doc, "Le festival international du film de Marrakech"); doc.selection = [tf];
var rep = X.EL_report(X.EL_plan(doc, st({ lines: 2, smallSet: {} })));
ok("rapport FR lisible", /1 paragraphe\(s\) à équilibrer/.test(rep) && / \/ /.test(rep), rep);
var XE = load(mkDoc(), "en_US");
ok("dialogue anglais", XE.EL_T.apply === "Balance" && X.EL_T.apply === "Équilibrer");

// 12. Sélection en mode texte / text-editing selection
doc = mkDoc(); X = load(doc);
tf = mkFrame(doc, "abc def");
doc.selection = { typename: "TextRange", story: { textFrames: [tf] } };
ok("sélection de texte -> son cadre", X.EL_frames(doc, "sel").length === 1);

// 13. Nombre de lignes changé après application -> à vérifier / line count changed -> flagged
doc = mkDoc(); X = load(doc);
tf = mkFrame(doc, txt, { kind: TextType.AREATEXT, boxW: 460, size: 20 }); doc.selection = [tf];
r = X.EL_plan(doc, st({ smallSet: {} }));
tf._setW(250);   // simule une mesure trop optimiste / simulates an over-optimistic measurement
a = X.EL_apply(r);
ok("ligne en trop détectée : texte à vérifier", a.check.length === 1, tf.lines.map(function (l) { return l.contents; }));

console.log("\n" + pass + " ok, " + fail + " échec(s)");
process.exit(fail ? 1 : 0);
